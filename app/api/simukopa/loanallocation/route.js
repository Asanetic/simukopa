import { connectDB } from '../../apiUtils/dataControl/conn';
import { magicRandomStr } from '../../apiUtils/dataControl/dataUtils';
import { processAuthToken } from '../../auth/authManager';
import { sendUtilMessage } from '../commscontrol/messages/send-util-message';

// The one atomic "sell a device on financing" transaction: customer +
// device + loan plan in, an ACTIVE loan + installment schedule + deposit
// payment + device allocation out. No application/approval stage exists —
// see the loan allocation spec. Everything here runs inside a single
// mysql2 transaction; any failure rolls back the whole thing.

class UserError extends Error {}

const UNAVAILABLE_STATUSES = ['allocated', 'damaged', 'returned', 'retired', 'sold'];

function nairobiDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
}

function kes(amount) {
  return `KES ${(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeFrequency(freq) {
  const f = String(freq || '').trim().toUpperCase();
  return ['DAILY', 'WEEKLY', 'MONTHLY'].includes(f) ? f : 'DAILY';
}

function addInterval(date, frequency) {
  const d = new Date(date);
  if (frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (frequency === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 1);
  return d;
}

// One centralized schedule builder — every installment date on this
// system comes from here, never computed ad hoc per page (spec section 11).
function buildInstallmentSchedule({ startDate, frequency, durationMonths, installmentAmount }) {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Number(durationMonths || 0));

  const schedule = [];
  let cursor = addInterval(startDate, frequency);
  let n = 1;
  while (cursor <= endDate) {
    schedule.push({ installment_number: n, due_date: nairobiDateStr(cursor), amount: installmentAmount });
    cursor = addInterval(cursor, frequency);
    n += 1;
  }
  return schedule;
}

export async function POST(request) {
  const { valid, reason, data: authData } = processAuthToken(request);
  if (!valid) {
    return Response.json({ status: 'unauthorized', message: reason }, { status: 403 });
  }

  let body = {};
  try { body = await request.json(); } catch { /* empty body handled below */ }

  const { customer_id, device_id, loan_plan_id, payment_method = 'cash', transaction_reference = '' } = body;
  if (!customer_id || !device_id || !loan_plan_id) {
    return Response.json({ status: 'error', success: false, message: 'Customer, device and loan plan are all required.' }, { status: 400 });
  }

  const conn = await connectDB();

  try {
    await conn.beginTransaction();

    const [clientRows] = await conn.execute(
      'SELECT record_id, first_name, last_name, phone_number, hive_site_id, hive_site_name FROM clients WHERE record_id=? LIMIT 1',
      [customer_id]
    );
    if (!clientRows.length) throw new UserError('Customer could not be found.');
    const client = clientRows[0];

    // Row lock — re-checked here, inside the transaction, because a
    // frontend "available" list can be stale by the time this request
    // lands (spec section 19: two staff picking the same device).
    const [phoneRows] = await conn.execute('SELECT * FROM phones WHERE record_id=? FOR UPDATE', [device_id]);
    if (!phoneRows.length) throw new UserError('Device could not be found.');
    const phone = phoneRows[0];
    if (UNAVAILABLE_STATUSES.includes(String(phone.status || '').toLowerCase())) {
      throw new UserError('This device is no longer available.');
    }

    const [planRows] = await conn.execute('SELECT * FROM loan_plans WHERE record_id=? LIMIT 1', [loan_plan_id]);
    if (!planRows.length) throw new UserError('Loan plan could not be found.');
    const plan = planRows[0];
    //if (!plan.is_active) throw new UserError('This loan plan is no longer active.');

    // ---- the loan plan is the source of truth for every financial value ----
    const frequency = normalizeFrequency(plan.repayment_frequency);
    const depositAmount = Number(plan.deposit_amount) || 0;
    const installmentAmount = Number(plan.installment_amount) || 0;
    const durationMonths = Number(plan.duration_count) || 0;
    const startDate = new Date();
    const nowStr = nairobiDateStr(startDate);

    const schedule = buildInstallmentSchedule({ startDate, frequency, durationMonths, installmentAmount });
    if (!schedule.length) throw new UserError('This loan plan has no repayment schedule configured.');

    // total_amount is purely installment x number of periods produced by
    // the schedule (which already accounts for frequency/duration) — the
    // deposit is a separate upfront payment, not part of the financed total.
    const totalRepayment = schedule.length * installmentAmount;
    const principalAmount = Number(plan.device_cost_price) || Number(phone.selling_price) || 0;
    const totalAmount = totalRepayment;
    const endDateStr = schedule[schedule.length - 1].due_date;

    const actorId = authData?.record_id || authData?.username || 'system';
    const siteId = authData?.hive_site_id || client.hive_site_id;
    const siteName = authData?.hive_site_name || client.hive_site_name;

    // Single record id generated once and cascaded as the FK/record_id
    // across every table this transaction touches — it also doubles as
    // the application_id and contract_number, so a customer can pay
    // quoting their loan id, contract number, or application id and it's
    // always the exact same number.
    const loanRecordId = magicRandomStr(9);
    const nextBillingDateStr = nairobiDateStr(addInterval(startDate, frequency));

    await conn.execute(`
      INSERT INTO loan_applications (record_id, application_id, client_id, phone_id, model_id, product_id,
        requested_amount, deposit_amount, application_date, approval_date, approved_amount, rejection_reason,
        status, reviewed_by, notes, reg_date, hive_site_id, hive_site_name, next_billing_date)
      VALUES (?,?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,?,NOW(),?,?,?)
    `, [
      loanRecordId, loanRecordId, client.record_id, phone.record_id, null, plan.record_id,
      totalAmount, depositAmount, totalAmount, null,
      'approved', actorId, 'Approved automatically at device financing (loan allocation).',
      siteId, siteName, nextBillingDateStr,
    ]);

    await conn.execute(`
      INSERT INTO loans (record_id, client_id, phone_id, model_id, product_id, contract_number,
        principal_amount, interest_amount, processing_fee, penalty_amount, total_amount, deposit_amount, balance_amount,
        start_date, end_date, payment_frequency, installment_amount, status, default_status, notes, approved_by,
        reg_date, hive_site_id, hive_site_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?)
    `, [
      loanRecordId, client.record_id, phone.record_id, null, plan.record_id, loanRecordId,
      principalAmount, Math.max(totalRepayment - principalAmount, 0), 0, 0, totalAmount, depositAmount, totalRepayment,
      nowStr, endDateStr, frequency, installmentAmount, 'active', 'current', null, actorId,
      siteId, siteName,
    ]);

    // Bulk insert every installment in one round trip.
    const installmentRows = schedule.map((inst) => [
      magicRandomStr(9), `${loanRecordId}-${inst.installment_number}`, loanRecordId, client.record_id,
      inst.installment_number, inst.due_date, 0, 0, 0, 0, inst.amount, 0, inst.amount, 'pending', nowStr, siteId, siteName,
    ]);
    await conn.query(`
      INSERT INTO loan_installments (record_id, installment_id, loan_id, client_id, installment_number, due_date,
        principal_amount, interest_amount, fee_amount, penalty_amount, total_amount, paid_amount, balance_amount,
        status, reg_date, hive_site_id, hive_site_name)
      VALUES ?
    `, [installmentRows]);

    const paymentRecordId = magicRandomStr(9);
    await conn.execute(`
      INSERT INTO payments (record_id, payment_id, client_id, loan_id, installment_id, payment_method, amount, currency,
        transaction_reference, external_reference, payment_date, allocated_amount, unallocated_amount, status, notes,
        created_by, reg_date, hive_site_id, hive_site_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),?,?,?,?,?,NOW(),?,?)
    `, [
      paymentRecordId, `PMT${magicRandomStr(7)}`, client.record_id, loanRecordId, null, payment_method, depositAmount, 'KES',
      transaction_reference || null, null, depositAmount, 0, 'completed', 'Deposit for device financing',
      actorId, siteId, siteName,
    ]);

    const allocationRecordId = magicRandomStr(9);
    await conn.execute(`
      INSERT INTO device_allocations (record_id, phone_id, client_id, loan_id, allocation_date, handover_date, return_date,
        condition_at_handover, condition_at_return, status, notes, allocated_by, reg_date, hive_site_id, hive_site_name,
        plan, deposited_amount, last_payment, device_status, buying_price, selling_price)
      VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,NOW(),?,?,?,?,?,?,?,?)
    `, [
      allocationRecordId, phone.record_id, client.record_id, loanRecordId, null, null,
      phone.condition_status || 'new', null, 'allocated', null, actorId,
      siteId, siteName, plan.plan_name, String(depositAmount), nowStr, 'allocated',
      // buying_price = what the business paid for this unit; selling_price
      // = what the customer is being financed for it — both varchar
      // columns on this table (device_allocations), not decimals.
      String(phone.purchase_price || principalAmount || 0), String(phone.selling_price || totalAmount || 0),
    ]);

    // The real concurrency guard: only succeeds if the device is STILL
    // available at write time, not just when the picker list was fetched.
    const [updateResult] = await conn.execute(`
      UPDATE phones SET status='allocated', assigned_client_id=?, assigned_loan_id=?, allocated_date=CURDATE()
      WHERE record_id=? AND LOWER(status) NOT IN (${UNAVAILABLE_STATUSES.map(() => '?').join(',')})
    `, [client.record_id, loanRecordId, phone.record_id, ...UNAVAILABLE_STATUSES]);
    if (updateResult.affectedRows === 0) {
      throw new UserError('This device is no longer available.');
    }

    await conn.execute(`
      INSERT INTO audit_logs (record_id, audit_id, user_id, action, module, record_reference, old_data, new_data,
        ip_address, description, reg_date, hive_site_id, hive_site_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),?,?)
    `, [
      magicRandomStr(9), `AUD${magicRandomStr(7)}`, actorId, 'CREATE_LOAN', 'LOAN_ALLOCATION', loanRecordId, null,
      JSON.stringify({ loan_id: loanRecordId, client_id: client.record_id, phone_id: phone.record_id, plan_id: plan.record_id, deposit: depositAmount }),
      request.headers.get('x-forwarded-for') || '',
      `Created loan ${loanRecordId} for ${[client.first_name, client.last_name].filter(Boolean).join(' ')}`,
      siteId, siteName,
    ]);

    await conn.commit();

    // Best-effort SMS — the loan is already committed at this point, so a
    // messaging failure (bad number, gateway down) must never look like
    // the financing itself failed. sendUtilMessage also logs the attempt
    // to smart_messages regardless of delivery outcome.
    let smsResult = null;
    if (client.phone_number) {
      smsResult = await sendUtilMessage({
        auth: authData || {},
        payload: {
          channel: 'sms',
          related_record_id: client.record_id,
          recipient_name: [client.first_name, client.last_name].filter(Boolean).join(' '),
          recipient_phone: client.phone_number,
          message_content:
            `Hi ${client.first_name || ''}, your financing for ${plan.plan_name} is now ACTIVE. \n` +
            `Deposit paid: ${kes(depositAmount)}. ${frequency.toLowerCase()} payment: ${kes(installmentAmount)}. ` +
            `\nLoan ref: ${loanRecordId}. Thank you for choosing us.`,
          request_source: 'loan_allocation',
        },
      }).catch((err) => {
        console.error('loanallocation SMS failed:', err);
        return { success: false, message: err.message };
      });
    }

    return Response.json({
      status: 'success',
      success: true,
      message: 'Loan created successfully',
      loan: {
        id: loanRecordId, loan_id: loanRecordId, status: 'active',
        customer_id: client.record_id, device_id: phone.record_id, loan_plan_id: plan.record_id,
        application_id: loanRecordId,
        deposit_amount: depositAmount, installment_amount: installmentAmount,
        repayment_frequency: frequency, duration_count: durationMonths, total_amount: totalAmount,
      },
      application: { id: loanRecordId, status: 'approved' },
      allocation: { id: allocationRecordId, status: 'allocated' },
      payment: { id: paymentRecordId, amount: depositAmount },
      installments_created: schedule.length,
      sms: smsResult ? { sent: !!smsResult.success, message: smsResult.message } : { sent: false, message: 'No phone number on file' },
    });
  } catch (err) {
    await conn.rollback();
    const isUserError = err instanceof UserError;
    if (!isUserError) console.error('loanallocation failed:', err);
    return Response.json(
      { status: 'error', success: false, message: isUserError ? err.message : 'The transaction was not completed.' },
      { status: isUserError ? 409 : 500 }
    );
  } finally {
    await conn.end();
  }
}
