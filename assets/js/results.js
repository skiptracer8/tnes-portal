/* ============================================================
   RESULT PORTAL — client side
   Talks only to the Apps Script proxy. Reads passPct from the
   server (which sources it from Row 2 of each class tab).
   ============================================================ */
(function () {
  'use strict';

  const $   = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const MONTH_ORDER = ['january','february','march','april','may','june',
                       'july','august','september','october','november','december'];

  const DEFAULT_PASS_PCT = 40;

  /* ---------- Server call ---------- */
  async function loadStudent(cls, roll, month, year) {
    if (!RESULTS.proxyUrl || RESULTS.proxyUrl.indexOf('PASTE') === 0) {
      throw new Error('The portal has not been connected to the school database yet.');
    }
    const res = await fetch(RESULTS.proxyUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify({ action: 'lookup', class: cls, roll, month, year })
    });
    if (!res.ok) throw new Error('Could not reach the result server. Please try again.');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /* ---------- Helpers ---------- */
  function gradeOf(p, passPct) {
    const pp = (passPct == null || isNaN(passPct)) ? DEFAULT_PASS_PCT : passPct;
    if (p < pp)  return 'F';
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B';
    if (p >= 60) return 'C';
    if (p >= 50) return 'D';
    return 'E';
  }

  function progressSortKey(p) {
    const mi = MONTH_ORDER.indexOf(String(p.month).toLowerCase());
    const y  = parseInt(p.year, 10) || 0;
    return y * 12 + (mi >= 0 ? mi : 99);
  }

  function shortLabel(p) {
    const m = String(p.month).slice(0, 3).toUpperCase();
    return p.year ? `${m} '${String(p.year).slice(-2)}` : m;
  }

  function matchesProgress(p, req) {
    return String(p.month).toLowerCase().indexOf(String(req.month).toLowerCase()) !== -1
        && String(p.year).trim() === String(req.year).trim();
  }

  /* ---------- Chart ---------- */
  function buildChart(points, highlightIndex, passPct) {
    if (!points.length) return '<p class="muted">No progress data available.</p>';
    const pp = (passPct == null || isNaN(passPct)) ? DEFAULT_PASS_PCT : passPct;

    const W = 720, H = 280;
    const P = { l: 56, r: 24, t: 22, b: 52 };
    const iw = W - P.l - P.r;
    const ih = H - P.t - P.b;
    const n  = points.length;
    const X  = i => P.l + (n === 1 ? iw / 2 : i * (iw / (n - 1)));
    const Y  = v => P.t + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;

    let grid = '';
    for (let i = 0; i <= 5; i++) {
      const val = i * 20;
      grid += `<line x1="${P.l}" y1="${Y(val)}" x2="${W - P.r}" y2="${Y(val)}" stroke="#e8e3d8"/>`;
      grid += `<text x="${P.l - 12}" y="${Y(val) + 4}" text-anchor="end"
                     font-family="Source Sans 3, sans-serif" font-size="11" fill="#8a8a8a">${val}</text>`;
    }

    const passY = Y(pp);
    const passLine =
      `<line x1="${P.l}" y1="${passY}" x2="${W - P.r}" y2="${passY}"
             stroke="#9d1f1f" stroke-width="1" stroke-dasharray="4 4" opacity="0.55"/>
       <text x="${W - P.r - 4}" y="${passY - 6}" text-anchor="end"
             font-family="Source Sans 3, sans-serif" font-size="10"
             fill="#9d1f1f" opacity="0.8">Pass line ${pp}%</text>`;

    const polyline = points.map((p, i) => `${X(i)},${Y(p.pct)}`).join(' ');
    const dots = points.map((p, i) => {
      const isHL = i === highlightIndex;
      const r    = isHL ? 6 : 4.5;
      const fill = isHL ? '#8a6d3b' : '#1e3a5f';
      return `<circle cx="${X(i)}" cy="${Y(p.pct)}" r="${r}" fill="${fill}" stroke="#ffffff" stroke-width="2">
                <title>${esc(shortLabel(p))} — ${p.pct}%</title></circle>`;
    }).join('');

    const labels = points.map((p, i) =>
      `<text x="${X(i)}" y="${H - 22}" text-anchor="middle"
             font-family="Source Sans 3, sans-serif" font-size="10"
             fill="#6d6d6d" letter-spacing=".06em">${esc(shortLabel(p))}</text>`).join('');

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress across the session">
      ${grid}${passLine}
      <polyline points="${polyline}" fill="none" stroke="#1e3a5f" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}
    </svg>`;
  }

  /* ---------- Render ---------- */
  function render(data) {
    const out        = $('#resultOut');
    const { target, progress, subjects, requested } = data;
    const passPct    = data.passPct || DEFAULT_PASS_PCT;
    const sortedP    = progress.slice().sort((a, b) => progressSortKey(a) - progressSortKey(b));

    const reqLabel   = `${requested.month} ${requested.year}`;
    const student    = target.meta;

    /* Totals for the requested month */
    let got = 0, max = 0;
    subjects.forEach(s => {
      const v = target.marks[s.name];
      if (v === null || v === undefined || isNaN(v)) return;
      got += v;
      max += s.max;
    });
    const pct   = max ? +(got / max * 100).toFixed(2) : 0;
    const grade = student.grade || gradeOf(pct, passPct);

    /* Subject-wise table */
    const subjectRows = subjects.map(s => {
      const v    = target.marks[s.name];
      const has  = v !== null && v !== undefined && !isNaN(v);
      const sp   = has ? (v / s.max * 100) : 0;
      const pass = has && sp >= passPct;
      const label = s.displayName || s.name;
      return `<tr>
        <td>${esc(label)}</td>
        <td class="num">${s.max}</td>
        <td class="num ${has ? (pass ? 'pass' : 'fail') : ''}">${has ? v : '—'}</td>
        <td class="num">${has ? sp.toFixed(1) + '%' : '—'}</td>
        <td class="num ${has ? (pass ? 'pass' : 'fail') : ''}">${has ? gradeOf(sp, passPct) : '—'}</td>
      </tr>`;
    }).join('');

    /* Summary table (all months) */
    const summaryRows = sortedP.map(p => {
      const isCurrent = matchesProgress(p, requested);
      const monthGrade = p.grade || gradeOf(p.pct, passPct);
      return `<tr class="${isCurrent ? 'current' : ''}">
        <td>${esc(p.month + (p.year ? ' ' + p.year : ''))}</td>
        <td class="num">${p.pct}%</td>
        <td class="num">${esc(monthGrade)}</td>
      </tr>`;
    }).join('');

    const highlightIdx = sortedP.findIndex(p => matchesProgress(p, requested));

    const today = new Date().toLocaleDateString('en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' });

    out.innerHTML = `
      <article class="report">

        <header class="report-head">
          <div class="report-crest">${esc(SCHOOL.short)}</div>
          <h2>${esc(SCHOOL.name)}</h2>
          <p class="addr">${esc(SCHOOL.address)}</p>
          <div class="doc-title">Monthly Progress Report</div>
        </header>

        <div class="report-meta">
          <span>Class: <strong>${esc(requested.class || '')}</strong></span>
          <span>Reporting Month: <strong>${esc(reqLabel)}</strong></span>
          <span>Pass Threshold: <strong>${passPct}%</strong></span>
          <span>Generated: <strong>${esc(today)}</strong></span>
        </div>

        <table class="report-info">
          <tbody>
            <tr>
              <th>Student</th><td>${esc(student.name || '—')}</td>
              <th>Roll No</th><td>${esc(student.roll || '—')}</td>
            </tr>
            <tr>
              <th>Father</th><td colspan="3">${esc(student.father || '—')}</td>
            </tr>
          </tbody>
        </table>

                <section class="report-section">
          <h3>Subject-wise Marks — ${esc(reqLabel)}</h3>
          <div style="overflow-x: auto; width: 100%;">
            <table class="report-marks">
            <thead>
              <tr>
                <th>Subject</th>
                <th class="num">Max</th>
                <th class="num">Obtained</th>
                <th class="num">Percent</th>
                <th class="num">Grade</th>
              </tr>
            </thead>
            <tbody>${subjectRows}</tbody>
            <tfoot>
              <tr>
                <td class="label">Total</td>
                <td class="num">${max}</td>
                <td class="num">${got}</td>
                <td class="num">${pct}%</td>
                <td class="num">${esc(grade)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        ${student.remarks ? `
          <div class="report-remark">
            <strong>Teacher's Remark</strong>
            <p>${esc(student.remarks)}</p>
          </div>` : ''}

        <section class="report-section">
          <h3>Progress Across the Session</h3>
          <div class="chart-wrap">
            ${buildChart(sortedP, highlightIdx >= 0 ? highlightIdx : sortedP.length - 1, passPct)}
          </div>
        </section>

        <section class="report-section">
          <h3>All Months — Summary</h3>
          <table class="report-marks">
            <thead>
              <tr>
                <th>Month</th>
                <th class="num">Percentage</th>
                <th class="num">Grade</th>
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
          </table>
        </section>

        <div class="report-signatures">
          <div class="sig">Class Teacher</div>
          <div class="sig">Principal</div>
          <div class="sig">Parent / Guardian</div>
        </div>

      </article>

      <div class="result-actions no-print">
        <button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
        <button class="btn btn-outline" id="newSearch">Search Another Result</button>
      </div>`;

    $('#newSearch').addEventListener('click', reset);
    setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  /* ---------- Reset ---------- */
  function reset() {
    $('#resultOut').innerHTML = '';
    $('#resultForm').reset();
    const yi = $('#yearInput');
    if (yi) yi.value = new Date().getFullYear();
    setMsg('', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setMsg(text, type) {
    const m = $('#formMsg');
    if (!m) return;
    m.className = 'msg' + (text ? ' show ' + type : '');
    m.textContent = text;
  }

  /* ---------- Form setup ---------- */
  const form = $('#resultForm');
  if (!form) return;

  const cs = $('#classSelect');
  if (cs) {
    cs.innerHTML = RESULTS.classes
      .map(c => `<option value="${c}">Class ${c}</option>`).join('');
  }

  const ms = $('#monthSelect');
  if (ms) {
    ms.innerHTML = RESULTS.months
      .map(m => `<option value="${m}">${m}</option>`).join('');
  }

  const yi = $('#yearInput');
  if (yi && !yi.value) yi.value = new Date().getFullYear();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const cls   = cs.value;
    const roll  = $('#rollInput').value.trim();
    const month = ms.value;
    const year  = yi.value.trim();

    if (!roll) return setMsg('Please enter the roll number.', 'err');
    if (!year) return setMsg('Please enter the year.', 'err');

    const btn = $('#submitBtn');
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    setMsg('', '');

    try {
      const data = await loadStudent(cls, roll, month, year);
      data.requested.class = cls;
      render(data);
    } catch (err) {
      setMsg(err.message || 'Something went wrong. Please try again.', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
})();
