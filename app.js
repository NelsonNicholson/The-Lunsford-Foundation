/* The Lunsford Foundation — Giving Dashboard
   Data is AES-GCM encrypted (data.enc.json); the passphrase derives the key in the browser. */
'use strict';

/* =========================================================
   Constants & helpers
   ========================================================= */
const CY = 2026;                 // current year
const NY = 2027;                 // budget year
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const CATS = ['Evangelism/Discipleship', 'Culture/Public Policy', 'Least of These', 'Community/Education'];
const HIST_CATS = [...CATS, 'Special Angel'];
const CAT_COLOR = {
  'Evangelism/Discipleship': '#2A6496',
  'Culture/Public Policy': '#C28A2C',
  'Least of These': '#2E9175',
  'Community/Education': '#B8473A',
  'Special Angel': '#8C8A84'
};
const NAVY = '#26343D', GOLD = '#9B835D', GOLD_LIGHT = '#D9CBB2', MUTED = '#8A9299', LINE = '#EFEBE3';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n || 0)).toLocaleString('en-US');
const fmtZ = n => n ? fmt(n) : '<span class="zero">—</span>';
const fmtK = n => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K';
  return s + '$' + Math.round(a);
};
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const ymLabel = m => MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const catDot = c => `<span class="dot" style="background:${CAT_COLOR[c] || MUTED}"></span>`;
const catChip = c => `<span class="chip">${catDot(c)}${esc(c || '—')}</span>`;
const srcLabel = s => ({ HLH: 'Holt Lunsford Holdings', HLC: 'Holt Lunsford Commercial' }[s] || s);
const grpLabel = g => g === 'Core' ? 'Core Giving' : 'The Bucket';
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* =========================================================
   Decryption gate
   ========================================================= */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decryptPayload(pass) {
  const res = await fetch('data.enc.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load data file.');
  const enc = await res.json();
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function unlock(pass, remember) {
  const data = await decryptPayload(pass);
  if (remember) LS.set('tlf_pp', pass);
  start(data);
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Unlocking…';
  $('#gateErr').textContent = '';
  try { await unlock($('#pp').value, $('#remember').checked); }
  catch (err) {
    $('#gateErr').textContent = err && err.name === 'OperationError' ? 'That passphrase is not correct.' : (err.message || 'Unable to unlock.');
    btn.disabled = false; btn.textContent = 'Unlock';
  }
});
$('#lockBtn').addEventListener('click', () => { LS.del('tlf_pp'); location.hash = ''; location.reload(); });
(async () => {
  const saved = LS.get('tlf_pp');
  if (saved) { try { await unlock(saved, true); } catch (e) { LS.del('tlf_pp'); } }
  else setTimeout(() => $('#pp').focus(), 50);
})();

/* =========================================================
   Data model
   ========================================================= */
const S = { bTab: 'All', orgTab: 'Core', histRange: 'all', histMetric: 'amount', histCat: null, orgSearch: '', orgCat: '', orgGrp: '', orgSort: { k: 'total', d: -1 } };
let D = null;       // raw data
let M = null;       // derived model

function derive(d) {
  const orgs = {};
  const getOrg = n => orgs[n] || (orgs[n] = { name: n, byYear: {}, total: 0, n: 0, gifts: [], cats: {}, grps: {} });
  d.gifts.forEach(g => {
    g.y = +g.m.slice(0, 4);
    const o = getOrg(g.o);
    o.byYear[g.y] = (o.byYear[g.y] || 0) + g.a;
    o.total += g.a; o.n++; o.gifts.push(g);
    o.cats[g.c] = (o.cats[g.c] || 0) + g.a; o.grps[g.g] = (o.grps[g.g] || 0) + g.a;
    if (!o.first || g.m < o.first) o.first = g.m;
    if (!o.last || g.m > o.last) o.last = g.m;
    o.cat = g.c; o.grp = g.g;          // latest wins (gifts are sorted by month)
  });
  d.targets.forEach(t => { const o = getOrg(t.o); o.target = t.t; o.cat = t.c; o.tgrp = t.g; o.y25 = t.y25; });
  // Current-category preference: avoid "Special Angel" as display category for orgs that have other gifts
  Object.values(orgs).forEach(o => {
    if (o.cat === 'Special Angel') {
      const alt = Object.entries(o.cats).filter(([c]) => c !== 'Special Angel').sort((a, b) => b[1] - a[1])[0];
      if (alt) o.cat = alt[0];
    }
  });
  const commit = {}; d.commitments.forEach(c => commit[c.o] = c);
  const monthly = {}; d.monthly.forEach(m => monthly[m.o] = m.a);
  Object.values(orgs).forEach(o => { o.commit = commit[o.name]; o.monthly = monthly[o.name]; });
  return { orgs, commit, monthly, list: Object.values(orgs) };
}

/* 2026 tracking rows */
function currentRows() {
  const rows = [];
  const MV = movedSet();
  M.list.forEach(o => {
    const act = o.byYear[CY] || 0, tgt = o.target || 0;
    if (!tgt && !act) return;
    const grp = tgt ? o.tgrp : 'Other';           // anything outside the target list rolls into The Bucket
    let remaining = tgt ? Math.max(0, tgt - act) : 0;
    const deferred = MV.has(o.name) ? remaining : 0;
    let status;
    if (!tgt) status = { t: 'Unbudgeted', c: 'muted' };
    else if (act >= tgt) status = { t: 'Completed', c: 'good' };
    else if (deferred) status = { t: 'Deferred to 2027', c: 'muted' };
    else if (act > 0) status = { t: 'In progress', c: 'warn' };
    else status = { t: 'Remaining', c: 'warn' };
    rows.push({ o, name: o.name, cat: o.cat, grp, tgt, act, y25: o.byYear[2025] || 0, remaining: remaining - deferred, deferred, status });
  });
  return rows;
}

/* =========================================================
   App start & routing
   ========================================================= */
function start(data) {
  D = data; M = derive(data);
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#footAsOf').textContent = 'Data as of ' + D.asOfLabel;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#3E4A54';
  Chart.defaults.borderColor = LINE;
  window.addEventListener('hashchange', route);
  route();
}
const charts = [];
function killCharts() { while (charts.length) charts.pop().destroy(); }
function route() {
  const v = (location.hash.replace(/^#\/?/, '') || 'giving').split('?')[0];
  const views = { giving: viewGiving, history: viewHistory, organizations: viewOrgs, funding: viewFunding, budget: viewBudget };
  const fn = views[v] || viewGiving;
  $$('#nav a, .topbar-actions a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  killCharts(); closeDrawer(true);
  $('#main').innerHTML = '';
  fn($('#main'));
  window.scrollTo(0, 0);
}

/* =========================================================
   Chart helpers
   ========================================================= */
function tooltipCfg(extra = {}) {
  return Object.assign({
    backgroundColor: NAVY, titleColor: '#fff', bodyColor: '#E7ECEF', padding: 10, cornerRadius: 6,
    boxPadding: 4, usePointStyle: true,
    callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y ?? c.parsed)}` }
  }, extra);
}
function moneyAxis(extra = {}) {
  return Object.assign({ beginAtZero: true, grid: { color: LINE, drawTicks: false }, border: { display: false }, ticks: { callback: v => fmtK(v), padding: 8, maxTicksLimit: 6 } }, extra);
}
function catAxis(extra = {}) { return Object.assign({ grid: { display: false }, border: { color: '#DDD7CC' }, ticks: { padding: 6 } }, extra); }
function mkChart(canvas, cfg) { const c = new Chart(canvas, cfg); charts.push(c); return c; }
function legendHTML(items) {
  return `<div class="legend">${items.map(i => `<span class="chip">${i.type === 'line' ? `<span class="line-sw" style="border-color:${i.color}"></span>` : i.type === 'dash' ? `<span class="dash-sw" style="border-color:${i.color}"></span>` : `<span class="swatch" style="background:${i.color}"></span>`}${esc(i.label)}</span>`).join('')}</div>`;
}

/* =========================================================
   VIEW: 2026 Giving (main)
   ========================================================= */
function viewGiving(el) {
  const rows = currentRows();
  const ytd = sum(rows, r => r.act);
  const tgtTotal = sum(rows, r => r.tgt);
  const remaining = sum(rows, r => r.remaining);
  const deferred = sum(rows, r => r.deferred);
  const funds = sum(D.balances, b => b.a);
  const gap = funds - remaining;
  const coreYtd = sum(rows.filter(r => r.grp === 'Core'), r => r.act);
  const bucketYtd = ytd - coreYtd;
  const gifts26 = D.gifts.filter(g => g.y === CY).length;
  const budgetedAct = sum(rows.filter(r => r.tgt), r => Math.min(r.act, r.tgt));

  el.innerHTML = `
  <div class="page-head">
    <div>
      <div class="eyebrow">Main Giving Dashboard</div>
      <h1 class="title">2026 Giving</h1>
      <p class="subtitle">Year-to-date giving across The Lunsford Foundation, The Signatry DAF, personal and Holt Lunsford Holdings, measured against the 2026 Target Giving plan. Data as of ${esc(D.asOfLabel)}.</p>
    </div>
  </div>

  <div class="grid g-kpi">
    <div class="card kpi hero">
      <div class="k-label">YTD Giving · ${CY}</div>
      <div class="k-val">${fmt(ytd)}</div>
      <div class="k-sub">${gifts26} gifts · Core ${fmtK(coreYtd)} · Bucket ${fmtK(bucketYtd)}</div>
      <div class="bar"><span style="width:${Math.min(100, pct(budgetedAct, tgtTotal))}%"></span></div>
    </div>
    <div class="card kpi">
      <div class="k-label">2026 Target</div>
      <div class="k-val">${fmt(tgtTotal)}</div>
      <div class="k-sub">${pct(budgetedAct, tgtTotal)}% of targeted giving completed</div>
      <div class="bar"><span style="width:${Math.min(100, pct(budgetedAct, tgtTotal))}%"></span></div>
    </div>
    <div class="card kpi">
      <div class="k-label">Remaining to Give</div>
      <div class="k-val">${fmt(remaining)}</div>
      <div class="k-sub">${rows.filter(r => r.remaining > 0).length} organizations still open${deferred ? ` · ${fmtK(deferred)} deferred to 2027` : ''}</div>
    </div>
    <div class="card kpi">
      <div class="k-label">Available Funds</div>
      <div class="k-val">${fmt(funds)}</div>
      <div class="k-sub" style="color:${gap < 0 ? 'var(--bad)' : 'var(--good)'}">${gap < 0 ? fmt(-gap) + ' additional funding needed' : fmt(gap) + ' surplus after remaining gifts'}</div>
    </div>
  </div>

  <div class="grid g-3-2 mt">
    <div class="card" id="fundsCard"></div>
    <div class="card" id="divCard"></div>
  </div>

  <div class="card flush mt" id="orgCard"></div>

  <div class="grid g-2 mt">
    <div class="card" id="cumCard"></div>
    <div class="card" id="splitCard"></div>
  </div>

  <div class="card mt" id="commitCard"></div>

  <div class="cta mt-lg">
    <div>
      <h3>Plan next year's giving</h3>
      <p>Build the 2027 Target Giving Budget — start from the 2026 targets with three years of history and commitments pre-filled, then export to PDF or Excel.</p>
    </div>
    <a href="#/budget" class="btn btn-gold">Create a 2027 Budget →</a>
  </div>`;

  renderFunds($('#fundsCard'), rows, funds, remaining);
  renderDivisions($('#divCard'), rows);
  renderOrgTable($('#orgCard'), rows);
  renderCumulative($('#cumCard'));
  renderSplit($('#splitCard'), rows);
  renderCommitments($('#commitCard'));
}

function renderFunds(el, rows, funds, remaining) {
  const big = rows.filter(r => r.remaining >= 500000).sort((a, b) => b.remaining - a.remaining);
  const other = remaining - sum(big, r => r.remaining);
  const scale = Math.max(funds, remaining) || 1;
  const gap = funds - remaining;
  const bal = D.balances;
  const balColors = [NAVY, GOLD];
  const remColors = ['#7A5A3A', '#A98457', '#C7B08C'];
  const deferred = rows.filter(r => r.deferred);
  // 2027 outlook from the budget draft
  const MV = movedSet();
  const B = loadDraft();
  const inc = B.rows.filter(r => r.inc);
  const has27 = inc.some(r => r.amt);
  const t27 = has27 ? sum(inc, r => r.amt || 0) : sum(inc, r => nextCommit(r.o, MV));
  const carry = Math.max(0, gap);
  const need27 = Math.max(0, t27 - carry);
  el.innerHTML = `
    <div class="sec-head">
      <div><h2 class="sec">Funds Available vs. Remaining to Give</h2><div class="sec-sub">Current giving account balances compared with open 2026 targets</div></div>
    </div>
    <div class="funds-row">
      <div class="lbl">Available funds<small>Giving account balances</small></div>
      <div class="sbar">${bal.map((b, i) => `<span style="width:${b.a / scale * 100}%;background:${balColors[i]}" data-tip="${esc(b.n)}: ${fmt(b.a)}">${b.a / scale > .2 ? esc(b.n) : ''}</span>`).join('')}</div>
      <div class="val">${fmt(funds)}</div>
    </div>
    <div class="funds-row">
      <div class="lbl">Remaining to give<small>Open 2026 targets</small></div>
      <div class="sbar">${big.map((r, i) => `<span style="width:${r.remaining / scale * 100}%;background:${remColors[i] || remColors[2]}" data-tip="${esc(r.name)}: ${fmt(r.remaining)}">${r.remaining / scale > .2 ? esc(r.name.replace(' Center Foundation', '')) : ''}</span>`).join('')}${other > 0 ? `<span style="width:${other / scale * 100}%;background:#CDBB9C;color:#3d3326" data-tip="All other open targets: ${fmt(other)}">Other</span>` : ''}</div>
      <div class="val">${fmt(remaining)}</div>
    </div>
    <div class="gap-box ${gap < 0 ? 'neg' : 'pos'}">
      <span>${gap < 0 ? 'Additional funding needed to complete 2026 targets' : 'Funds remaining after completing 2026 targets'}</span>
      <strong>${fmt(Math.abs(gap))}</strong>
    </div>
    <div class="grid g-2 mt" style="gap:12px">
      ${bal.map((b, i) => `<div class="note"><span class="chip" style="color:var(--ink)"><span class="swatch" style="width:10px;height:10px;border-radius:2px;background:${balColors[i]};display:inline-block"></span><b>${esc(b.n)}</b>${b.main ? ' <span class="tag gold">Main source</span>' : ''}</span><div style="font-family:var(--serif);font-size:24px;font-weight:600;color:var(--navy);margin-top:4px">${fmt(b.a)}</div></div>`).join('')}
    </div>
    <h3 class="sec mt" style="font-size:18px">Funding Outlook · 2026 → 2027</h3>
    <div class="tbl-wrap"><table class="tbl outlook">
      <tbody>
        <tr><td><b>2026</b> · Available funds</td><td class="n">${fmt(funds)}</td></tr>
        <tr><td>Less: remaining to give in 2026${deferred.length ? ` <span class="sec-sub">(after ${fmt(sum(deferred, r => r.deferred))} deferred)</span>` : ''}</td><td class="n">(${fmt(remaining)})</td></tr>
        <tr class="sub"><td>${gap < 0 ? 'Additional funding needed for 2026' : 'Funds carried into 2027'}</td><td class="n" style="color:${gap < 0 ? 'var(--bad)' : 'var(--good)'}">${fmt(Math.abs(gap))}</td></tr>
        <tr><td><b>2027</b> · ${has27 ? '2027 Target (from the 2027 budget draft)' : '2027 commitments <span class="sec-sub">(no 2027 budget amounts entered yet)</span>'}<a href="#/budget" class="link-go">Open 2027 Budget →</a></td><td class="n">${fmt(t27)}</td></tr>
        <tr><td>Less: funds carried over from 2026</td><td class="n">(${fmt(carry)})</td></tr>
        <tr class="sub"><td>Additional funding needed for 2027</td><td class="n" style="color:${need27 > 0 ? 'var(--bad)' : 'var(--good)'}">${fmt(need27)}</td></tr>
      </tbody>
    </table></div>
    <div class="note mt">${deferred.length
      ? `<b>Deferred to 2027:</b> ${deferred.map(r => `${esc(r.name)} ${fmt(r.deferred)}`).join(' · ')}. These are excluded from 2026 remaining to give and included in 2027. <a href="#/budget">Manage in the 2027 Budget →</a>`
      : `<b>Timing notes:</b> The $1M gift to Children's Medical is anticipated soon. Gifts that slip to next year (for example Trinity Christian Academy) can be moved with <b>Move to 2027?</b> in the <a href="#/budget">2027 Budget</a> — they will then show here as deferred.`}</div>`;
  bindTips(el);
}

function renderDivisions(el, rows) {
  const div = CATS.map(c => {
    const rs = rows.filter(r => r.cat === c);
    const act = sum(D.gifts.filter(g => g.y === CY && g.c === c), g => g.a);
    return { c, tgt: sum(rs, r => r.tgt), act, rem: sum(rs, r => r.remaining) };
  });
  const max = Math.max(...div.map(d => Math.max(d.tgt, d.act))) || 1;
  el.innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Giving by Division</h2><div class="sec-sub">2026 actual vs. target · click a division for detail</div></div></div>
    ${legendHTML([{ label: 'Actual', color: '#55606A' }, { label: 'Target', color: '#D9D3C8' }])}
    ${div.map(d => `
      <div class="bullet">
        <div class="bullet-top">
          <span class="name" data-cat="${esc(d.c)}">${catDot(d.c)}${esc(d.c)}</span>
          <span class="vals"><b>${fmt(d.act)}</b> of ${fmt(d.tgt)} · ${d.rem ? fmt(d.rem) + ' left' : '<span style="color:var(--good)">complete</span>'}</span>
        </div>
        <div class="bullet-track" data-tip="${esc(d.c)}<br>Actual ${fmt(d.act)} · Target ${fmt(d.tgt)}<br>Remaining ${fmt(d.rem)}">
          <div class="tgt" style="width:${d.tgt / max * 100}%;background:${CAT_COLOR[d.c]}"></div>
          <div class="act" style="width:${d.act / max * 100}%;background:${CAT_COLOR[d.c]}"></div>
        </div>
      </div>`).join('')}
    <div class="note mt" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>Total</b> · Target ${fmt(sum(div, d => d.tgt))}</span><span>Actual <b>${fmt(sum(div, d => d.act))}</b></span><span>Remaining <b>${fmt(sum(div, d => d.rem))}</b></span></div>`;
  $$('[data-cat]', el).forEach(n => n.addEventListener('click', () => openCategory(n.dataset.cat, CY)));
  bindTips(el);
}

function renderOrgTable(el, rows) {
  const draw = () => {
    const tab = S.orgTab;
    let rs = rows.filter(r => tab === 'All' || r.grp === tab);
    rs.sort((a, b) => (b.tgt - a.tgt) || (b.act - a.act));
    const open = rs.filter(r => !['Completed', 'Unbudgeted', 'Deferred to 2027'].includes(r.status.t));
    const defer = rs.filter(r => r.status.t === 'Deferred to 2027');
    const done = rs.filter(r => r.status.t === 'Completed');
    const unb = rs.filter(r => r.status.t === 'Unbudgeted');
    const rowHTML = r => {
      const p = r.tgt ? Math.min(100, pct(r.act, r.tgt)) : 0;
      const col = r.status.t === 'Completed' ? 'var(--good)' : CAT_COLOR[r.cat] || GOLD;
      return `<tr class="click" data-org="${esc(r.name)}">
        <td><div class="org-name">${esc(r.name)}</div><div class="org-meta">${catChip(r.cat)}${r.o.monthly ? '<span class="tag outline">Monthly</span>' : ''}${r.o.commit ? '<span class="tag gold">Multi-year commitment</span>' : ''}</div></td>
        <td class="n">${fmtZ(r.y25)}</td>
        <td class="n">${fmtZ(r.tgt)}</td>
        <td class="n"><b>${fmtZ(r.act)}</b></td>
        <td class="n">${r.deferred ? `<span class="zero">${fmt(r.deferred)}</span>` : fmtZ(r.remaining)}</td>
        <td>${r.tgt ? `<div class="prog"><div class="track"><div class="fill" style="width:${p}%;background:${col}"></div></div><span class="pct">${pct(r.act, r.tgt)}%</span></div>` : ''}</td>
        <td><span class="tag ${r.status.c}">${r.status.t === 'Completed' ? '✓ ' : ''}${r.status.t}</span></td>
      </tr>`;
    };
    const sub = (label, list) => list.length ? `<tr class="sub"><td colspan="7">${label} <span style="font-weight:400;color:var(--muted)">(${list.length})</span></td></tr>` + list.map(rowHTML).join('') : '';
    const t = { tgt: sum(rs, r => r.tgt), act: sum(rs, r => r.act), rem: sum(rs, r => r.remaining), y25: sum(rs, r => r.y25) };
    el.innerHTML = `
      <div class="card-pad">
        <div class="sec-head">
          <div><h2 class="sec">Giving by Organization</h2><div class="sec-sub">2026 target vs. actual · click any organization for its full giving history</div></div>
          <div class="seg" id="orgTabs">
            ${[['Core', 'Core Giving'], ['Other', 'The "Bucket"'], ['All', 'All']].map(([k, l]) => `<button data-k="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Organization</th><th class="n">2025 Giving</th><th class="n">2026 Target</th><th class="n">2026 Actual</th><th class="n">Remaining</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>
          ${sub('Open targets', open)}
          ${sub('Deferred to 2027', defer)}
          ${sub('Completed', done)}
          ${sub('Unbudgeted gifts', unb)}
        </tbody>
        <tfoot><tr><td>${tab === 'All' ? 'Combined total' : tab === 'Core' ? 'Total Core Giving' : 'Total — The "Bucket"'}</td><td class="n">${fmt(t.y25)}</td><td class="n">${fmt(t.tgt)}</td><td class="n">${fmt(t.act)}</td><td class="n">${fmt(t.rem)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>`;
    $$('#orgTabs button', el).forEach(b => b.addEventListener('click', () => { S.orgTab = b.dataset.k; draw(); }));
    $$('tr[data-org]', el).forEach(tr => tr.addEventListener('click', () => openOrg(tr.dataset.org)));
  };
  draw();
}

function renderCumulative(el) {
  const series = [2024, 2025, 2026].map(y => {
    let run = 0;
    const lastM = y === CY ? +D.asOf.slice(5, 7) : 12;
    return { y, data: MONTHS.map((_, i) => { if (i + 1 > lastM) return null; run += sum(D.gifts.filter(g => g.y === y && +g.m.slice(5, 7) === i + 1), g => g.a); return run; }) };
  });
  const tgt = sum(D.targets, t => t.t);
  const colors = { 2024: '#C9C4BA', 2025: '#8C9AA4', 2026: NAVY };
  el.innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Cumulative Giving</h2><div class="sec-sub">2026 pace compared with prior years and the 2026 target</div></div></div>
    ${legendHTML([{ label: '2026', color: colors[2026], type: 'line' }, { label: '2025', color: colors[2025], type: 'line' }, { label: '2024', color: colors[2024], type: 'line' }, { label: '2026 Target', color: GOLD, type: 'dash' }])}
    <div class="chart-box"><canvas></canvas></div>`;
  mkChart($('canvas', el), {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [
        ...series.reverse().map(s => ({ label: String(s.y), data: s.data, borderColor: colors[s.y], backgroundColor: colors[s.y], borderWidth: s.y === CY ? 2.5 : 2, pointRadius: 0, pointHoverRadius: 5, tension: .25, spanGaps: false })),
        { label: '2026 Target', data: MONTHS.map(() => tgt), borderColor: GOLD, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 }
      ]
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: tooltipCfg({ filter: i => i.parsed.y !== null }) },
      scales: { x: catAxis(), y: moneyAxis() }
    }
  });
}

function renderSplit(el, rows) {
  const by = CATS.map(c => ({
    c,
    core: sum(D.gifts.filter(g => g.y === CY && g.c === c && (M.orgs[g.o].target ? M.orgs[g.o].tgrp === 'Core' : false)), g => g.a),
    other: sum(D.gifts.filter(g => g.y === CY && g.c === c && !(M.orgs[g.o].target && M.orgs[g.o].tgrp === 'Core')), g => g.a)
  }));
  el.innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Core Giving vs. The "Bucket"</h2><div class="sec-sub">2026 actual giving by division</div></div></div>
    ${legendHTML([{ label: 'Core Giving', color: NAVY }, { label: 'The "Bucket" (Other Giving)', color: GOLD_LIGHT }])}
    <div class="chart-box"><canvas></canvas></div>`;
  mkChart($('canvas', el), {
    type: 'bar',
    data: {
      labels: CATS,
      datasets: [
        { label: 'Core Giving', data: by.map(b => b.core), backgroundColor: NAVY, borderRadius: 4, borderSkipped: 'start', borderColor: '#fff', borderWidth: { right: 2 } },
        { label: 'The "Bucket"', data: by.map(b => b.other), backgroundColor: GOLD_LIGHT, borderRadius: 4, borderSkipped: 'start' }
      ]
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipCfg({ callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.x)}` } }) },
      scales: { x: moneyAxis({ stacked: true }), y: catAxis({ stacked: true }) },
      onClick: (e, els) => { if (els.length) openCategory(CATS[els[0].index], CY); },
      onHover: (e, els) => e.native.target.style.cursor = els.length ? 'pointer' : 'default'
    }
  });
}

function commitPaid(c, y) {
  return sum(D.gifts.filter(g => g.o === c.o && g.y === y), g => g.a);
}
function renderCommitments(el) {
  const MV = movedSet();
  const rows = D.commitments.map(c => {
    const paid = sum(c.sched, s => s[0] <= CY ? Math.min(s[1], commitPaid(c, s[0])) : 0);
    return { c, paid, rem: c.total - paid };
  });
  el.innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Annual &amp; Multi-Year Commitments</h2><div class="sec-sub">Pledged gifts by year · green = paid, amber = due in ${CY}, gray = future</div></div></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Organization</th><th>Schedule</th><th class="n">Total Commitment</th><th class="n">Paid to Date</th><th class="n">Remaining</th></tr></thead>
      <tbody>${rows.map(({ c, paid, rem }) => `
        <tr class="click" data-org="${esc(c.o)}">
          <td><div class="org-name">${esc(c.label)}</div><div class="org-meta">${catChip(c.c)}${MV.has(c.o) ? '<span class="tag gold">Deferred to 2027</span>' : ''}</div>${MV.has(c.o) ? `<div class="sec-sub" style="margin-top:4px">2026 gift moved — schedule shifted one year</div>` : c.note ? `<div class="sec-sub" style="margin-top:4px">${esc(c.note)}</div>` : ''}</td>
          <td><div class="sched">${effSched(c, MV).map(([y, a]) => {
            const p = y <= CY ? commitPaid(c, y) : 0;
            const st = p >= a ? 'paid' : y === CY ? 'due' : y < CY ? 'due' : 'future';
            const due = c.due && c.due[y] ? c.due[y] : y;
            return `<span class="yr ${st}" title="${st === 'paid' ? 'Paid' : st === 'due' ? 'Due' : 'Scheduled'}"><b>${esc(String(due))}</b>${fmtK(a)}${st === 'paid' ? ' ✓' : ''}</span>`;
          }).join('')}</div></td>
          <td class="n">${fmt(c.total)}</td><td class="n">${fmt(paid)}</td><td class="n"><b>${fmt(rem)}</b></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total commitments</td><td class="n">${fmt(sum(rows, r => r.c.total))}</td><td class="n">${fmt(sum(rows, r => r.paid))}</td><td class="n">${fmt(sum(rows, r => r.rem))}</td></tr></tfoot>
    </table></div>
    <h3 class="sec" style="font-size:19px;margin:24px 0 10px">Recurring Monthly Gifts</h3>
    <div class="monthly">${D.monthly.map(m => `<div class="m" data-org="${esc(m.o)}"><div class="a">${fmt(m.a)}<span style="font-size:14px;color:var(--muted);font-family:var(--sans)"> / month</span></div><div class="o">${esc(m.o)} · ${fmt(m.a * 12)} per year</div></div>`).join('')}</div>`;
  $$('[data-org]', el).forEach(n => n.addEventListener('click', () => openOrg(n.dataset.org)));
}

/* tooltips for HTML bars */
function bindTips(root) {
  const tip = $('#tooltip');
  $$('[data-tip]', root).forEach(n => {
    n.addEventListener('mousemove', e => { tip.innerHTML = n.dataset.tip; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - 270) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
    n.addEventListener('mouseleave', () => tip.hidden = true);
  });
}

/* =========================================================
   VIEW: Giving History
   ========================================================= */
const RANGES = { all: [2020, 2026, '2020 – YTD 2026'], six: [2021, 2026, 'Past 6 years (2021–2026)'], three: [2024, 2026, 'Trailing 3 years (2024–2026)'], y2025: [2025, 2025, '2025'], y2026: [2026, 2026, 'YTD 2026'] };
function viewHistory(el) {
  const [y0, y1, rlabel] = RANGES[S.histRange];
  const inR = g => g.y >= y0 && g.y <= y1;
  const G = D.gifts.filter(inR);
  const total = sum(G, g => g.a);
  const catTot = HIST_CATS.map(c => ({ c, a: sum(G.filter(g => g.c === c), g => g.a), n: G.filter(g => g.c === c).length, orgs: new Set(G.filter(g => g.c === c).map(g => g.o)).size }));
  const main = [...catTot].sort((a, b) => b.a - a.a)[0];
  if (!S.histCat) S.histCat = main.c;

  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Giving History</div><h1 class="title">Six Years of Giving</h1>
    <p class="subtitle">All giving from The Lunsford Foundation, The Signatry DAF, personal and Holt Lunsford Holdings since 2020. Historic gifts are re-categorized into the current giving divisions.</p></div>
    <div class="seg" id="rangeSeg">${Object.entries(RANGES).map(([k, v]) => `<button data-k="${k}" class="${S.histRange === k ? 'on' : ''}">${v[2]}</button>`).join('')}</div>
  </div>

  <div class="grid g-kpi">
    <div class="card kpi hero"><div class="k-label">Total Giving · ${esc(rlabel)}</div><div class="k-val">${fmt(total)}</div><div class="k-sub">${G.length.toLocaleString()} gifts to ${new Set(G.map(g => g.o)).size} organizations</div></div>
    <div class="card kpi"><div class="k-label">Main Giving Category</div><div class="k-val" style="font-size:26px;display:flex;align-items:center;gap:10px;min-height:42px">${catDot(main.c)}${esc(main.c)}</div><div class="k-sub">${fmt(main.a)} · ${pct(main.a, total)}% of giving</div></div>
    <div class="card kpi"><div class="k-label">Core Giving</div><div class="k-val">${fmt(sum(G.filter(g => g.g === 'Core'), g => g.a))}</div><div class="k-sub">${pct(sum(G.filter(g => g.g === 'Core'), g => g.a), total)}% of total</div></div>
    <div class="card kpi"><div class="k-label">The "Bucket" (Other Giving)</div><div class="k-val">${fmt(sum(G.filter(g => g.g === 'Other'), g => g.a))}</div><div class="k-sub">${pct(sum(G.filter(g => g.g === 'Other'), g => g.a), total)}% of total</div></div>
  </div>

  <div class="card mt" id="annualCard"></div>

  <div class="card mt">
    <div class="sec-head"><div><h2 class="sec">Giving Categories</h2><div class="sec-sub">${esc(rlabel)} · select a category to see its organizations and trend</div></div></div>
    <div class="cat-cards" id="catCards">${catTot.map(c => `
      <div class="cat-card ${S.histCat === c.c ? 'on' : ''}" data-c="${esc(c.c)}">
        <span class="stripe" style="background:${CAT_COLOR[c.c]}"></span>
        ${c.c === main.c ? '<span class="badge tag gold">Main</span>' : c.c === 'Special Angel' ? '<span class="badge tag muted">Historic</span>' : ''}
        <div class="cn">${esc(c.c)}</div>
        <div class="cv">${fmtK(c.a)}</div>
        <div class="cs">${pct(c.a, total)}% · ${c.n} gifts · ${c.orgs} orgs</div>
      </div>`).join('')}</div>
    <div class="grid g-2-3 mt" id="catDetail"></div>
  </div>

  <div class="grid g-2 mt">
    <div class="card" id="topCard"></div>
    <div class="card" id="srcCard"></div>
  </div>`;

  $$('#rangeSeg button').forEach(b => b.addEventListener('click', () => { S.histRange = b.dataset.k; route(); }));
  $$('#catCards .cat-card').forEach(c => c.addEventListener('click', () => { S.histCat = c.dataset.c; $$('#catCards .cat-card').forEach(x => x.classList.toggle('on', x === c)); drawCatDetail(); }));

  // Annual stacked by category
  const yrs = YEARS.filter(y => y >= y0 && y <= y1);
  $('#annualCard').innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Annual Giving by Category</h2><div class="sec-sub">Click a bar segment to open that category's organizations for the year${yrs.includes(CY) ? ' · 2026 is year-to-date' : ''}</div></div></div>
    ${legendHTML(HIST_CATS.map(c => ({ label: c, color: CAT_COLOR[c] })))}
    <div class="chart-box tall"><canvas></canvas></div>`;
  mkChart($('#annualCard canvas'), {
    type: 'bar',
    data: { labels: yrs.map(y => y === CY ? 'YTD ' + y : String(y)), datasets: HIST_CATS.map(c => ({ label: c, data: yrs.map(y => sum(D.gifts.filter(g => g.y === y && g.c === c), g => g.a)), backgroundColor: CAT_COLOR[c], borderColor: '#fff', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 64 })) },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipCfg({ mode: 'index', intersect: false, filter: i => i.parsed.y > 0, footer: items => 'Total: ' + fmt(sum(items, i => i.parsed.y)) }) },
      scales: { x: catAxis({ stacked: true }), y: moneyAxis({ stacked: true }) },
      onClick: (e, els) => { if (els.length) openCategory(HIST_CATS[els[0].datasetIndex], yrs[els[0].index]); },
      onHover: (e, els) => e.native.target.style.cursor = els.length ? 'pointer' : 'default'
    }
  });

  function drawCatDetail() {
    const c = S.histCat;
    const cg = G.filter(g => g.c === c);
    const byOrg = {}; cg.forEach(g => byOrg[g.o] = (byOrg[g.o] || 0) + g.a);
    const top = Object.entries(byOrg).sort((a, b) => b[1] - a[1]);
    const max = top.length ? top[0][1] : 1;
    const box = $('#catDetail');
    box.innerHTML = `
      <div>
        <h3 class="sec" style="font-size:19px;display:flex;gap:8px;align-items:center">${catDot(c)}${esc(c)}</h3>
        <div class="sec-sub" style="margin-bottom:8px">${top.length} organizations · ${fmt(sum(cg, g => g.a))}</div>
        <ul class="rank" style="max-height:360px;overflow:auto">${top.slice(0, 40).map(([o, a], i) => `
          <li data-org="${esc(o)}"><span class="rk">${i + 1}</span><div style="min-width:0"><div class="nm">${esc(o)}</div><div class="bar"><span style="width:${a / max * 100}%;background:${CAT_COLOR[c]}"></span></div></div><div class="v">${fmt(a)}</div></li>`).join('')}</ul>
      </div>
      <div>
        <h3 class="sec" style="font-size:19px">Trend by Year</h3>
        <div class="sec-sub" style="margin-bottom:8px">${esc(c)} giving, 2020 – YTD 2026</div>
        <div class="chart-box"><canvas></canvas></div>
      </div>`;
    $$('[data-org]', box).forEach(n => n.addEventListener('click', () => openOrg(n.dataset.org)));
    const idx = charts.findIndex(ch => ch.canvas && ch.canvas.dataset.role === 'catTrend');
    if (idx >= 0) { charts[idx].destroy(); charts.splice(idx, 1); }
    const cv = $('canvas', box); cv.dataset.role = 'catTrend';
    mkChart(cv, {
      type: 'bar',
      data: { labels: YEARS.map(y => y === CY ? 'YTD ' + y : String(y)), datasets: [{ label: c, data: YEARS.map(y => sum(D.gifts.filter(g => g.y === y && g.c === c), g => g.a)), backgroundColor: CAT_COLOR[c], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 48 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCfg() }, scales: { x: catAxis(), y: moneyAxis() },
        onClick: (e, els) => { if (els.length) openCategory(c, YEARS[els[0].index]); },
        onHover: (e, els) => e.native.target.style.cursor = els.length ? 'pointer' : 'default' }
    });
  }
  drawCatDetail();

  // Top organizations
  const drawTop = () => {
    const by = {};
    G.forEach(g => { const b = by[g.o] || (by[g.o] = { a: 0, n: 0 }); b.a += g.a; b.n++; });
    const key = S.histMetric === 'amount' ? 'a' : 'n';
    const top = Object.entries(by).sort((a, b) => b[1][key] - a[1][key] || b[1].a - a[1].a).slice(0, 15);
    const max = top.length ? top[0][1][key] : 1;
    $('#topCard').innerHTML = `
      <div class="sec-head"><div><h2 class="sec">Top Organizations</h2><div class="sec-sub">${esc(rlabel)}</div></div>
        <div class="seg" id="metricSeg"><button data-k="amount" class="${S.histMetric === 'amount' ? 'on' : ''}">By amount</button><button data-k="count" class="${S.histMetric === 'count' ? 'on' : ''}">By number of gifts</button></div></div>
      <ul class="rank">${top.map(([o, v], i) => `
        <li data-org="${esc(o)}"><span class="rk">${i + 1}</span>
          <div style="min-width:0"><div class="nm">${esc(o)}</div><div class="bar"><span style="width:${v[key] / max * 100}%;background:${CAT_COLOR[M.orgs[o].cat] || GOLD}"></span></div></div>
          <div class="v">${key === 'a' ? fmt(v.a) : v.n + ' gifts'}<small>${key === 'a' ? v.n + ' gifts' : fmt(v.a)}</small></div></li>`).join('')}</ul>`;
    $$('#metricSeg button').forEach(b => b.addEventListener('click', () => { S.histMetric = b.dataset.k; drawTop(); }));
    $$('#topCard [data-org]').forEach(n => n.addEventListener('click', () => openOrg(n.dataset.org)));
  };
  drawTop();

  // Source accounts (2023+)
  const SRC = ['The Signatry', 'The Lunsford Foundation', 'Personal', 'HLH', 'HLC'];
  const SRC_COLOR = { 'The Signatry': NAVY, 'The Lunsford Foundation': GOLD, 'Personal': '#5B8C9E', 'HLH': '#B9AE9B', 'HLC': '#7E6A8F', 'Not tracked': '#DDD8CF' };
  const syrs = YEARS.filter(y => y >= Math.max(2023, y0) && y <= y1);
  $('#srcCard').innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Gifts by Source Account</h2><div class="sec-sub">Which account each gift was paid from · tracked from 2023 forward</div></div></div>
    ${syrs.length ? legendHTML([...SRC, 'Not tracked'].map(s => ({ label: srcLabel(s), color: SRC_COLOR[s] }))) + '<div class="chart-box"><canvas></canvas></div>' : '<p class="sec-sub">Source accounts are tracked from 2023 forward — choose a range that includes 2023–2026.</p>'}`;
  if (syrs.length) {
    const srcOf = g => SRC.includes(g.s) ? g.s : 'Not tracked';
    mkChart($('#srcCard canvas'), {
      type: 'bar',
      data: { labels: syrs.map(y => y === CY ? 'YTD ' + y : String(y)), datasets: [...SRC, 'Not tracked'].map(s => ({ label: srcLabel(s), data: syrs.map(y => sum(D.gifts.filter(g => g.y === y && srcOf(g) === s), g => g.a)), backgroundColor: SRC_COLOR[s], borderColor: '#fff', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 56 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCfg({ mode: 'index', intersect: false, filter: i => i.parsed.y > 0 }) }, scales: { x: catAxis({ stacked: true }), y: moneyAxis({ stacked: true }) } }
    });
    const val = (y, s) => sum(D.gifts.filter(g => g.y === y && srcOf(g) === s), g => g.a);
    const used = [...SRC, 'Not tracked'].filter(s => syrs.some(y => val(y, s)));
    $('#srcCard').insertAdjacentHTML('beforeend', `<div class="tbl-wrap mt"><table class="tbl" style="font-size:12.5px">
      <thead><tr><th>Account</th>${syrs.map(y => `<th class="n">${y === CY ? 'YTD ' + y : y}</th>`).join('')}</tr></thead>
      <tbody>${used.map(s => `<tr><td><span class="chip" style="color:var(--ink)"><span class="swatch" style="width:10px;height:10px;border-radius:2px;display:inline-block;background:${SRC_COLOR[s]}"></span>${esc(srcLabel(s))}</span></td>${syrs.map(y => `<td class="n">${fmtZ(val(y, s))}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${syrs.map(y => `<td class="n">${fmt(sum(D.gifts.filter(g => g.y === y), g => g.a))}</td>`).join('')}</tr></tfoot></table></div>`);
  }
}

/* =========================================================
   VIEW: Organizations directory
   ========================================================= */
function viewOrgs(el) {
  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Directory</div><h1 class="title">Organizations</h1>
    <p class="subtitle">Every organization supported since 2020. Click a row for giving history, gift detail and source accounts.</p></div>
  </div>
  <div class="card flush">
    <div class="card-pad">
      <div class="filters">
        <input class="input" id="oSearch" placeholder="Search organizations…" value="${esc(S.orgSearch)}" style="min-width:240px;flex:1">
        <select class="select" id="oCat"><option value="">All categories</option>${HIST_CATS.map(c => `<option ${S.orgCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="select" id="oGrp"><option value="">Core &amp; Bucket</option><option value="Core" ${S.orgGrp === 'Core' ? 'selected' : ''}>Core Giving</option><option value="Other" ${S.orgGrp === 'Other' ? 'selected' : ''}>The "Bucket"</option></select>
        <span class="sec-sub" id="oCount"></span>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl" id="oTbl"></table></div>
  </div>`;
  const cols = [['name', 'Organization', false], ['cat', 'Category', false], ['y2024', '2024', true], ['y2025', '2025', true], ['y2026', 'YTD 2026', true], ['total', 'Total since 2020', true], ['n', 'Gifts', true], ['last', 'Last Gift', false]];
  const draw = () => {
    const q = S.orgSearch.toLowerCase();
    let L = M.list.filter(o => o.n > 0 || o.target)
      .filter(o => !q || o.name.toLowerCase().includes(q))
      .filter(o => !S.orgCat || o.cat === S.orgCat || o.cats[S.orgCat])
      .filter(o => !S.orgGrp || (o.target ? o.tgrp : o.grp) === S.orgGrp)
      .map(o => ({ o, name: o.name, cat: o.cat, y2024: o.byYear[2024] || 0, y2025: o.byYear[2025] || 0, y2026: o.byYear[2026] || 0, total: o.total, n: o.n, last: o.last || '' }));
    const { k, d } = S.orgSort;
    L.sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * d);
    $('#oCount').textContent = L.length + ' organizations';
    $('#oTbl').innerHTML = `
      <thead><tr>${cols.map(([key, l, n]) => `<th class="sortable ${n ? 'n' : ''}" data-k="${key}">${l}${S.orgSort.k === key ? (S.orgSort.d > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
      <tbody>${L.map(r => `<tr class="click" data-org="${esc(r.name)}">
        <td><span class="org-name">${esc(r.name)}</span> ${r.o.target ? '<span class="tag gold">2026 Target</span>' : ''} ${r.o.commit ? '<span class="tag outline">Commitment</span>' : ''}</td>
        <td>${catChip(r.cat)}</td><td class="n">${fmtZ(r.y2024)}</td><td class="n">${fmtZ(r.y2025)}</td><td class="n">${fmtZ(r.y2026)}</td>
        <td class="n"><b>${fmtZ(r.total)}</b></td><td class="n">${r.n}</td><td>${r.last ? ymLabel(r.last) : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${fmt(sum(L, r => r.y2024))}</td><td class="n">${fmt(sum(L, r => r.y2025))}</td><td class="n">${fmt(sum(L, r => r.y2026))}</td><td class="n">${fmt(sum(L, r => r.total))}</td><td class="n">${sum(L, r => r.n)}</td><td></td></tr></tfoot>`;
    $$('#oTbl th.sortable').forEach(th => th.addEventListener('click', () => { const key = th.dataset.k; S.orgSort = { k: key, d: S.orgSort.k === key ? -S.orgSort.d : (['name', 'cat'].includes(key) ? 1 : -1) }; draw(); }));
    $$('#oTbl tr[data-org]').forEach(tr => tr.addEventListener('click', () => openOrg(tr.dataset.org)));
  };
  $('#oSearch').addEventListener('input', e => { S.orgSearch = e.target.value; draw(); });
  $('#oCat').addEventListener('change', e => { S.orgCat = e.target.value; draw(); });
  $('#oGrp').addEventListener('change', e => { S.orgGrp = e.target.value; draw(); });
  draw();
}

/* =========================================================
   VIEW: Funding Sources
   ========================================================= */
function viewFunding(el) {
  const F = D.funding;
  const total = sum(F, f => f.a);
  const re = F.filter(f => f.t.startsWith('Real')), pe = F.filter(f => f.t.startsWith('Personal'));
  const fyrs = YEARS;
  const giftsOut = y => sum(D.gifts.filter(g => g.y === y && g.s !== 'Personal' && g.s !== 'HLH'), g => g.a);
  const outTotal = sum(fyrs, giftsOut);
  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Funding Sources</div><h1 class="title">How the Foundation Is Funded</h1>
    <p class="subtitle">Contributions into The Lunsford Foundation from 2020 – YTD 2026: real estate asset sale proceeds and personal cash donations.</p></div>
  </div>
  <div class="grid g-kpi">
    <div class="card kpi hero"><div class="k-label">Total Funds Received</div><div class="k-val">${fmt(total)}</div><div class="k-sub">${F.length} contributions · 2020 – YTD 2026</div></div>
    <div class="card kpi"><div class="k-label">Real Estate Sale Proceeds</div><div class="k-val">${fmt(sum(re, f => f.a))}</div><div class="k-sub">${pct(sum(re, f => f.a), total)}% · ${re.length} asset sales</div><div class="bar"><span style="width:${pct(sum(re, f => f.a), total)}%;background:${NAVY}"></span></div></div>
    <div class="card kpi"><div class="k-label">Personal Cash Donations</div><div class="k-val">${fmt(sum(pe, f => f.a))}</div><div class="k-sub">${pct(sum(pe, f => f.a), total)}% · ${pe.length} years</div><div class="bar"><span style="width:${pct(sum(pe, f => f.a), total)}%"></span></div></div>
    <div class="card kpi"><div class="k-label">Granted from Foundation Accounts</div><div class="k-val">${fmt(outTotal)}</div><div class="k-sub">Gifts via The Signatry &amp; TLF, 2020 – YTD 2026</div></div>
  </div>

  <div class="grid g-2 mt">
    <div class="card">
      <div class="sec-head"><div><h2 class="sec">Funds Received by Year</h2><div class="sec-sub">By source type</div></div></div>
      ${legendHTML([{ label: 'Real Estate Asset Sale Proceeds', color: NAVY }, { label: 'Personal Cash Donation', color: GOLD }])}
      <div class="chart-box"><canvas id="fIn"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-head"><div><h2 class="sec">Funds In vs. Gifts Out</h2><div class="sec-sub">Contributions received vs. gifts paid from Foundation accounts</div></div></div>
      ${legendHTML([{ label: 'Funds received', color: '#8C9AA4' }, { label: 'Gifts paid out', color: GOLD }])}
      <div class="chart-box"><canvas id="fIO"></canvas></div>
    </div>
  </div>

  <div class="grid g-2-3 mt">
    <div class="card">
      <div class="sec-head"><div><h2 class="sec">Real Estate Assets Contributed</h2><div class="sec-sub">Sale proceeds by property</div></div></div>
      <ul class="rank">${(() => { const by = {}; re.forEach(f => { const b = by[f.p] || (by[f.p] = { a: 0, ys: [] }); b.a += f.a; b.ys.push(f.y); }); const L = Object.entries(by).sort((a, b) => b[1].a - a[1].a); const mx = L[0][1].a; return L.map(([p, v], i) => `<li style="cursor:default"><span class="rk">${i + 1}</span><div style="min-width:0"><div class="nm">${esc(p)}</div><div class="bar"><span style="width:${v.a / mx * 100}%;background:${NAVY}"></span></div></div><div class="v">${fmt(v.a)}<small>${[...new Set(v.ys)].join(', ')}</small></div></li>`).join(''); })()}</ul>
    </div>
    <div class="card flush">
      <div class="card-pad"><h2 class="sec">Contribution Detail</h2><div class="sec-sub">Foundation sources of funds, 2020 – YTD 2026</div></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Year</th><th>Source</th><th>Description</th><th class="n">Amount</th></tr></thead>
        <tbody>${fyrs.map(y => { const L = F.filter(f => f.y === y); return L.map((f, i) => `<tr><td>${i === 0 ? `<b>${y}</b>` : ''}</td><td><span class="tag ${f.t.startsWith('Real') ? 'outline' : 'gold'}">${f.t.startsWith('Real') ? 'Real estate' : 'Personal'}</span></td><td>${esc(f.p || f.d)}</td><td class="n">${fmt(f.a)}</td></tr>`).join('') + `<tr class="sub"><td colspan="3">${y} total</td><td class="n">${fmt(sum(L, f => f.a))}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total 2020 – YTD 2026</td><td class="n">${fmt(total)}</td></tr></tfoot>
      </table></div>
    </div>
  </div>`;
  const lbl = fyrs.map(y => y === CY ? 'YTD ' + y : String(y));
  mkChart($('#fIn'), {
    type: 'bar',
    data: { labels: lbl, datasets: [
      { label: 'Real Estate Asset Sale Proceeds', data: fyrs.map(y => sum(re.filter(f => f.y === y), f => f.a)), backgroundColor: NAVY, borderColor: '#fff', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 56 },
      { label: 'Personal Cash Donation', data: fyrs.map(y => sum(pe.filter(f => f.y === y), f => f.a)), backgroundColor: GOLD, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 56 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCfg({ mode: 'index', intersect: false, filter: i => i.parsed.y > 0, footer: it => 'Total: ' + fmt(sum(it, i => i.parsed.y)) }) }, scales: { x: catAxis({ stacked: true }), y: moneyAxis({ stacked: true }) } }
  });
  mkChart($('#fIO'), {
    type: 'bar',
    data: { labels: lbl, datasets: [
      { label: 'Funds received', data: fyrs.map(y => sum(F.filter(f => f.y === y), f => f.a)), backgroundColor: '#8C9AA4', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 30 },
      { label: 'Gifts paid out', data: fyrs.map(giftsOut), backgroundColor: GOLD, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 30 }] },
    options: { maintainAspectRatio: false, datasets: { bar: { categoryPercentage: .7, barPercentage: .9 } }, plugins: { legend: { display: false }, tooltip: tooltipCfg({ mode: 'index', intersect: false }) }, scales: { x: catAxis(), y: moneyAxis() } }
  });
}

/* =========================================================
   Drawer: organization & category drill-down
   ========================================================= */
function openDrawer(html, after) {
  killDrawerCharts();
  $('#drawerBody').innerHTML = html;
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false; document.body.style.overflow = 'hidden';
  $('#drawer').scrollTop = 0;
  if (after) after($('#drawerBody'));
}
const drawerCharts = [];
function killDrawerCharts() { while (drawerCharts.length) drawerCharts.pop().destroy(); }
function closeDrawer(silent) {
  $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true; document.body.style.overflow = '';
  if (!silent) setTimeout(killDrawerCharts, 260); else killDrawerCharts();
}
$('#drawerClose').addEventListener('click', () => closeDrawer());
$('#scrim').addEventListener('click', () => closeDrawer());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

function openOrg(name) {
  const o = M.orgs[name]; if (!o) return;
  const state = { year: 'all' };
  const srcNice = srcLabel;
  const srcTot = {}; o.gifts.forEach(g => srcTot[g.s] = (srcTot[g.s] || 0) + g.a);
  const c = o.commit;
  const act26 = o.byYear[CY] || 0;
  const avg3 = ((o.byYear[2024] || 0) + (o.byYear[2025] || 0) + (o.byYear[2026] || 0)) / 3;
  const html = `
    <div class="d-head">
      <div class="eyebrow">Organization</div>
      <h2 id="drawerTitle">${esc(o.name)}</h2>
      <div class="org-meta">${catChip(o.cat)}<span class="tag ${o.target ? (o.tgrp === 'Core' ? 'gold' : 'outline') : 'muted'}">${o.target ? grpLabel(o.tgrp) : grpLabel(o.grp || 'Other')}</span>${o.monthly ? `<span class="tag outline">Monthly gift · ${fmt(o.monthly)}</span>` : ''}${c ? '<span class="tag gold">Multi-year commitment</span>' : ''}</div>
      ${D.aliases[o.name] ? `<div class="sec-sub" style="margin-top:8px">${esc(D.aliases[o.name])}</div>` : ''}
    </div>
    <div class="d-body">
      <div class="d-stats">
        <div class="d-stat"><div class="l">Total since 2020</div><div class="v">${fmt(o.total)}</div><div class="s">${o.n} gift${o.n === 1 ? '' : 's'}</div></div>
        <div class="d-stat"><div class="l">2026 Target</div><div class="v">${o.target ? fmt(o.target) : '—'}</div><div class="s">${o.target ? (act26 >= o.target ? '✓ Completed' : fmt(o.target - act26) + ' remaining') : 'Not in 2026 plan'}</div></div>
        <div class="d-stat"><div class="l">YTD 2026</div><div class="v">${fmt(act26)}</div><div class="s">2025: ${fmt(o.byYear[2025] || 0)}</div></div>
        <div class="d-stat"><div class="l">First / Last Gift</div><div class="v" style="font-size:17px;margin-top:8px">${o.first ? ymLabel(o.first) : '—'}</div><div class="s">${o.last ? 'Last: ' + ymLabel(o.last) : 'No gifts yet'}</div></div>
      </div>

      ${c ? `<div class="card mt"><h3 class="sec" style="font-size:18px">Commitment Schedule</h3><div class="sec-sub" style="margin-bottom:10px">${fmt(c.total)} total${c.note ? ' · ' + esc(c.note) : ''}</div>
        <div class="sched">${effSched(c, movedSet()).map(([y, a]) => { const p = y <= CY ? commitPaid(c, y) : 0; const st = p >= a ? 'paid' : y <= CY ? 'due' : 'future'; return `<span class="yr ${st}"><b>${esc(String(c.due && c.due[y] ? c.due[y] : y))}</b>${fmt(a)}${st === 'paid' ? ' ✓' : ''}</span>`; }).join('')}</div></div>` : ''}

      <div class="card mt">
        <h3 class="sec" style="font-size:18px">Giving by Year</h3>
        <div class="sec-sub">3-year average (2024–2026): ${fmt(avg3)}${o.target ? ' · gold line = 2026 target' : ''}</div>
        <div class="chart-box short mt"><canvas id="dChart"></canvas></div>
      </div>

      <div class="card mt">
        <h3 class="sec" style="font-size:18px">Source Accounts</h3>
        <div class="sec-sub" style="margin-bottom:10px">Where gifts were paid from (account detail tracked from 2023)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(srcTot).sort((a, b) => b[1] - a[1]).map(([s, a]) => `<span class="tag outline" style="padding:5px 10px">${esc(srcNice(s))} · <b style="color:var(--ink)">${fmt(a)}</b></span>`).join('')}</div>
      </div>

      <div class="card flush mt">
        <div class="card-pad" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap">
          <div><h3 class="sec" style="font-size:18px">Gift Detail</h3><div class="sec-sub" id="gCount"></div></div>
          <select class="select" id="gYear"><option value="all">All years</option>${YEARS.slice().reverse().filter(y => o.byYear[y]).map(y => `<option value="${y}">${y}</option>`).join('')}</select>
        </div>
        <div class="tbl-wrap"><table class="tbl" id="gTbl"></table></div>
      </div>
    </div>`;
  openDrawer(html, body => {
    const drawG = () => {
      const L = o.gifts.filter(g => state.year === 'all' || g.y === +state.year).slice().reverse();
      $('#gCount', body).textContent = `${L.length} gift${L.length === 1 ? '' : 's'} · ${fmt(sum(L, g => g.a))}`;
      $('#gTbl', body).innerHTML = `<thead><tr><th>Month</th><th>Memo</th><th>Category</th><th>Source Account</th><th class="n">Amount</th></tr></thead>
        <tbody>${L.map(g => `<tr><td style="white-space:nowrap">${ymLabel(g.m)}</td><td>${esc(g.n) || '<span class="zero">—</span>'}</td><td>${catChip(g.c)}</td><td style="white-space:nowrap">${esc(srcNice(g.s))}</td><td class="n">${fmt(g.a)}</td></tr>`).join('') || '<tr><td colspan="5" class="sec-sub">No gifts recorded yet.</td></tr>'}</tbody>`;
    };
    $('#gYear', body).addEventListener('change', e => { state.year = e.target.value; drawG(); });
    drawG();
    const col = CAT_COLOR[o.cat] || GOLD;
    const ds = [{ type: 'bar', label: 'Giving', data: YEARS.map(y => o.byYear[y] || 0), backgroundColor: YEARS.map(y => y === CY ? col : col + 'B3'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 40 }];
    if (o.target) ds.push({ type: 'line', label: '2026 Target', data: YEARS.map(y => y === CY ? o.target : null), borderColor: GOLD, backgroundColor: GOLD, pointStyle: 'line', pointRadius: 18, pointBorderWidth: 3, pointHoverRadius: 18, showLine: false });
    drawerCharts.push(new Chart($('#dChart', body), {
      data: { labels: YEARS.map(y => y === CY ? 'YTD ' + y : String(y)), datasets: ds },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCfg({ filter: i => i.parsed.y !== null }) }, scales: { x: catAxis(), y: moneyAxis({ suggestedMax: Math.max(o.target || 0, ...Object.values(o.byYear)) * 1.1 }) },
        onClick: (e, els) => { if (els.length) { state.year = String(YEARS[els[0].index]); $('#gYear', body).value = state.year; drawG(); } },
        onHover: (e, els) => e.native.target.style.cursor = els.length ? 'pointer' : 'default' }
    }));
  });
}

function openCategory(cat, year) {
  const G = D.gifts.filter(g => g.c === cat && (year === 'all' || g.y === year));
  const by = {}; G.forEach(g => { const b = by[g.o] || (by[g.o] = { a: 0, n: 0 }); b.a += g.a; b.n++; });
  const L = Object.entries(by).sort((a, b) => b[1].a - a[1].a);
  const max = L.length ? L[0][1].a : 1;
  const isCY = year === CY;
  const tg = isCY ? D.targets.filter(t => t.c === cat) : [];
  const openT = tg.filter(t => (M.orgs[t.o].byYear[CY] || 0) < t.t);
  openDrawer(`
    <div class="d-head"><div class="eyebrow">Giving Category · ${year === CY ? 'YTD ' + CY : year}</div>
      <h2 id="drawerTitle" style="display:flex;gap:10px;align-items:center">${catDot(cat)}${esc(cat)}</h2>
      <div class="sec-sub">${L.length} organizations · ${G.length} gifts · ${fmt(sum(G, g => g.a))}${isCY ? ' · 2026 target ' + fmt(sum(tg, t => t.t)) : ''}</div></div>
    <div class="d-body">
      <div class="card"><h3 class="sec" style="font-size:18px">Organizations</h3>
      <ul class="rank mt">${L.map(([o, v], i) => `<li data-org="${esc(o)}"><span class="rk">${i + 1}</span><div style="min-width:0"><div class="nm">${esc(o)}</div><div class="bar"><span style="width:${v.a / max * 100}%;background:${CAT_COLOR[cat]}"></span></div></div><div class="v">${fmt(v.a)}<small>${v.n} gift${v.n === 1 ? '' : 's'}</small></div></li>`).join('') || '<li class="sec-sub">No gifts recorded.</li>'}</ul></div>
      ${openT.length ? `<div class="card mt"><h3 class="sec" style="font-size:18px">Open 2026 Targets</h3><table class="tbl mt"><thead><tr><th>Organization</th><th class="n">Target</th><th class="n">Actual</th><th class="n">Remaining</th></tr></thead><tbody>${openT.map(t => { const a = M.orgs[t.o].byYear[CY] || 0; return `<tr class="click" data-org="${esc(t.o)}"><td>${esc(t.o)}</td><td class="n">${fmt(t.t)}</td><td class="n">${fmtZ(a)}</td><td class="n"><b>${fmt(t.t - a)}</b></td></tr>`; }).join('')}</tbody></table></div>` : ''}
    </div>`, body => $$('[data-org]', body).forEach(n => n.addEventListener('click', () => openOrg(n.dataset.org))));
}


/* =========================================================
   2027 Budget — draft store, deferrals, commitments
   ========================================================= */
const BKEY = 'tlf_budget_2027_v1';
const NO_MOVE = new Set(["Children's Medical Center Foundation"]);   // will be paid in 2026
const unpaid26 = o => { const x = M.orgs[o]; return x && x.target ? Math.max(0, x.target - (x.byYear[CY] || 0)) : 0; };
const canMove = o => unpaid26(o) > 0 && !NO_MOVE.has(o) && !M.monthly[o];
function effSched(c, MV) {
  // A deferred commitment shifts every unpaid year from 2026 onward by one year
  if (!MV || !MV.has(c.o)) return c.sched;
  return c.sched.map(([y, a, p]) => y >= CY ? [y + 1, a, null] : [y, a, p]);
}
function nextCommit(o, MV) {
  const c = M.commit[o]; let a = 0;
  if (c) effSched(c, MV).forEach(([y, amt]) => { if (y === NY) a += amt; });
  if (M.monthly[o]) a = Math.max(a, M.monthly[o] * 12);
  return a;
}
function commitNote(o, MV) {
  const c = M.commit[o], parts = [];
  if (c) {
    const sch = effSched(c, MV), s = sch.find(x => x[0] === NY);
    if (MV && MV.has(o)) parts.push(`2026 gift moved to 2027 · schedule now ${sch.filter(x => x[0] >= NY).map(x => x[0]).join(', ')}`);
    else if (s) parts.push(`Commitment: ${fmt(s[1])}${c.due && c.due[NY] ? ' (' + c.due[NY] + ')' : ''}`);
  }
  if (M.monthly[o]) parts.push(`Monthly gift ${fmt(M.monthly[o])} × 12`);
  return parts.join(' · ');
}
function defaultBudget() {
  const rows = D.targets.map(t => ({ o: t.o, cat: t.c, grp: t.g, inc: true, amt: nextCommit(t.o) || null, note: '', isNew: false }));
  D.monthly.forEach(m => { if (!rows.find(r => r.o === m.o)) { const o = M.orgs[m.o]; rows.push({ o: m.o, cat: o.cat, grp: 'Other', inc: true, amt: m.a * 12, note: '', isNew: false }); } });
  D.commitments.forEach(c => { if (!rows.find(r => r.o === c.o) && nextCommit(c.o)) rows.push({ o: c.o, cat: c.c, grp: 'Core', inc: true, amt: nextCommit(c.o), note: '', isNew: false }); });
  return { v: 2, rows, moved: {}, notes: '', touched: false, savedAt: null };
}
function normalizeDraft(b) {
  if (!b || !Array.isArray(b.rows)) return null;
  b.rows = b.rows.filter(r => r && r.o).map(r => ({ o: String(r.o), cat: CATS.includes(r.cat) ? r.cat : (M.orgs[r.o] ? M.orgs[r.o].cat : CATS[0]), grp: r.grp === 'Core' ? 'Core' : 'Other', inc: r.inc !== false, amt: (typeof r.amt === 'number' && isFinite(r.amt)) ? Math.round(r.amt) : null, note: String(r.note || ''), isNew: !!r.isNew }));
  b.moved = b.moved && typeof b.moved === 'object' ? b.moved : {};
  b.notes = String(b.notes || ''); b.touched = !!b.touched; b.v = 2;
  return b;
}
function loadDraft() {
  try { const b = normalizeDraft(JSON.parse(LS.get(BKEY))); if (b) return b; } catch (e) { }
  return defaultBudget();
}
function saveDraft(b) { b.savedAt = new Date().toISOString(); LS.set(BKEY, JSON.stringify(b)); }
function movedSet(b) {
  b = b || loadDraft();
  const s = new Set();
  Object.keys(b.moved || {}).forEach(o => { if (b.moved[o] && canMove(o) && (b.rows.find(r => r.o === o) || {}).inc !== false) s.add(o); });
  return s;
}

/* ---------- Modal ---------- */
function modal({ title, body, buttons }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <h3 id="mTitle">${title}</h3><div class="m-body">${body}</div>
      <div class="m-actions">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    const close = v => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });
    $$('[data-i]', wrap).forEach(btn => btn.addEventListener('click', () => {
      const b = buttons[+btn.dataset.i];
      if (b.validate) { const ok = b.validate(wrap); if (!ok) return; }
      close(b.value !== undefined ? (typeof b.value === 'function' ? b.value(wrap) : b.value) : null);
    }));
    const first = $('input,select,textarea', wrap) || $('.btn-primary,.btn-gold', wrap); if (first) first.focus();
  });
}

/* =========================================================
   VIEW: 2027 Budget builder
   ========================================================= */
function viewBudget(el) {
  const B = loadDraft();
  S.bTab = 'All';
  const openRows = new Set();
  let showRemoved = false;
  const hist = o => { const x = M.orgs[o]; return x ? [x.byYear[2024] || 0, x.byYear[2025] || 0, x.byYear[2026] || 0] : [0, 0, 0]; };
  const tgt26 = o => (M.orgs[o] && M.orgs[o].target) || 0;
  const paid26 = o => (M.orgs[o] && M.orgs[o].byYear[CY]) || 0;
  const parseAmt = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : Math.round(n); };
  const persist = (touch = true) => { if (touch) B.touched = true; saveDraft(B); drawStatus(); };
  const MVnow = () => movedSet(B);
  const rowEl = o => $(`.brow[data-o="${CSS.escape(o)}"]`, el);

  el.innerHTML = `
  <div class="page-head" style="margin-bottom:14px">
    <div><div class="eyebrow"><a href="#/giving" style="text-decoration:none">← Back to 2026 Giving</a></div>
      <h1 class="title">2027 Target Giving Budget</h1>
      <p class="subtitle">Set a 2027 target for each organization. Three years of history, 2026 targets and existing commitments are shown for reference. Your work saves automatically.</p></div>
  </div>
  <div class="bbar" id="bBar">
    <div class="bbar-kpis" id="bKpis"></div>
    <div class="bbar-actions">
      <span class="save-status" id="bSaved"></span>
      <div class="menu">
        <button class="btn" id="bDraftBtn" aria-haspopup="true" aria-expanded="false">Draft ▾</button>
        <div class="menu-list" id="bDraftMenu" hidden>
          <button data-m="save">Save draft file…<small>Download to reopen on any device</small></button>
          <button data-m="open">Open a saved draft…<small>A draft file or an exported Excel budget</small></button>
          <button data-m="blank">Download blank template<small>2026 target list with empty 2027 column</small></button>
          <button data-m="reset" class="danger">Start over<small>Clear this draft and reload 2026 targets</small></button>
        </div>
      </div>
      <button class="btn btn-primary" id="bXlsx">Export Excel</button>
      <button class="btn btn-gold" id="bPdf">Export PDF</button>
    </div>
  </div>
  <div class="btools">
    <div></div>
    <div class="toolbar">
      <button class="btn" id="bFill" title="Fill every blank 2027 Target with that organization's 2026 Target">Start from 2026 targets</button>
      <button class="btn btn-primary" id="bAdd">+ Add Organization</button>
    </div>
  </div>
  <div class="card flush" id="bListCard">
    <div class="btabs-wrap"><span class="btabs-label">View</span><div class="btabs" id="bTabs" role="tablist" aria-label="Budget views"></div></div>
    <div class="btab-desc" id="bTabDesc"></div>
    <div class="bhead"><span>Organization</span><span>Giving 2024 · 2025 · 2026 YTD</span><span class="r">2026 Target</span><span class="r">2027 Target</span><span></span></div>
    <div id="bList"></div>
    <div class="bfoot" id="bFoot"></div>
  </div>
  <div id="bRemoved"></div>
  <div class="card mt">
    <h2 class="sec" style="font-size:20px">Notes &amp; Comments</h2>
    <div class="sec-sub" style="margin-bottom:10px">Included at the bottom of the PDF and Excel exports.</div>
    <textarea class="notes" id="bNotes" placeholder="Priorities, timing, matching-gift ideas, questions for Kaye Dawn…">${esc(B.notes)}</textarea>
  </div>
  <div class="note mt"><b>How saving works:</b> every change saves automatically in this browser on this device. To continue on another device — or to share a draft — use <b>Draft ▸ Save draft file</b>, then <b>Draft ▸ Open a saved draft</b> on the other device. An exported Excel budget can also be reopened to keep editing.</div>
  <input type="file" id="bFile" accept=".json,.xlsx,application/json" hidden>`;

  /* ----- summary bar ----- */
  const drawStatus = () => {
    const t = B.savedAt ? new Date(B.savedAt) : null;
    $('#bSaved').innerHTML = t ? `<span class="dot" style="background:var(--good)"></span>Saved on this device · ${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `<span class="dot" style="background:#CFCAC0"></span>Not yet edited`;
  };
  const drawKpis = () => {
    const MV = MVnow();
    const inc = B.rows.filter(r => r.inc);
    const tot = sum(inc, r => r.amt || 0);
    const core = sum(inc.filter(r => r.grp === 'Core'), r => r.amt || 0);
    const moved = sum(inc.filter(r => MV.has(r.o)), r => unpaid26(r.o));
    const t26 = sum(D.targets, t => t.t);
    const diff = tot - t26;
    $('#bKpis').innerHTML = `
      <div class="bk hero"><span>2027 Total</span><b>${fmt(tot)}</b></div>
      <div class="bk"><span>Core</span><b>${fmt(core)}</b></div>
      <div class="bk"><span>The "Bucket"</span><b>${fmt(tot - core)}</b></div>
      <div class="bk"><span>Moved from 2026</span><b>${fmt(moved)}</b></div>
      <div class="bk"><span>vs. 2026 Target</span><b style="color:${diff > 0 ? 'var(--warn)' : 'var(--navy)'}">${diff >= 0 ? '+' : '–'}${fmt(Math.abs(diff))}</b></div>`;
  };

  /* ----- tabs ----- */
  const tabDefs = () => {
    const inc = B.rows.filter(r => r.inc);
    return [
      ['All', 'All Organizations', inc],
      ['Core', 'Core Giving', inc.filter(r => r.grp === 'Core' && !r.isNew)],
      ['Other', 'The "Bucket"', inc.filter(r => r.grp !== 'Core' && !r.isNew)],
      ['New', 'New Organizations', inc.filter(r => r.isNew)],
      ['Unpaid', 'Unpaid 2026', inc.filter(r => canMove(r.o))]
    ];
  };
  const drawTabs = () => {
    const DESC = { All: 'Every organization in the 2027 budget.', Core: 'Core Giving organizations.', Other: 'The "Bucket" — other giving outside the core plan.', New: 'Organizations you have added that have no giving history.', Unpaid: '2026 targets not yet paid — use “Move to 2027?” to defer them.' };
    const MV = MVnow();
    $('#bTabs').innerHTML = tabDefs().map(([k, l, L]) => `<button role="tab" aria-selected="${S.bTab === k}" data-k="${k}" class="btab ${S.bTab === k ? 'on' : ''}">${k === 'Unpaid' && L.some(r => !MV.has(r.o)) ? '<span class="btab-dot" title="Needs a decision"></span>' : ''}${l}<span class="cnt">${L.length}</span></button>`).join('');
    const cur = tabDefs().find(t => t[0] === S.bTab) || tabDefs()[0];
    $('#bTabDesc').innerHTML = `Showing <b>${cur[2].length}</b> ${cur[2].length === 1 ? 'organization' : 'organizations'} · ${DESC[cur[0]]}`;
    $$('#bTabs button').forEach(b => b.addEventListener('click', () => { S.bTab = b.dataset.k; drawAll(); }));
  };

  /* ----- list ----- */
  const rowHTML = r => {
    const MV = MVnow();
    const [a, b, c] = hist(r.o), t26 = tgt26(r.o), p26 = paid26(r.o), com = nextCommit(r.o, MV), note = commitNote(r.o, MV);
    const moved = MV.has(r.o), movable = canMove(r.o), isOpen = openRows.has(r.o);
    return `<div class="brow ${moved ? 'moved' : ''} ${isOpen ? 'open' : ''}" data-o="${esc(r.o)}">
      <div class="b-org">
        <button class="b-name" data-act="hist" ${r.isNew ? 'disabled' : ''}>${esc(r.o)}</button>
        <div class="org-meta">${catChip(r.cat)}${r.isNew ? '<span class="tag gold">New</span>' : ''}${M.commit[r.o] ? '<span class="tag outline">Commitment</span>' : ''}${M.monthly[r.o] ? '<span class="tag outline">Monthly</span>' : ''}${moved ? '<span class="tag gold">Deferred from 2026</span>' : ''}${r.note ? '<span class="tag muted" title="Has notes">✎ Note</span>' : ''}</div>
        ${note ? `<div class="b-sub">${esc(note)}</div>` : ''}
        ${movable ? `<label class="b-move"><input type="checkbox" class="chk" data-act="move" ${moved ? 'checked' : ''}><span>${moved ? `${fmt(unpaid26(r.o))} moved from 2026 to 2027` : `${fmt(unpaid26(r.o))} unpaid in 2026 — <b>Move to 2027?</b>`}</span></label>` : ''}
      </div>
      <div class="b-hist"><span><i>2024</i>${a ? fmtK(a) : '—'}</span><span><i>2025</i>${b ? fmtK(b) : '—'}</span><span><i>2026</i>${c ? fmtK(c) : '—'}</span></div>
      <div class="b-t26"><i>2026 Target</i><b>${t26 ? fmt(t26) : '—'}</b>${t26 ? `<small>${p26 >= t26 ? '✓ Paid' : p26 ? 'Paid ' + fmt(p26) : moved ? 'Deferred' : 'Not yet paid'}</small>` : ''}</div>
      <div class="b-t27"><i>2027 Target</i><input class="amt ${r.amt ? 'filled' : ''}" data-act="amt" inputmode="numeric" value="${r.amt ? fmt(r.amt) : ''}" placeholder="$0" aria-label="2027 target for ${esc(r.o)}">${com ? `<small>Committed ${fmt(com)}</small>` : ''}</div>
      <button class="b-more" data-act="toggle" aria-expanded="${isOpen}" aria-label="More options for ${esc(r.o)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="b-panel">
        <label class="b-f wide"><span>Notes</span><input class="input" data-act="note" value="${esc(r.note)}" placeholder="Add a note for this organization"></label>
        <label class="b-f"><span>Giving Category</span><select class="select" data-act="cat">${CATS.map(x => `<option ${x === r.cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="b-f"><span>Type</span><select class="select" data-act="grp"><option value="Core" ${r.grp === 'Core' ? 'selected' : ''}>Core Giving</option><option value="Other" ${r.grp !== 'Core' ? 'selected' : ''}>The "Bucket"</option></select></label>
        <div class="b-f"><span>&nbsp;</span><button class="btn btn-sm" data-act="remove">Remove from 2027</button></div>
      </div>
    </div>`;
  };
  const drawList = () => {
    const def = tabDefs().find(t => t[0] === S.bTab) || tabDefs()[0];
    let L = def[2].slice();
    L.sort((x, y) => (y.amt || 0) - (x.amt || 0) || tgt26(y.o) - tgt26(x.o) || x.o.localeCompare(y.o));
    const MV = MVnow();
    const empty = { New: 'No new organizations yet — use <b>+ Add Organization</b>.', Unpaid: 'Every 2026 target has been paid.' }[def[0]] || 'No organizations in this list.';
    $('#bList').innerHTML = L.length ? L.map(rowHTML).join('') : `<div class="b-empty">${empty}</div>`;
    $('#bFoot').innerHTML = `<span>${esc(def[1])} · ${L.length} organization${L.length === 1 ? '' : 's'}</span><span>Committed <b>${fmt(sum(L, r => nextCommit(r.o, MV)))}</b></span><span>2027 Target <b>${fmt(sum(L, r => r.amt || 0))}</b></span>`;
    $$('#bList .brow').forEach(rowEl => bindRow(rowEl));
  };
  const drawRemoved = () => {
    const R = B.rows.filter(r => !r.inc);
    $('#bRemoved').innerHTML = R.length ? `<div class="card mt removed">
      <button class="btn btn-ghost btn-sm" id="bRemToggle">${showRemoved ? '▾' : '▸'} Removed organizations (${R.length})</button>
      ${showRemoved ? `<div class="mt">${R.map(r => `<div class="rem-row"><span>${esc(r.o)} ${catChip(r.cat)}</span><button class="btn btn-sm" data-restore="${esc(r.o)}">Restore</button></div>`).join('')}</div>` : ''}</div>` : '';
    const t = $('#bRemToggle'); if (t) t.addEventListener('click', () => { showRemoved = !showRemoved; drawRemoved(); });
    $$('[data-restore]').forEach(b => b.addEventListener('click', () => { const r = B.rows.find(x => x.o === b.dataset.restore); r.inc = true; persist(); drawAll(); toast(`${r.o} restored`); }));
  };
  const drawAll = () => { drawKpis(); drawTabs(); drawList(); drawRemoved(); drawStatus(); };

  /* ----- row interactions ----- */
  function bindRow(node) {
    const r = B.rows.find(x => x.o === node.dataset.o); if (!r) return;
    $$('[data-act]', node).forEach(inp => {
      const act = inp.dataset.act;
      if (act === 'hist') inp.addEventListener('click', () => openOrg(r.o));
      if (act === 'toggle') inp.addEventListener('click', () => { openRows.has(r.o) ? openRows.delete(r.o) : openRows.add(r.o); node.classList.toggle('open'); inp.setAttribute('aria-expanded', node.classList.contains('open')); });
      if (act === 'amt') {
        inp.addEventListener('focus', () => { inp.value = r.amt ? String(r.amt) : ''; inp.select(); });
        inp.addEventListener('blur', () => { const v = parseAmt(inp.value); if (v !== r.amt) { r.amt = v; persist(); } inp.value = r.amt ? fmt(r.amt) : ''; inp.classList.toggle('filled', !!r.amt); drawKpis(); drawFootOnly(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = $$('#bList input[data-act="amt"]'); const i = all.indexOf(inp); inp.blur(); if (all[i + 1]) all[i + 1].focus(); } });
      }
      if (act === 'note') inp.addEventListener('input', () => { r.note = inp.value; persist(); });
      if (act === 'note') inp.addEventListener('change', () => drawList());
      if (act === 'cat') inp.addEventListener('change', () => { r.cat = inp.value; persist(); drawAll(); });
      if (act === 'grp') inp.addEventListener('change', () => { r.grp = inp.value; persist(); drawAll(); });
      if (act === 'remove') inp.addEventListener('click', () => { r.inc = false; openRows.delete(r.o); persist(); drawAll(); toast(`${r.o} removed — restore it from "Removed organizations" below`); });
      if (act === 'move') inp.addEventListener('change', async () => {
        if (inp.checked) {
          const ok = await confirmMove(r);
          if (!ok) { inp.checked = false; return; }
        } else {
          delete B.moved[r.o];
          if (M.commit[r.o]) { const nc = nextCommit(r.o, new Set()); if (!r.amt) r.amt = nc || null; }
          persist(); toast(`${r.o} is back in 2026 remaining to give`);
        }
        drawAll();
      });
    });
  }
  const drawFootOnly = () => { const def = tabDefs().find(t => t[0] === S.bTab) || tabDefs()[0]; const L = def[2]; const MV = MVnow(); $('#bFoot').innerHTML = `<span>${esc(def[1])} · ${L.length} organization${L.length === 1 ? '' : 's'}</span><span>Committed <b>${fmt(sum(L, r => nextCommit(r.o, MV)))}</b></span><span>2027 Target <b>${fmt(sum(L, r => r.amt || 0))}</b></span>`; };

  async function confirmMove(r) {
    const amt = unpaid26(r.o), t26 = tgt26(r.o), p = paid26(r.o);
    if (M.commit[r.o]) {
      const c = M.commit[r.o];
      const after = effSched(c, new Set([r.o])).filter(x => x[0] >= NY).map(x => `${x[0]} ${fmtK(x[1])}`).join(' · ');
      const res = await modal({
        title: `Move ${esc(c.label)}'s commitment to 2027?`,
        body: `<p>The ${fmt(amt)} gift scheduled for 2026 moves to 2027, and the rest of the annual commitment shifts one year with it.</p>
               <p class="m-sched"><span>New schedule:</span> ${after}</p>
               <p class="sec-sub">It will show as <b>Deferred to 2027</b> on the 2026 Giving page and be removed from 2026 remaining to give.</p>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Move to 2027', cls: 'btn-gold', value: 'move' }]
      });
      if (res !== 'move') return false;
      B.moved[r.o] = true;
      r.amt = nextCommit(r.o, new Set([r.o])) || r.amt;
      persist(); toast(`${r.o}: commitment moved one year`);
      return true;
    }
    const replaceNote = r.amt ? `<p class="sec-sub">This will replace the ${fmt(r.amt)} currently entered for 2027.</p>` : '';
    const res = await modal({
      title: 'Move to 2027',
      body: `<p><b>${esc(r.o)}</b> has a 2026 Target of ${fmt(t26)}${p ? ` (${fmt(p)} paid, ${fmt(amt)} unpaid)` : ''}.</p>
             <p>Do you want to move the 2026 Target Amount to 2027, or remove from 2026 and enter a new amount for 2027?</p>${replaceNote}`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Enter a new 2027 amount', value: 'new' }, { label: `Move ${fmt(amt)} to 2027`, cls: 'btn-gold', value: 'move' }]
    });
    if (!res) return false;
    B.moved[r.o] = true;
    r.amt = res === 'move' ? amt : null;
    persist();
    if (res === 'new') setTimeout(() => { const n = rowEl(r.o); const i = n && $('input[data-act="amt"]', n); if (i) i.focus(); }, 30);
    toast(res === 'move' ? `${fmt(amt)} moved to 2027 for ${r.o}` : `${r.o} removed from 2026 — enter the 2027 amount`);
    return true;
  }

  /* ----- toolbar actions ----- */
  $('#bFill').addEventListener('click', async () => {
    const blanks = B.rows.filter(r => r.inc && !r.amt && tgt26(r.o));
    if (!blanks.length) { toast('Every organization with a 2026 Target already has a 2027 amount'); return; }
    const res = await modal({ title: 'Start from 2026 targets', body: `<p>Fill ${blanks.length} blank 2027 Target${blanks.length === 1 ? '' : 's'} with each organization's 2026 Target (${fmt(sum(blanks, r => tgt26(r.o)))} total)?</p><p class="sec-sub">Amounts you've already entered won't change.</p>`, buttons: [{ label: 'Cancel', value: null }, { label: 'Fill blanks', cls: 'btn-primary', value: 'ok' }] });
    if (res !== 'ok') return;
    blanks.forEach(r => r.amt = tgt26(r.o)); persist(); drawAll(); toast(`${blanks.length} 2027 targets filled`);
  });
  $('#bAdd').addEventListener('click', async () => {
    const have = new Set(B.rows.map(r => r.o));
    const opts = M.list.filter(o => !have.has(o.name) && o.n).sort((a, b) => b.total - a.total).map(o => `<option value="${esc(o.name)}">${esc(o.cat)} · ${fmtK(o.total)} since 2020</option>`).join('');
    const res = await modal({
      title: 'Add an Organization',
      body: `<div class="m-form">
        <label><span>Organization</span><input class="input" id="aName" list="aList" placeholder="Search past organizations or type a new one"><datalist id="aList">${opts}</datalist></label>
        <label><span>Giving Category</span><select class="select" id="aCat"><option value="">Choose a category…</option>${CATS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label><span>Type</span><select class="select" id="aGrp"><option value="Core">Core Giving</option><option value="Other">The "Bucket"</option></select></label>
        <label><span>2027 Target</span><input class="input" id="aAmt" inputmode="numeric" placeholder="$0"></label>
        <p class="field-err" id="aErr"></p></div>`,
      buttons: [{ label: 'Cancel', value: null }, {
        label: 'Add', cls: 'btn-primary',
        validate: w => {
          const name = $('#aName', w).value.trim(), cat = $('#aCat', w).value, err = $('#aErr', w);
          if (!name) { err.textContent = 'Enter an organization name.'; return false; }
          const dup = B.rows.find(r => r.o.toLowerCase() === name.toLowerCase());
          if (dup) { err.textContent = dup.inc ? 'That organization is already in the budget.' : 'That organization was removed — restore it from "Removed organizations".'; return false; }
          if (!cat) { err.textContent = M.orgs[name] ? 'Choose a Giving Category.' : 'New organization — please choose its Giving Category.'; return false; }
          return true;
        },
        value: w => ({ name: $('#aName', w).value.trim(), cat: $('#aCat', w).value, grp: $('#aGrp', w).value, amt: parseAmt($('#aAmt', w).value) })
      }]
    });
    if (!res) return;
    const existing = !!M.orgs[res.name];
    B.rows.push({ o: res.name, cat: res.cat, grp: res.grp, inc: true, amt: res.amt, note: '', isNew: !existing });
    S.bTab = existing ? (res.grp === 'Core' ? 'Core' : 'Other') : 'New';
    persist(); drawAll(); toast(`${res.name} added to the 2027 budget`);
  });
  // prefill category when an existing org is chosen in the Add dialog (registered once)
  if (!window.__tlfAddHook) { window.__tlfAddHook = true; document.addEventListener('input', e => {
    if (e.target && e.target.id === 'aName') { const o = M.orgs[e.target.value.trim()]; if (o) { const c = $('#aCat'), g = $('#aGrp'); if (c) c.value = CATS.includes(o.cat) ? o.cat : ''; if (g) g.value = o.target ? o.tgrp : (o.grp || 'Other'); } }
  }); }
  $('#bNotes').addEventListener('input', e => { B.notes = e.target.value; persist(); });

  /* ----- Draft menu ----- */
  const menu = $('#bDraftMenu'), mBtn = $('#bDraftBtn');
  const closeMenu = () => { menu.hidden = true; mBtn.setAttribute('aria-expanded', 'false'); };
  mBtn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; mBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
  if (!window.__tlfMenuHook) { window.__tlfMenuHook = true; document.addEventListener('click', e => { const mn = $('#bDraftMenu'); if (mn && !mn.hidden && !mn.contains(e.target) && e.target.id !== 'bDraftBtn') { mn.hidden = true; const b = $('#bDraftBtn'); if (b) b.setAttribute('aria-expanded', 'false'); } }); }
  $$('#bDraftMenu [data-m]').forEach(b => b.addEventListener('click', async () => {
    closeMenu();
    const m = b.dataset.m;
    if (m === 'save') {
      const payload = { app: 'tlf-budget-2027', exported: new Date().toISOString(), ...B };
      download(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), `Lunsford Foundation - 2027 Budget Draft - ${new Date().toISOString().slice(0, 10)}.json`);
      toast('Draft file downloaded');
    }
    if (m === 'open') $('#bFile').click();
    if (m === 'blank') exportBudgetChoice();
    if (m === 'reset') {
      const res = await modal({ title: 'Start over?', body: '<p>This clears the 2027 draft on this device — amounts, notes, added organizations and any “Move to 2027” choices — and reloads the 2026 target list.</p><p class="sec-sub">Tip: save a draft file first if you might want it back.</p>', buttons: [{ label: 'Cancel', value: null }, { label: 'Start over', cls: 'btn-primary', value: 'ok' }] });
      if (res === 'ok') { LS.del(BKEY); route(); toast('Started a fresh 2027 budget'); }
    }
  }));
  $('#bFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const draft = await readDraftFile(f);
      const res = await modal({ title: 'Open saved draft?', body: `<p>Replace the current draft on this device with <b>${esc(f.name)}</b>?</p><p class="sec-sub">${draft.rows.filter(r => r.inc).length} organizations · 2027 total ${fmt(sum(draft.rows.filter(r => r.inc), r => r.amt || 0))}</p>`, buttons: [{ label: 'Cancel', value: null }, { label: 'Open draft', cls: 'btn-primary', value: 'ok' }] });
      if (res !== 'ok') return;
      draft.touched = true; saveDraft(draft); route(); toast('Draft opened');
    } catch (err) { console.error(err); modal({ title: 'Could not open that file', body: `<p>${esc(err.message || 'The file is not a 2027 budget draft.')}</p>`, buttons: [{ label: 'OK', cls: 'btn-primary', value: null }] }); }
  });

  $('#bXlsx').addEventListener('click', () => exportBudget('xlsx', B.touched ? B : null));
  $('#bPdf').addEventListener('click', () => exportBudget('pdf', B.touched ? B : null));
  drawAll();
}

async function readDraftFile(f) {
  if (/\.json$/i.test(f.name) || f.type === 'application/json') {
    const d = normalizeDraft(JSON.parse(await f.text()));
    if (!d) throw new Error('This file is not a 2027 budget draft.');
    return d;
  }
  if (/\.xlsx$/i.test(f.name)) {
    await loadScript(CDN.exceljs);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
    const hidden = wb.getWorksheet('_draft');
    if (hidden) {
      let txt = ''; hidden.eachRow(row => { txt += String(row.getCell(1).value || ''); });
      const d = normalizeDraft(JSON.parse(txt)); if (d) return d;
    }
    // Fallback: read the visible budget sheet
    const ws = wb.getWorksheet('2027 Target Budget') || wb.worksheets[0];
    const head = []; let hr = 0;
    ws.eachRow((row, i) => { if (!hr && String(row.getCell(1).value || '').trim() === 'Organization') { hr = i; row.eachCell((c, j) => head[j] = String(c.value || '').trim()); } });
    if (!hr) throw new Error('Could not find the budget table in this Excel file.');
    const col = n => head.indexOf(n);
    const rows = []; let grp = 'Core';
    ws.eachRow((row, i) => {
      if (i <= hr) return;
      const name = String(row.getCell(1).value || '').trim(); if (!name) return;
      if (/^THE "BUCKET"/i.test(name)) { grp = 'Other'; return; }
      if (/^(CORE GIVING|ADDITIONAL ORGANIZATIONS)/i.test(name)) { if (/^ADDITIONAL/i.test(name)) grp = 'New'; return; }
      if (/^(Subtotal|TOTAL|Giving by Category|NOTES)/i.test(name)) { if (/^Giving by Category/i.test(name)) grp = 'stop'; return; }
      if (grp === 'stop' || CATS.includes(name)) return;
      const v = row.getCell(col('2027 Target')).value; const amt = typeof v === 'number' ? v : (v && v.result) || null;
      const cat = String(row.getCell(2).value || '').trim();
      rows.push({ o: name, cat: CATS.includes(cat) ? cat : (M.orgs[name] ? M.orgs[name].cat : CATS[0]), grp: grp === 'Core' ? 'Core' : 'Other', inc: true, amt, note: '', isNew: grp === 'New' || !M.orgs[name] });
    });
    if (!rows.length) throw new Error('No organizations were found in this Excel file.');
    return normalizeDraft({ rows, moved: {}, notes: '', touched: true });
  }
  throw new Error('Choose a draft file (.json) or an exported 2027 budget (.xlsx).');
}

function exportBudgetChoice() {
  openDrawer(`<div class="d-head"><div class="eyebrow">Export</div><h2 id="drawerTitle">Blank 2027 Budget Template</h2><div class="sec-sub">The 2026 Target organizations with trailing three-year giving and 2027 commitments, a blank 2027 Target column, empty rows for new organizations and space for notes.</div></div>
    <div class="d-body"><div class="toolbar"><button class="btn btn-primary" id="tX">Download Excel template</button><button class="btn btn-gold" id="tP">Download PDF template</button></div></div>`,
    body => { $('#tX', body).addEventListener('click', () => exportBudget('xlsx', null)); $('#tP', body).addEventListener('click', () => exportBudget('pdf', null)); });
}

/* ---------------- Export engine ---------------- */
const CDN = {
  exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
};
const loaded = {};
function loadScript(src) {
  return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load export library. Check your internet connection.')); }; document.head.appendChild(s); }));
}
let logoData = null;
async function getLogo() {
  if (logoData) return logoData;
  const blob = await (await fetch('logo.png')).blob();
  logoData = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return logoData;
}
function budgetRowsForExport(B) {
  const template = !B;
  const MV = template ? new Set() : movedSet(B);
  let rows;
  if (template) rows = D.targets.map(t => ({ o: t.o, cat: t.c, grp: t.g, amt: null, note: '', isNew: false }));
  else rows = B.rows.filter(r => r.inc).map(r => ({ ...r }));
  rows = rows.map(r => {
    const o = M.orgs[r.o];
    const mv = MV.has(r.o) ? unpaid26(r.o) : 0;
    return { ...r, h24: o ? o.byYear[2024] || 0 : 0, h25: o ? o.byYear[2025] || 0 : 0, h26: o ? o.byYear[2026] || 0 : 0, t26: o && o.target ? o.target : 0, mv, com: nextCommit(r.o, MV), cnote: [mv ? 'Deferred from 2026' : '', commitNote(r.o, MV)].filter(Boolean).join(' · ') };
  });
  const order = (a, b) => (b.amt || 0) - (a.amt || 0) || b.t26 - a.t26 || b.com - a.com || a.o.localeCompare(b.o);
  return {
    template, MV, draft: B,
    core: rows.filter(r => r.grp === 'Core' && !r.isNew).sort(order),
    bucket: rows.filter(r => r.grp !== 'Core' && !r.isNew).sort(order),
    added: rows.filter(r => r.isNew).sort(order),
    blanks: template ? 10 : 5,
    notes: B ? B.notes : ''
  };
}
async function exportBudget(kind, B) {
  const btns = $$('#bXlsx,#bPdf,#tX,#tP'); btns.forEach(b => b.disabled = true);
  try {
    const X = budgetRowsForExport(B);
    if (kind === 'xlsx') await exportXlsx(X); else await exportPdf(X);
    toast(X.template ? 'Blank 2027 budget template downloaded' : '2027 budget downloaded');
  } catch (e) { console.error(e); toast(e.message || 'Export failed'); }
  finally { btns.forEach(b => b.disabled = false); }
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const todayLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const EXCOLS = ['Organization', 'Giving Category', '2024 Giving', '2025 Giving', '2026 YTD', '2026 Target', 'Moved from 2026', '2027 Committed', '2027 Target', 'Notes'];
// numeric columns: 3..9 (1-based); 2027 Target = col 9; Notes = col 10

async function exportXlsx(X) {
  await loadScript(CDN.exceljs);
  const NC = EXCOLS.length, L = n => String.fromCharCode(64 + n);
  const wb = new ExcelJS.Workbook(); wb.creator = 'The Lunsford Foundation';
  const ws = wb.addWorksheet('2027 Target Budget', { views: [{ state: 'frozen', ySplit: 8, showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .3, footer: .3 } } });
  const NAVYX = 'FF26343D', GOLDX = 'FF9B835D', SOFT = 'FFF1EBE0', INPUT = 'FFFFF8E7', LINEX = 'FFE7E2D8';
  const money = '$#,##0;($#,##0);"–"';
  ws.columns = [{ width: 40 }, { width: 23 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 46 }];
  try { const img = wb.addImage({ base64: await getLogo(), extension: 'png' }); ws.addImage(img, { tl: { col: 0, row: 0.2 }, ext: { width: 300, height: 55 } }); } catch (e) { }
  ws.getRow(1).height = 22; ws.getRow(2).height = 22; ws.getRow(3).height = 14;
  ws.getCell('A5').value = `${NY} Target Giving Budget`; ws.getCell('A5').font = { name: 'Georgia', size: 18, color: { argb: NAVYX } };
  ws.getCell('A6').value = (X.template ? 'Blank template — enter 2027 targets in the shaded column. ' : '') + `Prepared ${todayLabel()} · Giving history as of ${D.asOfLabel}`;
  ws.getCell('A6').font = { size: 10, italic: true, color: { argb: 'FF55606A' } };
  const hr = ws.getRow(8); hr.values = EXCOLS; hr.height = 30;
  hr.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; c.alignment = { vertical: 'middle', wrapText: true, horizontal: i >= 3 && i <= 9 ? 'right' : 'left' }; });
  let r = 9; const subRows = [], ranges = [];
  const border = { bottom: { style: 'hair', color: { argb: LINEX } } };
  const section = (title, list, blanks) => {
    const t = ws.getRow(r); t.getCell(1).value = title; ws.mergeCells(r, 1, r, NC);
    t.getCell(1).font = { bold: true, color: { argb: NAVYX }, size: 10.5 }; t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; r++;
    const first = r;
    list.forEach(x => {
      const row = ws.getRow(r);
      row.values = [x.o, x.cat, x.h24 || null, x.h25 || null, x.h26 || null, x.t26 || null, x.mv || null, x.com || null, x.amt != null ? x.amt : null, [x.note, x.cnote].filter(Boolean).join(' · ') || null];
      row.eachCell({ includeEmpty: true }, (c, i) => { if (i <= NC) c.border = border; if (i >= 3 && i <= 9) c.numFmt = money; c.font = { size: 10 }; });
      row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } }; row.getCell(9).font = { size: 10, bold: true };
      row.getCell(10).font = { size: 9, color: { argb: 'FF55606A' } }; row.getCell(10).alignment = { wrapText: true, vertical: 'top' };
      r++;
    });
    for (let k = 0; k < blanks; k++) {
      const row = ws.getRow(r);
      row.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + CATS.join(',') + '"'], showErrorMessage: true, errorTitle: 'Giving Category', error: 'Choose one of the four giving categories.' };
      for (let i = 1; i <= NC; i++) { const c = row.getCell(i); c.border = border; if (i >= 3 && i <= 9) c.numFmt = money; }
      row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
      r++;
    }
    const last = r - 1;
    const s = ws.getRow(r); s.getCell(1).value = 'Subtotal — ' + title;
    for (let col = 3; col <= 9; col++) { s.getCell(col).value = last >= first ? { formula: `SUM(${L(col)}${first}:${L(col)}${last})` } : 0; s.getCell(col).numFmt = money; }
    s.eachCell({ includeEmpty: true }, (c, i) => { if (i <= NC) { c.font = { bold: true, size: 10, color: { argb: NAVYX } }; c.border = { top: { style: 'thin', color: { argb: GOLDX } } }; } });
    subRows.push(r); ranges.push([first, last]); r += 2;
  };
  section('CORE GIVING', X.core, 0);
  section('THE "BUCKET" — OTHER GIVING', X.bucket, 0);
  section('ADDITIONAL ORGANIZATIONS (choose a Giving Category for each new organization)', X.added, X.blanks);
  const g = ws.getRow(r); g.getCell(1).value = `TOTAL ${NY} TARGET GIVING`;
  for (let col = 3; col <= 9; col++) { g.getCell(col).value = { formula: subRows.map(sr => `${L(col)}${sr}`).join('+') }; g.getCell(col).numFmt = money; }
  g.eachCell({ includeEmpty: true }, (c, i) => { if (i <= NC) { c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; } });
  g.height = 20; r += 3;

  const dh = ws.getRow(r); dh.values = ['Giving by Category', '', '', '', '', '2026 Target', 'Moved from 2026', '2027 Committed', '2027 Target'];
  dh.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: NAVYX } }; c.border = { bottom: { style: 'thin', color: { argb: GOLDX } } }; });
  r++;
  const dFirst = r;
  CATS.forEach(c => {
    const row = ws.getRow(r); row.getCell(1).value = c;
    [6, 7, 8, 9].forEach(col => { row.getCell(col).value = { formula: ranges.map(([a, b]) => b >= a ? `SUMIF(B${a}:B${b},A${r},${L(col)}${a}:${L(col)}${b})` : '0').join('+') }; row.getCell(col).numFmt = money; });
    row.getCell(1).font = { size: 10 }; r++;
  });
  const tr = ws.getRow(r); tr.getCell(1).value = 'Total';
  [6, 7, 8, 9].forEach(col => { tr.getCell(col).value = { formula: `SUM(${L(col)}${dFirst}:${L(col)}${r - 1})` }; tr.getCell(col).numFmt = money; tr.getCell(col).font = { bold: true }; });
  tr.getCell(1).font = { bold: true }; r += 3;

  const nh = ws.getRow(r); nh.getCell(1).value = 'NOTES & COMMENTS'; nh.getCell(1).font = { bold: true, color: { argb: NAVYX } }; r++;
  const nStart = r;
  ws.mergeCells(r, 1, r + 7, NC);
  const nc = ws.getCell(r, 1); nc.value = X.notes || ''; nc.alignment = { wrapText: true, vertical: 'top' };
  nc.border = { top: { style: 'thin', color: { argb: LINEX } }, left: { style: 'thin', color: { argb: LINEX } }, bottom: { style: 'thin', color: { argb: LINEX } }, right: { style: 'thin', color: { argb: LINEX } } };
  for (let k = nStart; k <= nStart + 7; k++) ws.getRow(k).height = 18;

  // Commitments sheet (reflects any deferrals)
  const cs = wb.addWorksheet('Commitments', { views: [{ showGridLines: false }] });
  cs.columns = [{ width: 36 }, { width: 22 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 44 }];
  cs.getCell('A1').value = 'Annual & Multi-Year Commitments'; cs.getCell('A1').font = { name: 'Georgia', size: 16, color: { argb: NAVYX } };
  const yrs = [2025, 2026, 2027, 2028, 2029, 2030];
  const ch = cs.getRow(3); ch.values = ['Organization', 'Giving Category', 'Total', ...yrs.map(String), 'Notes'];
  ch.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; });
  let cr = 4;
  D.commitments.forEach(c => {
    const row = cs.getRow(cr); const by = {}; effSched(c, X.MV).forEach(([y, a]) => by[y] = a);
    row.values = [c.label, c.c, c.total, ...yrs.map(y => by[y] || null), X.MV.has(c.o) ? '2026 gift moved to 2027 — schedule shifted one year' : c.note];
    for (let i = 3; i <= 3 + yrs.length; i++) row.getCell(i).numFmt = money; cr++;
  });
  D.monthly.forEach(m => { const row = cs.getRow(cr); row.values = [m.o, M.orgs[m.o].cat, null, null, m.a * 12, m.a * 12, null, null, null, `Monthly gift ${fmt(m.a)}`]; for (let i = 3; i <= 3 + yrs.length; i++) row.getCell(i).numFmt = money; cr++; });

  // Hidden copy of the draft so this file can be reopened in the dashboard
  if (X.draft) {
    const hs = wb.addWorksheet('_draft', { state: 'veryHidden' });
    const json = JSON.stringify({ app: 'tlf-budget-2027', ...X.draft });
    for (let i = 0, k = 1; i < json.length; i += 30000, k++) hs.getCell(k, 1).value = json.slice(i, i + 30000);
  }

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), X.template ? `Lunsford Foundation - ${NY} Target Budget Template.xlsx` : `Lunsford Foundation - ${NY} Target Budget.xlsx`);
}

async function exportPdf(X) {
  await loadScript(CDN.jspdf); await loadScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mL = 32;
  const navy = [38, 52, 61], gold = [155, 131, 93], soft = [241, 235, 224], ink2 = [85, 96, 106];
  try { doc.addImage(await getLogo(), 'PNG', mL, 24, 190, 35); } catch (e) { }
  doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor(...navy);
  doc.text(`${NY} Target Giving Budget`, W - mL, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink2);
  doc.text((X.template ? 'Blank template · ' : '') + `Prepared ${todayLabel()} · Giving history as of ${D.asOfLabel}`, W - mL, 58, { align: 'right' });
  doc.setDrawColor(...gold); doc.setLineWidth(.8); doc.line(mL, 70, W - mL, 70);
  const m = v => v ? fmt(v) : '';
  const KEYS = ['h24', 'h25', 'h26', 't26', 'mv', 'com', 'amt'];
  const body = [];
  const sec = (title, list, blanks) => {
    body.push([{ content: title, colSpan: 10, styles: { fillColor: soft, textColor: navy, fontStyle: 'bold' } }]);
    list.forEach(x => body.push([x.o, x.cat, m(x.h24), m(x.h25), m(x.h26), m(x.t26), m(x.mv), m(x.com), x.amt != null ? fmt(x.amt) : '', [x.note, x.cnote].filter(Boolean).join(' · ')]));
    for (let k = 0; k < blanks; k++) body.push(['', '', '', '', '', '', '', '', '', '']);
    if (list.length) body.push([{ content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold', textColor: navy } }, ...KEYS.map(k => ({ content: fmt(sum(list, x => x[k] || 0)), styles: { fontStyle: 'bold', textColor: navy } })), '']);
  };
  sec('CORE GIVING', X.core, 0);
  sec('THE "BUCKET" — OTHER GIVING', X.bucket, 0);
  sec('ADDITIONAL ORGANIZATIONS — choose a Giving Category for each', X.added, X.blanks);
  const all = [...X.core, ...X.bucket, ...X.added];
  const foot = [[{ content: `TOTAL ${NY} TARGET GIVING`, colSpan: 2 }, ...KEYS.slice(0, 6).map(k => fmt(sum(all, x => x[k] || 0))), X.template ? '' : fmt(sum(all, x => x.amt || 0)), '']];
  doc.autoTable({
    startY: 82, head: [['Organization', 'Giving Category', '2024', '2025', '2026 YTD', '2026 Target', 'Moved from 2026', '2027 Committed', '2027 Target', 'Notes']], body, foot,
    theme: 'grid', showFoot: 'lastPage', margin: { left: mL, right: mL, bottom: 40 },
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 3.6, lineColor: [231, 226, 216], lineWidth: .4, textColor: [30, 42, 50], minCellHeight: 15, valign: 'middle' },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 138 }, 1: { cellWidth: 84 }, 2: { halign: 'right', cellWidth: 48 }, 3: { halign: 'right', cellWidth: 48 }, 4: { halign: 'right', cellWidth: 48 }, 5: { halign: 'right', cellWidth: 52 }, 6: { halign: 'right', cellWidth: 52 }, 7: { halign: 'right', cellWidth: 54 }, 8: { halign: 'right', cellWidth: 56, fillColor: [255, 248, 231], fontStyle: 'bold' }, 9: { cellWidth: 'auto', fontSize: 6.6, textColor: ink2 } },
    didParseCell: d => { if ((d.section === 'head' || d.section === 'foot') && d.column.index >= 2 && d.column.index <= 8) d.cell.styles.halign = 'right'; }
  });
  let y = doc.lastAutoTable.finalY + 22;
  if (y > H - 200) { doc.addPage(); y = 50; }
  const catRows = CATS.map(c => { const L = all.filter(x => x.cat === c); return [c, fmt(sum(L, x => x.t26)), fmt(sum(L, x => x.mv)), fmt(sum(L, x => x.com)), X.template ? '' : fmt(sum(L, x => x.amt || 0))]; });
  doc.autoTable({
    startY: y, head: [['Giving by Category', '2026 Target', 'Moved from 2026', '2027 Committed', '2027 Target']], body: catRows,
    theme: 'plain', margin: { left: mL }, tableWidth: 400,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 42, 50] }, headStyles: { textColor: navy, fontStyle: 'bold', lineWidth: { bottom: .8 }, lineColor: gold },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: d => { if (d.section === 'head' && d.column.index) d.cell.styles.halign = 'right'; }
  });
  const nx = mL + 420, nw = W - mL - nx, ny = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...navy); doc.text('NOTES & COMMENTS', nx, ny + 10);
  doc.setDrawColor(231, 226, 216); doc.setLineWidth(.5); doc.rect(nx, ny + 16, nw, 120);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 42, 50);
  if (X.notes) doc.text(doc.splitTextToSize(X.notes, nw - 16), nx + 8, ny + 30);
  else { doc.setDrawColor(236, 232, 224); for (let k = 1; k <= 6; k++) doc.line(nx + 8, ny + 16 + k * 17, nx + nw - 8, ny + 16 + k * 17); }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(...ink2);
    doc.text('The Lunsford Foundation · Confidential', mL, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - mL, H - 20, { align: 'right' });
  }
  doc.save(X.template ? `Lunsford Foundation - ${NY} Target Budget Template.pdf` : `Lunsford Foundation - ${NY} Target Budget.pdf`);
}
