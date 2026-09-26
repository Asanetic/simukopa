import { mosySmartSelect, toNum } from '../../../apiUtils/dataControl/dataUtils';
import { processAuthToken } from '../../../auth/authManager';

// Consolidated payload for the SimuKopa dashboard (customers/inventory,
// loans, payments, recent loans). One request, backend-aggregated — see
// dashboard/admin/route.js for the same safeSelect/site-scoping pattern.

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function last6MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return keys;
}
function nairobiDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
}

const UNAVAILABLE_STATUSES = ['allocated', 'damaged', 'returned', 'retired', 'sold'];

export async function GET(request) {
  const { valid: isTokenValid, reason: tokenError, data: authData } = processAuthToken(request);
  if (!isTokenValid) {
    return Response.json({ status: 'unauthorized', message: tokenError }, { status: 403 });
  }

  const isSuperadmin = !authData?.hive_site_id;
  const { searchParams } = new URL(request.url);
  const requestedSite = searchParams.get('hive_site_id') || '';
  const siteFilterId = isSuperadmin ? requestedSite : authData.hive_site_id;

  function site(tbl) {
    if (!siteFilterId) return '1=1';
    const safe = String(siteFilterId).replace(/'/g, "\\'");
    return `${tbl}.hive_site_id='${safe}'`;
  }

  async function safeSelect(sql, fallback = []) {
    try {
      return await mosySmartSelect(sql);
    } catch (err) {
      console.error('dashboard/main query failed:', err.message, '\nSQL:', sql);
      return fallback;
    }
  }

  const today = nairobiDateStr(new Date());
  const sixAgo = new Date();
  sixAgo.setMonth(sixAgo.getMonth() - 5);
  sixAgo.setDate(1);
  const sixAgoStr = sixAgo.toISOString().slice(0, 10);

  // "Available" excludes damaged/returned/retired/sold/already-allocated
  // stock, not just "everything not allocated" (spec: don't assume
  // unallocated = inventory - allocated).
  const unavailableList = UNAVAILABLE_STATUSES.filter((s) => s !== 'allocated').map((s) => `'${s}'`).join(',');

  const [
    customers, inventory, allocated, unallocated,
    loans, paid, active, overdue,
    loanPerformance, paymentsPerMonth, paymentsPerPlan, recentLoans,
  ] = await Promise.all([
    safeSelect(`SELECT COUNT(*) AS value FROM clients WHERE ${site('clients')}`),
    safeSelect(`SELECT COUNT(*) AS value FROM phones WHERE ${site('phones')}`),
    safeSelect(`SELECT COUNT(*) AS value FROM phones WHERE ${site('phones')} AND LOWER(status)='allocated'`),
    safeSelect(`SELECT COUNT(*) AS value FROM phones WHERE ${site('phones')} AND LOWER(status) NOT IN ('allocated',${unavailableList})`),

    safeSelect(`SELECT COUNT(*) AS value FROM loans WHERE ${site('loans')}`),
    safeSelect(`SELECT COUNT(*) AS value FROM loans WHERE ${site('loans')} AND balance_amount<=0`),
    safeSelect(`SELECT COUNT(*) AS value FROM loans WHERE ${site('loans')} AND LOWER(status)='active' AND balance_amount>0`),
    // Overdue = outstanding balance AND a genuinely past-due installment (spec's explicit rule, not "old loan = overdue").
    safeSelect(`
      SELECT COUNT(DISTINCT loans.record_id) AS value FROM loans
      JOIN loan_installments ON loan_installments.loan_id = loans.record_id AND loan_installments.balance_amount>0 AND loan_installments.due_date < '${today}'
      WHERE ${site('loans')} AND loans.balance_amount>0
    `),

    safeSelect(`
      SELECT DATE_FORMAT(loans.reg_date,'%Y-%m') AS label,
        COUNT(*) AS loans,
        SUM(CASE WHEN LOWER(loans.status)='active' AND loans.balance_amount>0 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN loans.balance_amount<=0 THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN loans.balance_amount>0 AND loans.record_id IN (
          SELECT loan_id FROM loan_installments WHERE balance_amount>0 AND due_date < '${today}'
        ) THEN 1 ELSE 0 END) AS overdue
      FROM loans
      WHERE ${site('loans')} AND loans.reg_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(payment_date,'%Y-%m') AS label, COALESCE(SUM(amount),0) AS value
      FROM payments
      WHERE ${site('payments')} AND status='completed' AND payment_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT loan_plans.plan_name AS label, COALESCE(SUM(payments.amount),0) AS value
      FROM payments
      JOIN loans ON loans.record_id = payments.loan_id
      JOIN loan_plans ON loan_plans.record_id = loans.product_id
      WHERE ${site('payments')} AND payments.status='completed'
      GROUP BY loan_plans.record_id, loan_plans.plan_name
      ORDER BY value DESC
      LIMIT 10
    `),
    safeSelect(`
      SELECT loans.total_amount AS amount, loans.deposit_amount AS deposit, loans.status AS status,
        COALESCE(loans.start_date, loans.reg_date) AS loan_date,
        clients.first_name AS first_name, clients.last_name AS last_name,
        phones.brand_name AS brand_name, phones.model_name AS model_name,
        loan_plans.plan_name AS plan_name
      FROM loans
      LEFT JOIN clients ON clients.record_id = loans.client_id
      LEFT JOIN phones ON phones.record_id = loans.phone_id
      LEFT JOIN loan_plans ON loan_plans.record_id = loans.product_id
      WHERE ${site('loans')}
      ORDER BY loans.reg_date DESC
      LIMIT 10
    `),
  ]);

  const val = (rows) => Number(rows?.[0]?.value || 0);
  const months = last6MonthKeys();
  const seriesMap = (rows, keys) => {
    const map = Object.fromEntries((rows || []).map((r) => [r.label, r]));
    return months.map((label) => {
      const r = map[label] || {};
      const out = { label };
      keys.forEach((k) => { out[k] = Number(r[k] || 0); });
      return out;
    });
  };

  return Response.json({
    status: 'success',
    message: 'Dashboard ready!',
    is_superadmin: isSuperadmin,
    selected_site: siteFilterId || null,

    summary: {
      customers: val(customers),
      inventory: val(inventory),
      allocated: val(allocated),
      unallocated: val(unallocated),
      loans: val(loans),
      paid: val(paid),
      active: val(active),
      overdue: val(overdue),
    },

    loanPerformance: seriesMap(loanPerformance, ['loans', 'active', 'paid', 'overdue']),
    paymentsPerMonth: seriesMap(paymentsPerMonth, ['value']).map((r) => ({ label: r.label, value: r.value })),
    paymentsPerPlan: (paymentsPerPlan || []).map((r) => ({ label: r.label || 'Unassigned', value: Number(r.value) || 0 })),

    recentLoans: (recentLoans || []).map((r) => ({
      customer: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
      device: [r.brand_name, r.model_name].filter(Boolean).join(' ') || '—',
      plan: r.plan_name || '—',
      amount: toNum(r.amount, 0),
      deposit: toNum(r.deposit, 0),
      status: r.status || 'pending',
      date: r.loan_date,
    })),
  });
}
