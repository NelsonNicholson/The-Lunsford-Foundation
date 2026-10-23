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
const S = { includeTCA: true, orgTab: 'Core', histRange: 'all', histMetric: 'amount', histCat: null, orgSearch: '', orgCat: '', orgGrp: '', orgSort: { k: 'total', d: -1 } };
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
  M.list.forEach(o => {
    const act = o.byYear[CY] || 0, tgt = o.target || 0;
    if (!tgt && !act) return;
    const grp = tgt ? o.tgrp : 'Other';           // anything outside the target list rolls into The Bucket
    let remaining = tgt ? Math.max(0, tgt - act) : 0;
    const deferred = (!S.includeTCA && o.name === 'Trinity Christian Academy') ? remaining : 0;
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
  Chart.defaults.color = '#55606A';
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
  el.innerHTML = `
    <div class="sec-head">
      <div><h2 class="sec">Funds Available vs. Remaining to Give</h2><div class="sec-sub">Current giving account balances compared with open 2026 targets</div></div>
      <label class="toggle"><input type="checkbox" id="tcaToggle" ${S.includeTCA ? 'checked' : ''}><span class="sw"></span>Include Trinity Christian Academy $1M in 2026</label>
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
    <div class="note mt"><b>Timing notes:</b> The $1M gift to Children's Medical is anticipated soon. The $1M gift to Trinity Christian Academy may be pushed to 2027 — use the switch above to see the funding position either way.</div>`;
  $('#tcaToggle').addEventListener('change', e => { S.includeTCA = e.target.checked; route(); });
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
    const open = rs.filter(r => r.status.t !== 'Completed' && r.status.t !== 'Unbudgeted');
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
  const yrs = [2025, 2026, 2027, 2028, 2029];
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
          <td><div class="org-name">${esc(c.label)}</div><div class="org-meta">${catChip(c.c)}</div>${c.note ? `<div class="sec-sub" style="margin-top:4px">${esc(c.note)}</div>` : ''}</td>
          <td><div class="sched">${c.sched.map(([y, a]) => {
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
  const SRC = ['The Signatry', 'The Lunsford Foundation', 'Personal', 'HLH'];
  const SRC_COLOR = { 'The Signatry': NAVY, 'The Lunsford Foundation': GOLD, 'Personal': '#5B8C9E', 'HLH': '#B9AE9B', 'Not tracked': '#DDD8CF' };
  const syrs = YEARS.filter(y => y >= Math.max(2023, y0) && y <= y1);
  $('#srcCard').innerHTML = `
    <div class="sec-head"><div><h2 class="sec">Gifts by Source Account</h2><div class="sec-sub">Which account each gift was paid from · tracked from 2023 forward</div></div></div>
    ${syrs.length ? legendHTML([...SRC, 'Not tracked'].map(s => ({ label: s === 'HLH' ? 'Holt Lunsford Holdings' : s, color: SRC_COLOR[s] }))) + '<div class="chart-box"><canvas></canvas></div>' : '<p class="sec-sub">Source accounts are tracked from 2023 forward — choose a range that includes 2023–2026.</p>'}`;
  if (syrs.length) {
    const srcOf = g => SRC.includes(g.s) ? g.s : 'Not tracked';
    mkChart($('#srcCard canvas'), {
      type: 'bar',
      data: { labels: syrs.map(y => y === CY ? 'YTD ' + y : String(y)), datasets: [...SRC, 'Not tracked'].map(s => ({ label: s === 'HLH' ? 'Holt Lunsford Holdings' : s, data: syrs.map(y => sum(D.gifts.filter(g => g.y === y && srcOf(g) === s), g => g.a)), backgroundColor: SRC_COLOR[s], borderColor: '#fff', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 56 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCfg({ mode: 'index', intersect: false, filter: i => i.parsed.y > 0 }) }, scales: { x: catAxis({ stacked: true }), y: moneyAxis({ stacked: true }) } }
    });
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
  const srcNice = s => s === 'HLH' ? 'Holt Lunsford Holdings' : s;
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
        <div class="sched">${c.sched.map(([y, a]) => { const p = y <= CY ? commitPaid(c, y) : 0; const st = p >= a ? 'paid' : y <= CY ? 'due' : 'future'; return `<span class="yr ${st}"><b>${esc(String(c.due && c.due[y] ? c.due[y] : y))}</b>${fmt(a)}${st === 'paid' ? ' ✓' : ''}</span>`; }).join('')}</div></div>` : ''}

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
   VIEW: 2027 Budget builder
   ========================================================= */
const BKEY = 'tlf_budget_2027_v1';
const nextCommit = o => {
  const c = M.commit[o]; let a = 0;
  if (c) c.sched.forEach(([y, amt]) => { if (y === NY) a += amt; });
  if (M.monthly[o]) a = Math.max(a, M.monthly[o] * 12);
  return a;
};
const commitNote = o => {
  const c = M.commit[o];
  const parts = [];
  if (c) {
    const s = c.sched.find(x => x[0] === NY);
    if (s) parts.push(`Commitment: ${fmt(s[1])}${c.due && c.due[NY] ? ' (' + c.due[NY] + ')' : ''}`);
    if (o === 'Trinity Christian Academy') parts.push('If the 2026 gift is deferred, 2027 may total $2M');
  }
  if (M.monthly[o]) parts.push(`Monthly gift ${fmt(M.monthly[o])} × 12`);
  return parts.join(' · ');
};
function defaultBudget() {
  const rows = D.targets.map(t => ({ o: t.o, cat: t.c, grp: t.g, inc: true, amt: nextCommit(t.o) || null, note: '', isNew: false }));
  // recurring monthly gifts outside the target list
  D.monthly.forEach(m => { if (!rows.find(r => r.o === m.o)) { const o = M.orgs[m.o]; rows.push({ o: m.o, cat: o.cat, grp: 'Other', inc: true, amt: m.a * 12, note: '', isNew: false }); } });
  D.commitments.forEach(c => { if (!rows.find(r => r.o === c.o) && nextCommit(c.o)) rows.push({ o: c.o, cat: c.c, grp: 'Core', inc: true, amt: nextCommit(c.o), note: '', isNew: false }); });
  return { rows, notes: '', touched: false };
}
function loadBudget() {
  try { const b = JSON.parse(LS.get(BKEY)); if (b && b.rows) return b; } catch (e) { }
  return defaultBudget();
}
function saveBudget(b) { LS.set(BKEY, JSON.stringify(b)); }

function viewBudget(el) {
  const B = loadBudget();
  const hist = o => { const x = M.orgs[o]; return x ? [x.byYear[2024] || 0, x.byYear[2025] || 0, x.byYear[2026] || 0] : [0, 0, 0]; };
  const tgt26 = o => (M.orgs[o] && M.orgs[o].target) || 0;

  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow"><a href="#/giving" style="text-decoration:none">← Back to 2026 Giving</a></div>
      <h1 class="title">2027 Target Giving Budget</h1>
      <p class="subtitle">Start from the 2026 Target organizations with trailing three-year giving. Annual commitments and recurring monthly gifts are pre-filled. Include or remove organizations, add new ones, set 2027 targets, then export.</p></div>
    <div class="toolbar">
      <button class="btn" id="bReset" title="Reset to the default 2026 target list">Reset</button>
      <button class="btn" id="bBlank">Blank template</button>
      <button class="btn btn-primary" id="bXlsx">Export to Excel</button>
      <button class="btn btn-gold" id="bPdf">Export to PDF</button>
    </div>
  </div>
  <div class="b-summary" id="bSum"></div>
  <div class="note mt" id="bMode"></div>
  <div class="card mt">
    <div class="sec-head"><div><h2 class="sec">Add an Organization</h2><div class="sec-sub">Choose a previously supported organization (history fills in automatically) or type a new one — new organizations require a Giving Category.</div></div></div>
    <div class="add-panel">
      <div><label for="aName">Organization</label><input class="input" id="aName" list="aList" placeholder="Search or type a new organization…"><datalist id="aList"></datalist></div>
      <div><label for="aCat">Giving Category</label><select class="select" id="aCat"><option value="">Choose a category…</option>${CATS.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div><label for="aGrp">Type</label><select class="select" id="aGrp"><option value="Core">Core Giving</option><option value="Other">The "Bucket"</option></select></div>
      <div><label for="aAmt">2027 Target</label><input class="input" id="aAmt" inputmode="numeric" placeholder="$0"></div>
      <div><button class="btn btn-primary" id="aAdd">Add</button></div>
    </div>
    <div class="field-err" id="aErr"></div>
  </div>
  <div class="card flush mt">
    <div class="tbl-wrap"><table class="tbl" id="bTbl"></table></div>
  </div>
  <div class="card mt">
    <h2 class="sec" style="font-size:20px">Notes &amp; Comments</h2>
    <div class="sec-sub" style="margin-bottom:10px">Included at the bottom of the PDF and Excel exports.</div>
    <textarea class="notes" id="bNotes" placeholder="Priorities, timing, matching-gift ideas, questions for Kaye Dawn…">${esc(B.notes)}</textarea>
  </div>`;

  const parseAmt = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : Math.round(n); };
  const persist = (touch = true) => { if (touch) B.touched = true; saveBudget(B); };

  const refreshList = () => {
    const have = new Set(B.rows.map(r => r.o));
    $('#aList').innerHTML = M.list.filter(o => !have.has(o.name) && o.n).sort((a, b) => b.total - a.total).map(o => `<option value="${esc(o.name)}">${esc(o.cat)} · ${fmtK(o.total)} since 2020</option>`).join('');
  };

  const drawSummary = () => {
    const inc = B.rows.filter(r => r.inc);
    const tot = sum(inc, r => r.amt || 0);
    const core = sum(inc.filter(r => r.grp === 'Core'), r => r.amt || 0);
    const committed = sum(inc, r => nextCommit(r.o));
    const t26 = sum(D.targets, t => t.t);
    const diff = tot - t26;
    $('#bSum').innerHTML = `
      <div class="card" style="background:var(--navy);border-color:var(--navy);color:#fff"><div class="l" style="color:#C9BFAE">2027 Target Total</div><div class="v" style="color:#fff">${fmt(tot)}</div><div class="s" style="color:#D7DEE3">${inc.length} organizations</div></div>
      <div class="card"><div class="l">Core Giving</div><div class="v">${fmt(core)}</div><div class="s">${inc.filter(r => r.grp === 'Core').length} organizations</div></div>
      <div class="card"><div class="l">The "Bucket"</div><div class="v">${fmt(tot - core)}</div><div class="s">${inc.filter(r => r.grp !== 'Core').length} organizations</div></div>
      <div class="card"><div class="l">Already Committed</div><div class="v">${fmt(committed)}</div><div class="s">Commitments &amp; monthly gifts</div></div>
      <div class="card"><div class="l">vs. 2026 Target</div><div class="v" style="color:${diff > 0 ? 'var(--warn)' : 'var(--navy)'}">${diff >= 0 ? '+' : ''}${fmt(diff)}</div><div class="s">2026 target ${fmt(t26)}</div></div>`;
    $('#bMode').innerHTML = B.touched
      ? `<b>Your edits are saved on this device.</b> Exports will use the organizations and amounts below. Use <b>Blank template</b> for an empty worksheet based on the 2026 Target list.`
      : `<b>Not yet customized.</b> Until you edit this budget, exports default to the 2026 Target organizations with a blank 2027 column to fill in, extra empty rows for new organizations, and space for notes.`;
  };

  const drawTable = () => {
    const sections = [['Core', 'Core Giving'], ['Other', 'The "Bucket" — Other Giving']];
    const rowHTML = (r, i) => {
      const [a, b, c] = hist(r.o), com = nextCommit(r.o), note = commitNote(r.o);
      return `<tr class="${r.inc ? '' : 'excluded'} ${r.isNew ? 'newrow' : ''}" data-i="${i}">
        <td><input type="checkbox" class="chk" data-f="inc" ${r.inc ? 'checked' : ''} aria-label="Include ${esc(r.o)}"></td>
        <td style="min-width:200px"><div class="org-name">${r.isNew ? esc(r.o) : `<a href="javascript:void 0" data-open="${esc(r.o)}" style="text-decoration:none">${esc(r.o)}</a>`} ${r.isNew ? '<span class="tag gold">New</span>' : ''}</div>${note ? `<div class="sec-sub" style="margin-top:3px">${esc(note)}</div>` : ''}</td>
        <td><select class="mini" data-f="cat">${CATS.map(x => `<option ${x === r.cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
        <td><select class="mini" data-f="grp"><option value="Core" ${r.grp === 'Core' ? 'selected' : ''}>Core</option><option value="Other" ${r.grp !== 'Core' ? 'selected' : ''}>Bucket</option></select></td>
        <td class="n">${fmtZ(a)}</td><td class="n">${fmtZ(b)}</td><td class="n">${fmtZ(c)}</td>
        <td class="n">${fmtZ(tgt26(r.o))}</td>
        <td class="n">${com ? `<span class="tag gold">${fmt(com)}</span>` : '<span class="zero">—</span>'}</td>
        <td class="n"><input class="amt ${r.amt ? 'filled' : ''}" data-f="amt" inputmode="numeric" value="${r.amt ? fmt(r.amt) : ''}" placeholder="$0"></td>
        <td><input class="txt" data-f="note" value="${esc(r.note)}" placeholder="Notes"></td>
        <td><button class="btn btn-ghost btn-sm" data-f="del" title="Remove" aria-label="Remove ${esc(r.o)}">✕</button></td>
      </tr>`;
    };
    let body = '';
    sections.forEach(([g, label]) => {
      const idx = B.rows.map((r, i) => [r, i]).filter(([r]) => (g === 'Core' ? r.grp === 'Core' : r.grp !== 'Core'));
      idx.sort((x, y) => (y[0].amt || 0) - (x[0].amt || 0) || tgt26(y[0].o) - tgt26(x[0].o));
      const inc = idx.filter(([r]) => r.inc).map(([r]) => r);
      body += `<tr class="sub"><td></td><td colspan="7">${label}</td><td class="n">${fmt(sum(inc, r => nextCommit(r.o)))}</td><td class="n">${fmt(sum(inc, r => r.amt || 0))}</td><td colspan="2"></td></tr>`;
      body += idx.map(([r, i]) => rowHTML(r, i)).join('');
    });
    const inc = B.rows.filter(r => r.inc);
    $('#bTbl').innerHTML = `
      <thead><tr><th></th><th>Organization</th><th>Giving Category</th><th>Type</th><th class="n">2024</th><th class="n">2025</th><th class="n">2026 YTD</th><th class="n">2026 Target</th><th class="n">2027 Committed</th><th class="n">2027 Target</th><th>Notes</th><th></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td></td><td colspan="3">2027 Total (included organizations)</td><td class="n">${fmt(sum(inc, r => hist(r.o)[0]))}</td><td class="n">${fmt(sum(inc, r => hist(r.o)[1]))}</td><td class="n">${fmt(sum(inc, r => hist(r.o)[2]))}</td><td class="n">${fmt(sum(inc, r => tgt26(r.o)))}</td><td class="n">${fmt(sum(inc, r => nextCommit(r.o)))}</td><td class="n">${fmt(sum(inc, r => r.amt || 0))}</td><td colspan="2"></td></tr></tfoot>`;
    $$('#bTbl tr[data-i]').forEach(tr => {
      const r = B.rows[+tr.dataset.i];
      $$('[data-f]', tr).forEach(inp => {
        const f = inp.dataset.f;
        if (f === 'inc') inp.addEventListener('change', () => { r.inc = inp.checked; persist(); drawAll(); });
        if (f === 'cat') inp.addEventListener('change', () => { r.cat = inp.value; persist(); drawSummary(); });
        if (f === 'grp') inp.addEventListener('change', () => { r.grp = inp.value; persist(); drawAll(); });
        if (f === 'note') inp.addEventListener('input', () => { r.note = inp.value; persist(); });
        if (f === 'amt') {
          inp.addEventListener('focus', () => { inp.value = r.amt ? String(r.amt) : ''; });
          inp.addEventListener('blur', () => { r.amt = parseAmt(inp.value); persist(); drawAll(); });
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
        }
        if (f === 'del') inp.addEventListener('click', () => { B.rows.splice(+tr.dataset.i, 1); persist(); drawAll(); });
      });
      const a = $('[data-open]', tr); if (a) a.addEventListener('click', () => openOrg(a.dataset.open));
    });
  };
  const drawAll = () => { drawSummary(); drawTable(); refreshList(); };

  // add organization
  $('#aName').addEventListener('input', () => {
    const o = M.orgs[$('#aName').value.trim()];
    if (o) { $('#aCat').value = CATS.includes(o.cat) ? o.cat : ''; $('#aGrp').value = o.target ? o.tgrp : (o.grp || 'Other'); }
  });
  $('#aAdd').addEventListener('click', () => {
    const name = $('#aName').value.trim(), cat = $('#aCat').value, grp = $('#aGrp').value;
    const err = $('#aErr'); err.textContent = '';
    if (!name) { err.textContent = 'Enter an organization name.'; return; }
    if (B.rows.find(r => r.o.toLowerCase() === name.toLowerCase())) { err.textContent = 'That organization is already in the budget.'; return; }
    const existing = M.orgs[name];
    if (!cat) { err.textContent = existing ? 'Choose a Giving Category.' : 'New organization — please choose its Giving Category.'; $('#aCat').focus(); return; }
    B.rows.push({ o: name, cat, grp, inc: true, amt: parseAmt($('#aAmt').value), note: '', isNew: !existing });
    persist(); drawAll();
    $('#aName').value = ''; $('#aAmt').value = ''; $('#aCat').value = '';
    toast(`${name} added to the 2027 budget`);
  });
  $('#bNotes').addEventListener('input', e => { B.notes = e.target.value; persist(); drawSummary(); });
  $('#bReset').addEventListener('click', () => { if (confirmInline('Reset the 2027 budget to the default 2026 target list? Your edits will be cleared.')) { LS.del(BKEY); route(); } });
  $('#bXlsx').addEventListener('click', () => exportBudget('xlsx', B.touched ? B : null));
  $('#bPdf').addEventListener('click', () => exportBudget('pdf', B.touched ? B : null));
  $('#bBlank').addEventListener('click', () => exportBudgetChoice());
  drawAll();
}
function confirmInline(msg) { return window.confirm(msg); }
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
  let rows;
  if (template) rows = D.targets.map(t => ({ o: t.o, cat: t.c, grp: t.g, amt: null, note: '' }));
  else rows = B.rows.filter(r => r.inc).map(r => ({ ...r }));
  rows = rows.map(r => {
    const o = M.orgs[r.o];
    return { ...r, h24: o ? o.byYear[2024] || 0 : 0, h25: o ? o.byYear[2025] || 0 : 0, h26: o ? o.byYear[2026] || 0 : 0, t26: o && o.target ? o.target : 0, com: nextCommit(r.o), cnote: commitNote(r.o) };
  });
  const order = (a, b) => (b.amt || 0) - (a.amt || 0) || b.t26 - a.t26 || b.com - a.com || a.o.localeCompare(b.o);
  return {
    template,
    core: rows.filter(r => r.grp === 'Core').sort(order),
    bucket: rows.filter(r => r.grp !== 'Core').sort(order),
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

async function exportXlsx(X) {
  await loadScript(CDN.exceljs);
  const wb = new ExcelJS.Workbook(); wb.creator = 'The Lunsford Foundation';
  const ws = wb.addWorksheet('2027 Target Budget', { views: [{ state: 'frozen', ySplit: 8, showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .3, footer: .3 } } });
  const NAVYX = 'FF26343D', GOLDX = 'FF9B835D', SOFT = 'FFF1EBE0', INPUT = 'FFFFF8E7', LINEX = 'FFE7E2D8';
  const money = '$#,##0;($#,##0);"–"';
  ws.columns = [{ width: 42 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 46 }];
  try { const img = wb.addImage({ base64: await getLogo(), extension: 'png' }); ws.addImage(img, { tl: { col: 0, row: 0.2 }, ext: { width: 300, height: 55 } }); } catch (e) { }
  ws.getRow(1).height = 22; ws.getRow(2).height = 22; ws.getRow(3).height = 14;
  ws.getCell('A5').value = `${NY} Target Giving Budget`; ws.getCell('A5').font = { name: 'Georgia', size: 18, color: { argb: NAVYX } };
  ws.getCell('A6').value = (X.template ? 'Blank template — enter 2027 targets in the shaded column. ' : '') + `Prepared ${todayLabel()} · Giving history as of ${D.asOfLabel}`;
  ws.getCell('A6').font = { size: 10, italic: true, color: { argb: 'FF55606A' } };
  const hdr = ['Organization', 'Giving Category', '2024 Giving', '2025 Giving', '2026 YTD', '2026 Target', '2027 Committed', '2027 Target', 'Notes'];
  const hr = ws.getRow(8); hr.values = hdr; hr.height = 30;
  hr.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; c.alignment = { vertical: 'middle', wrapText: true, horizontal: i >= 3 && i <= 8 ? 'right' : 'left' }; });
  ws.autoFilter = undefined;
  let r = 9; const subRows = [];
  const border = { bottom: { style: 'hair', color: { argb: LINEX } } };
  const section = (title, list, blanks) => {
    const t = ws.getRow(r); t.getCell(1).value = title; ws.mergeCells(r, 1, r, 9);
    t.getCell(1).font = { bold: true, color: { argb: NAVYX }, size: 10.5 }; t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; r++;
    const first = r;
    list.forEach(x => {
      const row = ws.getRow(r);
      row.values = [x.o, x.cat, x.h24 || null, x.h25 || null, x.h26 || null, x.t26 || null, x.com || null, x.amt != null ? x.amt : null, [x.note, x.cnote].filter(Boolean).join(' · ') || null];
      row.eachCell({ includeEmpty: true }, (c, i) => { if (i <= 9) c.border = border; if (i >= 3 && i <= 8) c.numFmt = money; c.font = { size: 10 }; });
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } }; row.getCell(8).font = { size: 10, bold: true };
      row.getCell(9).font = { size: 9, color: { argb: 'FF55606A' } }; row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
      r++;
    });
    for (let k = 0; k < blanks; k++) {
      const row = ws.getRow(r);
      row.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + CATS.join(',') + '"'], showErrorMessage: true, errorTitle: 'Giving Category', error: 'Choose one of the four giving categories.' };
      for (let i = 1; i <= 9; i++) { const c = row.getCell(i); c.border = border; if (i >= 3 && i <= 8) c.numFmt = money; }
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
      r++;
    }
    const last = r - 1;
    const s = ws.getRow(r); s.getCell(1).value = 'Subtotal — ' + title;
    for (let col = 3; col <= 8; col++) { const L = String.fromCharCode(64 + col); s.getCell(col).value = last >= first ? { formula: `SUM(${L}${first}:${L}${last})` } : 0; s.getCell(col).numFmt = money; }
    s.eachCell({ includeEmpty: true }, (c, i) => { if (i <= 9) { c.font = { bold: true, size: 10, color: { argb: NAVYX } }; c.border = { top: { style: 'thin', color: { argb: GOLDX } } }; } });
    subRows.push(r); r += 2;
    return [first, last];
  };
  const ranges = [];
  ranges.push(section('CORE GIVING', X.core, 0));
  ranges.push(section('THE "BUCKET" — OTHER GIVING', X.bucket, 0));
  ranges.push(section('ADDITIONAL ORGANIZATIONS (choose a Giving Category for each new organization)', [], X.blanks));
  const g = ws.getRow(r); g.getCell(1).value = `TOTAL ${NY} TARGET GIVING`;
  for (let col = 3; col <= 8; col++) { const L = String.fromCharCode(64 + col); g.getCell(col).value = { formula: subRows.map(sr => `${L}${sr}`).join('+') }; g.getCell(col).numFmt = money; }
  g.eachCell({ includeEmpty: true }, (c, i) => { if (i <= 9) { c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; } });
  g.height = 20; r += 3;

  // Division summary with SUMIF
  const dh = ws.getRow(r); dh.values = ['Giving by Category', '', '', '', '', '2026 Target', '2027 Committed', '2027 Target'];
  dh.eachCell((c) => { c.font = { bold: true, size: 10, color: { argb: NAVYX } }; c.border = { bottom: { style: 'thin', color: { argb: GOLDX } } }; });
  r++;
  const allRange = (L) => ranges.map(([a, b]) => b >= a ? `${L}${a}:${L}${b}` : null).filter(Boolean);
  const dFirst = r;
  CATS.forEach(c => {
    const row = ws.getRow(r); row.getCell(1).value = c;
    [6, 7, 8].forEach(col => { const L = String.fromCharCode(64 + col); row.getCell(col).value = { formula: ranges.map(([a, b]) => b >= a ? `SUMIF(B${a}:B${b},A${r},${L}${a}:${L}${b})` : '0').join('+') }; row.getCell(col).numFmt = money; });
    row.getCell(1).font = { size: 10 }; r++;
  });
  const tr = ws.getRow(r); tr.getCell(1).value = 'Total';
  [6, 7, 8].forEach(col => { const L = String.fromCharCode(64 + col); tr.getCell(col).value = { formula: `SUM(${L}${dFirst}:${L}${r - 1})` }; tr.getCell(col).numFmt = money; tr.getCell(col).font = { bold: true }; });
  tr.getCell(1).font = { bold: true }; r += 3;

  // Notes block
  const nh = ws.getRow(r); nh.getCell(1).value = 'NOTES & COMMENTS'; nh.getCell(1).font = { bold: true, color: { argb: NAVYX } }; r++;
  const nStart = r;
  ws.mergeCells(r, 1, r + 7, 9);
  const nc = ws.getCell(r, 1); nc.value = X.notes || ''; nc.alignment = { wrapText: true, vertical: 'top' };
  nc.border = { top: { style: 'thin', color: { argb: LINEX } }, left: { style: 'thin', color: { argb: LINEX } }, bottom: { style: 'thin', color: { argb: LINEX } }, right: { style: 'thin', color: { argb: LINEX } } };
  for (let k = nStart; k <= nStart + 7; k++) ws.getRow(k).height = 18;

  // Commitments sheet
  const cs = wb.addWorksheet('Commitments', { views: [{ showGridLines: false }] });
  cs.columns = [{ width: 36 }, { width: 22 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 40 }];
  cs.getCell('A1').value = 'Annual & Multi-Year Commitments'; cs.getCell('A1').font = { name: 'Georgia', size: 16, color: { argb: NAVYX } };
  const ch = cs.getRow(3); ch.values = ['Organization', 'Giving Category', 'Total', '2025', '2026', '2027', '2028', '2029', 'Notes'];
  ch.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYX } }; });
  let cr = 4;
  D.commitments.forEach(c => {
    const row = cs.getRow(cr); const by = {}; c.sched.forEach(([y, a]) => by[y] = a);
    row.values = [c.label, c.c, c.total, by[2025] || null, by[2026] || null, by[2027] || null, by[2028] || null, by[2029] || null, c.note];
    for (let i = 3; i <= 8; i++) row.getCell(i).numFmt = money; cr++;
  });
  D.monthly.forEach(m => { const row = cs.getRow(cr); row.values = [m.o, M.orgs[m.o].cat, null, null, m.a * 12, m.a * 12, null, null, `Monthly gift ${fmt(m.a)}`]; for (let i = 3; i <= 8; i++) row.getCell(i).numFmt = money; cr++; });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), X.template ? `Lunsford Foundation - ${NY} Target Budget Template.xlsx` : `Lunsford Foundation - ${NY} Target Budget.xlsx`);
}

async function exportPdf(X) {
  await loadScript(CDN.jspdf); await loadScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mL = 36;
  const navy = [38, 52, 61], gold = [155, 131, 93], soft = [241, 235, 224], ink2 = [85, 96, 106];
  try { doc.addImage(await getLogo(), 'PNG', mL, 24, 190, 35); } catch (e) { }
  doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor(...navy);
  doc.text(`${NY} Target Giving Budget`, W - mL, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink2);
  doc.text((X.template ? 'Blank template · ' : '') + `Prepared ${todayLabel()} · Giving history as of ${D.asOfLabel}`, W - mL, 58, { align: 'right' });
  doc.setDrawColor(...gold); doc.setLineWidth(.8); doc.line(mL, 70, W - mL, 70);
  const m = v => v ? fmt(v) : '';
  const body = [];
  const sec = (title, list, blanks) => {
    body.push([{ content: title, colSpan: 9, styles: { fillColor: soft, textColor: navy, fontStyle: 'bold' } }]);
    list.forEach(x => body.push([x.o, x.cat, m(x.h24), m(x.h25), m(x.h26), m(x.t26), m(x.com), x.amt != null ? fmt(x.amt) : '', [x.note, x.cnote].filter(Boolean).join(' · ')]));
    for (let k = 0; k < blanks; k++) body.push(['', '', '', '', '', '', '', '', '']);
    if (list.length) body.push([{ content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold', textColor: navy } }, ...['h24', 'h25', 'h26', 't26', 'com', 'amt'].map(k => ({ content: fmt(sum(list, x => x[k] || 0)), styles: { fontStyle: 'bold', textColor: navy } })), '']);
  };
  sec('CORE GIVING', X.core, 0);
  sec('THE "BUCKET" — OTHER GIVING', X.bucket, 0);
  sec('ADDITIONAL ORGANIZATIONS — choose a Giving Category for each', [], X.blanks);
  const all = [...X.core, ...X.bucket];
  const foot = [[{ content: `TOTAL ${NY} TARGET GIVING`, colSpan: 2 }, ...['h24', 'h25', 'h26', 't26', 'com'].map(k => fmt(sum(all, x => x[k] || 0))), X.template ? '' : fmt(sum(all, x => x.amt || 0)), '']];
  doc.autoTable({
    startY: 82, head: [['Organization', 'Giving Category', '2024', '2025', '2026 YTD', '2026 Target', '2027 Committed', '2027 Target', 'Notes']], body, foot,
    theme: 'grid', showFoot: 'lastPage', margin: { left: mL, right: mL, bottom: 40 },
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 4, lineColor: [231, 226, 216], lineWidth: .4, textColor: [30, 42, 50], minCellHeight: 15, valign: 'middle' },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 7.6 },
    footStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 92 }, 2: { halign: 'right', cellWidth: 52 }, 3: { halign: 'right', cellWidth: 52 }, 4: { halign: 'right', cellWidth: 52 }, 5: { halign: 'right', cellWidth: 56 }, 6: { halign: 'right', cellWidth: 60 }, 7: { halign: 'right', cellWidth: 62, fillColor: [255, 248, 231], fontStyle: 'bold' }, 8: { cellWidth: 'auto', fontSize: 6.8, textColor: ink2 } },
    didParseCell: d => { if ((d.section === 'head' || d.section === 'foot') && d.column.index >= 2 && d.column.index <= 7) d.cell.styles.halign = 'right'; }
  });
  let y = doc.lastAutoTable.finalY + 22;
  if (y > H - 200) { doc.addPage(); y = 50; }
  // Category summary
  const catRows = CATS.map(c => { const L = all.filter(x => x.cat === c); return [c, fmt(sum(L, x => x.t26)), fmt(sum(L, x => x.com)), X.template ? '' : fmt(sum(L, x => x.amt || 0))]; });
  doc.autoTable({
    startY: y, head: [['Giving by Category', '2026 Target', '2027 Committed', '2027 Target']], body: catRows,
    theme: 'plain', margin: { left: mL }, tableWidth: 360,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 42, 50] }, headStyles: { textColor: navy, fontStyle: 'bold', lineWidth: { bottom: .8 }, lineColor: gold },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: d => { if (d.section === 'head' && d.column.index) d.cell.styles.halign = 'right'; }
  });
  // Notes box
  const nx = mL + 390, nw = W - mL - nx, ny = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...navy); doc.text('NOTES & COMMENTS', nx, ny + 10);
  doc.setDrawColor(231, 226, 216); doc.setLineWidth(.5); doc.rect(nx, ny + 16, nw, 120);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 42, 50);
  if (X.notes) doc.text(doc.splitTextToSize(X.notes, nw - 16), nx + 8, ny + 30);
  else { doc.setDrawColor(236, 232, 224); for (let k = 1; k <= 6; k++) doc.line(nx + 8, ny + 16 + k * 17, nx + nw - 8, ny + 16 + k * 17); }
  // footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(...ink2);
    doc.text('The Lunsford Foundation · Confidential', mL, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - mL, H - 20, { align: 'right' });
  }
  doc.save(X.template ? `Lunsford Foundation - ${NY} Target Budget Template.pdf` : `Lunsford Foundation - ${NY} Target Budget.pdf`);
}
