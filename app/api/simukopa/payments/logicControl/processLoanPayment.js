// processLoanPayment — records an M-Pesa (or any) payment against a LOAN
// (this app's own `loans`/`payments` tables), maps it to the loan + client
// via BillRefNumber, updates the loan's balance and the linked
// application's next_billing_date, and SMS's the client a confirmation.
//
// This is a SERVER-side helper (plain Node, no 'use client'/React) — the
// naming mirrors app/simukopa/payments/logicControl/actionsRegistry.js
// (that one wires UI buttons; this one is meant to be called from route
// handlers like smartpaymentipn/route.js, after that flow's own generic
// smart_payments/smart_payment_requests handling has run).
//
// Deliberately separate from smart_payments/smart_payment_requests: an
// M-Pesa paybill can receive payments for things OTHER than a loan
// repayment (any smart_payment_request), so this matches BillRefNumber
// against loans.loan_id independently and no-ops (never throws) when
// nothing matches, so it's always safe to call unconditionally after
// every IPN.

import {
  magicRandomStr,
  mosyFlexQuickSel,
  mosySqlInsert,
  mosySqlUpdate,
} from '../../../apiUtils/dataControl/dataUtils';
import { mosySendSMS } from '../../../apiUtils/dataControl/send-sms';

function esc(val = '') {
  return String(val).replace(/'/g, "''");
}

function formatDateOnly(d) {
  return new Date(d).toISOString().split('T')[0];
}

function formatDateTime(d) {
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

// Advances a date by one billing cycle — loans.payment_frequency is
// 'daily'|'weekly'|'monthly' (DB default 'monthly'), see create_table_.txt.
function advanceByFrequency(fromDate, frequency) {
  const d = new Date(fromDate);
  switch (String(frequency || '').toLowerCase()) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    default: // monthly
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return formatDateOnly(d);
}

/**
 * @param {object} opts
 * @param {string} opts.billRefNumber - M-Pesa "Account Number" — matched
 *   against loans.loan_id (the human-readable LNxxxxxxx code), NOT
 *   loans.record_id.
 * @param {number|string} opts.amount - amount paid this transaction.
 * @param {string} [opts.transactionCode] - M-Pesa TransID, stored as
 *   payments.transaction_reference.
 * @param {string} [opts.paymentMethod] - default 'M-Pesa'.
 * @returns {Promise<{ok:boolean, reason?:string, [key:string]:any}>}
 *   ok:false + reason:'missing_bill_ref'|'no_matching_loan' are expected,
 *   routine outcomes (not every IPN is a loan repayment) — callers should
 *   treat them as "nothing to do", not an error.
 */
export async function processLoanPayment({
  billRefNumber,
  amount,
  transactionCode,
  paymentMethod = 'M-Pesa',
}) {
  if (!billRefNumber) return { ok: false, reason: 'missing_bill_ref' };

  const loan = await mosyFlexQuickSel(
    'loans',
    '*',
    `WHERE loan_id='${esc(billRefNumber)}' ORDER BY primkey DESC LIMIT 1`,
    'r'
  );
  if (!loan) return { ok: false, reason: 'no_matching_loan' };

  const client = await mosyFlexQuickSel(
    'clients',
    '*',
    `WHERE record_id='${esc(loan.client_id)}' LIMIT 1`,
    'r'
  );

  const amountPaid = Number(amount) || 0;
  const nowStr = formatDateTime(new Date());

  // 1) Insert the payments row — client_id/loan_id are the REAL FK values
  // (loans.record_id, clients.record_id), same convention every other
  // module in this app uses.
  const paymentRecordId = magicRandomStr(9);
  const paymentInsertFields = {
    record_id: '?', payment_id: '?', client_id: '?', loan_id: '?',
    payment_method: '?', amount: '?', currency: '?',
    transaction_reference: '?', payment_date: '?', status: '?',
    notes: '?', reg_date: '?', hive_site_id: '?', hive_site_name: '?',
  };
  const paymentInsertBody = {
    record_id: paymentRecordId,
    payment_id: `PMT${magicRandomStr(7)}`,
    client_id: loan.client_id,
    loan_id: loan.record_id,
    payment_method: paymentMethod,
    amount: String(amountPaid),
    currency: 'KES',
    transaction_reference: String(transactionCode || ''),
    payment_date: nowStr,
    status: 'completed',
    notes: `Auto-recorded from M-Pesa IPN (BillRefNumber: ${billRefNumber})`,
    reg_date: nowStr,
    hive_site_id: loan.hive_site_id,
    hive_site_name: loan.hive_site_name,
  };
  await mosySqlInsert('payments', paymentInsertFields, paymentInsertBody);

  // 2) Pay down the loan's balance.
  const newBalance = Math.max((Number(loan.balance_amount) || 0) - amountPaid, 0);
  await mosySqlUpdate(
    'loans',
    { balance_amount: '?' },
    { balance_amount: String(newBalance) },
    `primkey='${loan.primkey}'`
  );

  // 3) Advance the linked application's next_billing_date, one cycle from
  // whatever it currently is (falls back to today if it was never set).
  let nextBillingDate = null;
  if (loan.application_id) {
    const application = await mosyFlexQuickSel(
      'loan_applications',
      '*',
      `WHERE record_id='${esc(loan.application_id)}' LIMIT 1`,
      'r'
    );
    if (application?.primkey) {
      nextBillingDate = advanceByFrequency(
        application.next_billing_date || new Date(),
        loan.payment_frequency
      );
      await mosySqlUpdate(
        'loan_applications',
        { next_billing_date: '?' },
        { next_billing_date: nextBillingDate },
        `primkey='${application.primkey}'`
      );
    }
  }

  // 4) Notify the client — best-effort, never fails the caller's flow.
  const clientPhone = String(client?.phone_number || '').trim();
  let smsResult = null;
  if (clientPhone) {
    const message =
      `Payment received for account ${loan.loan_id}. ` +
      `Amount: KES ${amountPaid.toLocaleString()}. Ref: ${transactionCode || 'N/A'}. ` +
      `Balance: KES ${newBalance.toLocaleString()}.` +
      (nextBillingDate ? ` Next billing date: ${nextBillingDate}.` : '') +
      ` Thank you for choosing us.`;
    try {
      smsResult = await mosySendSMS(clientPhone, message);
    } catch (smsErr) {
      console.error('processLoanPayment: SMS send failed:', smsErr);
    }
  }

  return {
    ok: true,
    paymentRecordId,
    loanRecordId: loan.record_id,
    loanId: loan.loan_id,
    clientId: loan.client_id,
    balance: newBalance,
    nextBillingDate,
    smsResult,
  };
}
