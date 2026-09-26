import { mosySmartSelect, toNum } from '../../../apiUtils/dataControl/dataUtils';
import { processAuthToken } from '../../../auth/authManager';

// Every query is wrapped in safeSelect() so one bad table/column empties
// that one number/chart/table instead of 500-ing the whole page.

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function last6MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

const STAGE_ORDER = ['new', 'contacted', 'quoted', 'won', 'lost'];

export async function GET(request) {
  const { valid: isTokenValid, reason: tokenError, data: authData } =
    processAuthToken(request);

  if (!isTokenValid) {
    return Response.json(
      { status: 'unauthorized', message: tokenError },
      { status: 403 }
    );
  }

  // No role check — a token with an empty hive_site_id is treated as a
  // Superadmin (aggregate view + site-picker); every other token is a
  // tenant user pinned to its own hive_site_id.
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
      console.error('dashboard/admin query failed:', err.message, '\nSQL:', sql);
      return fallback;
    }
  }

  const sixAgo = new Date();
  sixAgo.setMonth(sixAgo.getMonth() - 5);
  sixAgo.setDate(1);
  const sixAgoStr = sixAgo.toISOString().slice(0, 10);

  const [
    // today snapshot
    newLeadsToday,
    followupsDoneToday,
    followupsPendingToday,
    revenueCollectedToday,
    siteVisitsToday,

    // this month
    newLeadsMonth,
    activeOpportunities,
    wonMonthValue,
    lostMonthCount,
    revenueCollectedMonth,
    revenuePendingOverdue,
    revenuePendingUpcoming,
    potentialRevenuePipeline,
    siteTrafficMonth,
    contentPublishedMonth,

    // charts
    leadsByMonth,
    revenuePaidByMonth,
    revenuePendingByMonth,
    trafficByMonth,
    callsByMonth,
    messagesByMonth,
    leadFunnelByStage,

    // tables
    paymentByClient,
    followUpActionLog,
    topTrafficSources,
    overduePayments,

    // superadmin site-picker
    sites,
  ] = await Promise.all([
    safeSelect(`
      SELECT COUNT(*) AS value FROM contacts
      WHERE ${site('contacts')} AND type='lead' AND DATE(reg_date)=CURDATE()
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM activities
      WHERE ${site('activities')} AND DATE(activity_date)=CURDATE() AND status='completed'
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM action_queue
      WHERE ${site('action_queue')} AND status='queued' AND DATE(surfaced_date)=CURDATE()
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM ledger
      WHERE ${site('ledger')} AND status='paid' AND DATE(transaction_date)=CURDATE()
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM site_traffic
      WHERE ${site('site_traffic')} AND DATE(event_date)=CURDATE()
    `),

    safeSelect(`
      SELECT COUNT(*) AS value FROM contacts
      WHERE ${site('contacts')} AND type='lead' AND DATE_FORMAT(reg_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM opportunities
      WHERE ${site('opportunities')} AND status='active'
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM opportunities
      WHERE ${site('opportunities')} AND stage='won' AND DATE_FORMAT(reg_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM opportunities
      WHERE ${site('opportunities')} AND stage='lost' AND DATE_FORMAT(reg_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM ledger
      WHERE ${site('ledger')} AND status='paid' AND DATE_FORMAT(transaction_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM ledger
      WHERE ${site('ledger')} AND status='pending' AND due_date < CURDATE()
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM ledger
      WHERE ${site('ledger')} AND status='pending' AND (due_date >= CURDATE() OR due_date IS NULL)
    `),
    safeSelect(`
      SELECT COALESCE(SUM(amount),0) AS value FROM opportunities
      WHERE ${site('opportunities')} AND stage NOT IN ('won','lost')
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM site_traffic
      WHERE ${site('site_traffic')} AND DATE_FORMAT(event_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),
    safeSelect(`
      SELECT COUNT(*) AS value FROM content
      WHERE ${site('content')} AND status='published' AND DATE_FORMAT(published_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
    `),

    safeSelect(`
      SELECT DATE_FORMAT(reg_date,'%Y-%m') AS label, COUNT(*) AS value
      FROM contacts
      WHERE ${site('contacts')} AND type='lead' AND reg_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS label, COALESCE(SUM(amount),0) AS value
      FROM ledger
      WHERE ${site('ledger')} AND status='paid' AND transaction_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS label, COALESCE(SUM(amount),0) AS value
      FROM ledger
      WHERE ${site('ledger')} AND status='pending' AND transaction_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(event_date,'%Y-%m') AS label, COUNT(*) AS value
      FROM site_traffic
      WHERE ${site('site_traffic')} AND event_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(activity_date,'%Y-%m') AS label, COUNT(*) AS value
      FROM activities
      WHERE ${site('activities')} AND LOWER(type)='call' AND activity_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT DATE_FORMAT(activity_date,'%Y-%m') AS label, COUNT(*) AS value
      FROM activities
      WHERE ${site('activities')} AND LOWER(type)='message' AND activity_date >= '${sixAgoStr}'
      GROUP BY label
    `),
    safeSelect(`
      SELECT stage AS label, COUNT(*) AS value
      FROM opportunities
      WHERE ${site('opportunities')} AND stage IS NOT NULL AND stage <> ''
      GROUP BY stage
    `),

    safeSelect(`
      SELECT contacts.contact_name AS label, COALESCE(SUM(ledger.amount),0) AS value
      FROM ledger
      LEFT JOIN contacts ON contacts.contact_id = ledger.contact_id AND contacts.hive_site_id = ledger.hive_site_id
      WHERE ${site('ledger')} AND ledger.status='paid'
      GROUP BY ledger.contact_id, contacts.contact_name
      ORDER BY value DESC
      LIMIT 10
    `),
    safeSelect(`
      SELECT contacts.contact_name AS contact_name, action_queue.reason AS reason,
        action_queue.response_action AS response_action, action_queue.responded_date AS responded_date
      FROM action_queue
      LEFT JOIN contacts ON contacts.contact_id = action_queue.contact_id AND contacts.hive_site_id = action_queue.hive_site_id
      WHERE ${site('action_queue')} AND action_queue.status='responded'
      ORDER BY action_queue.responded_date DESC
      LIMIT 10
    `),
    safeSelect(`
      SELECT page, source, COUNT(*) AS value
      FROM site_traffic
      WHERE ${site('site_traffic')}
      GROUP BY page, source
      ORDER BY value DESC
      LIMIT 10
    `),
    safeSelect(`
      SELECT contacts.contact_name AS contact_name, contacts.phone_number AS phone_number,
        ledger.reference AS reference, ledger.amount AS amount, ledger.due_date AS due_date
      FROM ledger
      LEFT JOIN contacts ON contacts.contact_id = ledger.contact_id AND contacts.hive_site_id = ledger.hive_site_id
      WHERE ${site('ledger')} AND ledger.status='pending' AND ledger.due_date < CURDATE()
      ORDER BY ledger.due_date ASC
      LIMIT 20
    `),

    isSuperadmin
      ? safeSelect(`
          SELECT DISTINCT hive_site_id, hive_site_name FROM hive_sites
          ORDER BY hive_site_name
        `)
      : Promise.resolve([]),
  ]);

  const val = (rows) => Number(rows?.[0]?.value || 0);

  const todayCards = [
    { key: 'new_leads_today', label: 'New Leads Today', value: toNum(val(newLeadsToday), 0) },
    { key: 'followups_done_today', label: 'Follow-ups Done Today', value: toNum(val(followupsDoneToday), 0) },
    { key: 'followups_pending_today', label: 'Follow-ups Pending Today', value: toNum(val(followupsPendingToday), 0) },
    { key: 'revenue_collected_today', label: 'Revenue Collected Today', value: toNum(val(revenueCollectedToday), 0) },
    { key: 'site_visits_today', label: 'Site Visits Today', value: toNum(val(siteVisitsToday), 0) },
  ];

  const monthCards = [
    { key: 'new_leads_month', label: 'New Leads This Month', value: toNum(val(newLeadsMonth), 0) },
    { key: 'active_opportunities', label: 'Active Opportunities', value: toNum(val(activeOpportunities), 0) },
    { key: 'won_month_value', label: 'Won This Month', value: toNum(val(wonMonthValue), 0) },
    { key: 'lost_month_count', label: 'Lost This Month', value: toNum(val(lostMonthCount), 0) },
    { key: 'revenue_collected_month', label: 'Revenue Collected This Month', value: toNum(val(revenueCollectedMonth), 0) },
    { key: 'revenue_pending_overdue', label: 'Revenue Overdue', value: toNum(val(revenuePendingOverdue), 0) },
    { key: 'revenue_pending_upcoming', label: 'Revenue Pending (Upcoming)', value: toNum(val(revenuePendingUpcoming), 0) },
    { key: 'potential_revenue_pipeline', label: 'Potential Revenue (Open Pipeline)', value: toNum(val(potentialRevenuePipeline), 0) },
    { key: 'site_traffic_month', label: 'Site Traffic This Month', value: toNum(val(siteTrafficMonth), 0) },
    { key: 'content_published_month', label: 'Content Published This Month', value: toNum(val(contentPublishedMonth), 0) },
  ];

  const months = last6MonthKeys();
  const toMonthSeries = (rows) => {
    const map = Object.fromEntries((rows || []).map((r) => [r.label, Number(r.value) || 0]));
    return months.map((label) => ({ label, value: map[label] || 0 }));
  };

  const paidMap = Object.fromEntries((revenuePaidByMonth || []).map((r) => [r.label, Number(r.value) || 0]));
  const pendingMap = Object.fromEntries((revenuePendingByMonth || []).map((r) => [r.label, Number(r.value) || 0]));
  const revenueByMonth = months.map((label) => ({
    label,
    paid: paidMap[label] || 0,
    pending: pendingMap[label] || 0,
  }));

  const callsMap = Object.fromEntries((callsByMonth || []).map((r) => [r.label, Number(r.value) || 0]));
  const messagesMap = Object.fromEntries((messagesByMonth || []).map((r) => [r.label, Number(r.value) || 0]));
  const callsMessagesByMonth = months.map((label) => ({
    label,
    calls: callsMap[label] || 0,
    messages: messagesMap[label] || 0,
  }));

  const stageRank = (stage) => {
    const idx = STAGE_ORDER.indexOf(String(stage || '').toLowerCase());
    return idx === -1 ? STAGE_ORDER.length : idx;
  };
  const leadFunnel = (leadFunnelByStage || [])
    .map((r) => ({ label: r.label, value: Number(r.value) || 0 }))
    .sort((a, b) => stageRank(a.label) - stageRank(b.label));

  return Response.json({
    status: 'success',
    message: 'Dashboard ready!',
    is_superadmin: isSuperadmin,
    selected_site: siteFilterId || null,
    sites: (sites || []).map((s) => ({ hive_site_id: s.hive_site_id, hive_site_name: s.hive_site_name })),

    today_cards: todayCards,
    month_cards: monthCards,

    leads_by_month: toMonthSeries(leadsByMonth),
    revenue_by_month: revenueByMonth,
    traffic_by_month: toMonthSeries(trafficByMonth),
    calls_messages_by_month: callsMessagesByMonth,
    lead_funnel_by_stage: leadFunnel,

    payment_by_client: (paymentByClient || []).map((r) => ({ label: r.label || 'Unknown', value: Number(r.value) || 0 })),
    follow_up_action_log: followUpActionLog || [],
    top_traffic_sources: topTrafficSources || [],
    overdue_payments: overduePayments || [],
  });
}
