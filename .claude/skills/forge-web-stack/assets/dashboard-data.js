// estates-data.js
// Ellingson Estates — real-estate tracker + deal analyzer.
// Reads RE_Properties from Airtable and computes EVERY investor metric in code
// (deterministic — no invented numbers, no LLM in the math). Passcode-gated.
//
// Metrics per property: mortgage P&I, monthly cash flow, NOI, cap rate,
// cash-on-cash, DSCR, LTV, equity, 1% rule, BRRRR refi-readiness (75% ARV +
// seasoning), rent-late flag. Portfolio rollup vs the 5-door / $4,500-mo goal
// and the 250-hour QBI safe-harbor.

'use strict';

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0/';
const TABLE = 'RE_Properties';
const GET_TIMEOUT_MS = 5000;

const DESK_KEY = process.env.DESK_KEY || 'CHANGE_ME_PASSCODE';   // same passcode as the command center

// Portfolio goals (from the Ellingson playbook).
const GOAL_DOORS = 5;
const GOAL_CASHFLOW_MO = 4500;
const RESERVE_FLOOR = 30000;
const QBI_HOURS = 250;
const DSCR_MIN = 1.25;
const REFI_LTV = 0.75;        // typical cash-out refi ceiling
const SEASONING_MONTHS = 6;   // typical refi seasoning

// Defaults applied when an optional field is blank (so a property with just
// price/loan/rent still returns sane numbers; refine later).
const DEF = { mgmt: 0, maint: 8, vac: 5, capex: 5, term: 30 };

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, Math.max(1, timeoutMs));
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .finally(function () { clearTimeout(timer); });
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

function n(v) { const x = parseFloat(v); return isFinite(x) ? x : 0; }
function nOr(v, d) { const x = parseFloat(v); return isFinite(x) ? x : d; }
function r2(x) { return Math.round(x * 100) / 100; }
function r0(x) { return Math.round(x); }

// Monthly mortgage payment (principal + interest).
function pmt(loan, annualRatePct, years) {
  if (loan <= 0 || years <= 0) return 0;
  const r = (annualRatePct / 100) / 12;
  const nMonths = years * 12;
  if (r === 0) return loan / nMonths;
  return loan * r / (1 - Math.pow(1 + r, -nMonths));
}

function monthsBetween(iso, now) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return (now - t) / (1000 * 60 * 60 * 24 * 30.4375);
}

function compute(rec, now) {
  const f = rec.fields || {};
  const price = n(f.Purchase_Price);
  const down = n(f.Down_Payment);
  const closing = n(f.Closing_Costs);
  const rehab = n(f.Rehab_Cost);
  const arv = n(f.ARV) || price;
  const loan = n(f.Loan_Amount) || Math.max(0, price - down);
  const rate = n(f.Interest_Rate);
  const term = nOr(f.Loan_Term_Years, DEF.term);
  const rent = n(f.Monthly_Rent);
  const other = n(f.Other_Income_Monthly);
  const taxM = n(f.Property_Tax_Annual) / 12;
  const insM = n(f.Insurance_Annual) / 12;
  const hoa = n(f.HOA_Monthly);
  const mgmtPct = nOr(f.Mgmt_Pct, DEF.mgmt);
  const maintPct = nOr(f.Maintenance_Pct, DEF.maint);
  const vacPct = nOr(f.Vacancy_Pct, DEF.vac);
  const capexPct = nOr(f.CapEx_Pct, DEF.capex);

  const gross = rent + other;
  const mgmt = rent * (mgmtPct / 100);
  const maint = rent * (maintPct / 100);
  const vac = rent * (vacPct / 100);
  const capex = rent * (capexPct / 100);

  // NOI excludes CapEx reserve and debt service (convention). Cash flow includes both.
  const opExNOI = taxM + insM + hoa + mgmt + maint + vac;
  const noiM = gross - opExNOI;
  const pi = pmt(loan, rate, term);
  const cashFlowM = noiM - capex - pi;

  const noiA = noiM * 12;
  const cashFlowA = cashFlowM * 12;
  const debtA = pi * 12;

  const cashInvested = down + closing + rehab;
  const capRate = price > 0 ? (noiA / price) * 100 : null;
  const coc = cashInvested > 0 ? (cashFlowA / cashInvested) * 100 : null;
  const dscr = debtA > 0 ? noiA / debtA : null;
  const ltv = arv > 0 ? (loan / arv) * 100 : null;
  const equity = arv - loan;
  const onePct = price > 0 ? (rent / price) * 100 : null;

  // BRRRR refi readiness
  const maxRefiLoan = arv * REFI_LTV;
  const cashOut = maxRefiLoan - loan;               // new loan minus current loan
  const recoversAll = cashOut >= cashInvested && cashInvested > 0;
  const seasonMonths = monthsBetween(f.Rehab_Done_Date, now);
  const seasoned = seasonMonths == null ? null : seasonMonths >= SEASONING_MONTHS;

  // Rent-late flag
  const dueDay = n(f.Rent_Due_Day);
  const received = f.Rent_Received_This_Month === true;
  const status = f.Status || '';
  const dayOfMonth = new Date(now).getDate();
  const rentLate = (status === 'Rented' && dueDay > 0 && !received && dayOfMonth > dueDay + 3);

  return {
    id: rec.id,
    name: f.Name || '(unnamed)',
    address: f.Address || '',
    status: status,
    strategy: f.Strategy || '',
    price: r0(price), arv: r0(arv), loan: r0(loan),
    rent: r0(rent),
    piMonthly: r0(pi),
    cashFlowMonthly: r0(cashFlowM),
    cashFlowAnnual: r0(cashFlowA),
    noiAnnual: r0(noiA),
    capRate: capRate == null ? null : r2(capRate),
    coc: coc == null ? null : r2(coc),
    dscr: dscr == null ? null : r2(dscr),
    dscrPass: dscr == null ? null : dscr >= DSCR_MIN,
    ltv: ltv == null ? null : r2(ltv),
    equity: r0(equity),
    onePct: onePct == null ? null : r2(onePct),
    cashInvested: r0(cashInvested),
    refi: {
      maxLoan: r0(maxRefiLoan),
      cashOut: r0(cashOut),
      recoversAll: recoversAll,
      seasonedMonths: seasonMonths == null ? null : r2(seasonMonths),
      seasoned: seasoned
    },
    rentLate: rentLate,
    hoursYTD: nOr(f.Rental_Hours_YTD, 0)
  };
}

exports.handler = async (event) => {
  if (!event || (event.httpMethod !== 'GET' && event.httpMethod !== 'POST')) {
    return { statusCode: 405, headers: Object.assign({}, HEADERS, { Allow: 'GET' }),
      body: JSON.stringify({ ok: false, error: 'Use GET.' }) };
  }
  const provided = (event.headers && (event.headers['x-desk-key'] || event.headers['X-Desk-Key'])) || '';
  if (!safeEqual(provided, DESK_KEY)) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Locked.' }) };
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Data source not configured.' }) };
  }

  let records = [];
  try {
    const url = AIRTABLE_BASE_URL + base + '/' + encodeURIComponent(TABLE) + '?pageSize=100';
    const rr = await fetchWithTimeout(url, { headers: { Authorization: 'Bearer ' + token } }, GET_TIMEOUT_MS);
    if (!rr.ok) throw new Error('airtable ' + rr.status);
    const d = await rr.json();
    records = (d && Array.isArray(d.records)) ? d.records : [];
  } catch (e) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Could not load properties.' }) };
  }

  const now = Date.now();
  const props = records.map(function (r) { return compute(r, now); });

  // Portfolio rollup — "owned" = Rented or Refi (income-producing doors).
  const owned = props.filter(function (p) { return p.status === 'Rented' || p.status === 'Refi'; });
  const doors = owned.length;
  const cashFlowMo = owned.reduce(function (s, p) { return s + p.cashFlowMonthly; }, 0);
  const equity = owned.reduce(function (s, p) { return s + p.equity; }, 0);
  const invested = owned.reduce(function (s, p) { return s + p.cashInvested; }, 0);
  const hours = props.reduce(function (s, p) { return s + p.hoursYTD; }, 0);
  const dscrs = owned.map(function (p) { return p.dscr; }).filter(function (x) { return x != null; });
  const avgDscr = dscrs.length ? r2(dscrs.reduce(function (a, b) { return a + b; }, 0) / dscrs.length) : null;
  const rentLateCount = owned.filter(function (p) { return p.rentLate; }).length;
  const portfolioCoc = invested > 0 ? r2((cashFlowMo * 12 / invested) * 100) : null;

  const portfolio = {
    doors: doors, goalDoors: GOAL_DOORS,
    cashFlowMo: r0(cashFlowMo), goalCashFlowMo: GOAL_CASHFLOW_MO,
    equity: r0(equity), invested: r0(invested), portfolioCoc: portfolioCoc,
    avgDscr: avgDscr, dscrMin: DSCR_MIN,
    hoursYTD: r2(hours), qbiHours: QBI_HOURS,
    reserveFloor: RESERVE_FLOOR,
    rentLateCount: rentLateCount,
    counts: props.reduce(function (m, p) { m[p.status] = (m[p.status] || 0) + 1; return m; }, {})
  };

  // Sort: income-producing first, then by cash flow desc.
  const rank = { 'Rented': 0, 'Refi': 1, 'Rehab': 2, 'Under Contract': 3, 'Prospect': 4, 'Sold': 5 };
  props.sort(function (a, b) {
    const ra = rank[a.status] == null ? 9 : rank[a.status];
    const rb = rank[b.status] == null ? 9 : rank[b.status];
    if (ra !== rb) return ra - rb;
    return b.cashFlowMonthly - a.cashFlowMonthly;
  });

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, serverTime: new Date().toISOString(), portfolio: portfolio, properties: props })
  };
};
