(function () {
  'use strict';

  // Auth Check
  const token = sessionStorage.getItem('tnes_token');
  const role = sessionStorage.getItem('tnes_role');
  const name = sessionStorage.getItem('tnes_name');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const $   = s => document.querySelector(s);
  const $$  = s => document.querySelectorAll(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function safeId(name) { return String(name).replace(/[^a-zA-Z0-9_]/g, '_'); }
  function setMsg(el, text, type) { const m = typeof el === 'string' ? $(el) : el; if (m) { m.className = 'msg' + (text ? ' show ' + type : ''); m.textContent = text || ''; } }
  
  function computeSubjectLabel(name, stream) { 
    if (!stream) return name; 
    const n = String(name || '').toLowerCase(); 
    if (n.indexOf('computer') !== -1 && n.indexOf('bio') !== -1) return stream === 'Biology' ? 'Biology' : 'Computer Science'; 
    return name; 
  }

  function updateComputerBioLabel(stream) {
    $$('#subjectGrid input[data-subject]').forEach(inp => {
      const name = inp.dataset.subject;
      const labelSpan = inp.closest('.subject-field').querySelector('.subj-label');
      if (!labelSpan) return;
      labelSpan.textContent = computeSubjectLabel(name, stream);
    });
  }

  const state = { subjects: [], student: null, existing: null, passPct: null, requested: null, deleteTarget: null };

  /* Secured Proxy Call */
  async function callProxy(payload) {
    if (!RESULTS.proxyUrl) throw new Error('Database not connected.');
    payload.token = token; // Attach token
    
    const res = await fetch(RESULTS.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('Could not reach the server.');
    
    const data = await res.json();
    
    // Auto-logout on expired token
    if (data.error && data.error.indexOf('Unauthorized') !== -1) {
      sessionStorage.clear();
      window.location.href = 'index.html';
      return;
    }
    if (data.error) throw new Error(data.error);
    return data;
  }

  /* Tabs */
  $$('.admin-tab').forEach(tab => {
    if(tab.id === 'openDashboardBtn') return;
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      $$('.admin-tab-content').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      $('#tab-' + tab.dataset.tab).style.display = '';
      if (tab.dataset.tab === 'students') loadStudentsList();
      if (tab.dataset.tab === 'subjects') loadSubjectSettings();
    });
  });

  // Show Dashboard link only for Principal
  if (role === 'Principal') {
    const dashBtn = $('#openDashboardBtn');
    if (dashBtn) {
      dashBtn.style.display = 'block';
      dashBtn.addEventListener('click', () => window.open('dashboard.html', '_blank'));
    }
  }

  /* Loader Form */
  function populateSelects() {
    const cs = $('#classSelect'); if (cs && !cs.options.length) cs.innerHTML = RESULTS.classes.map(c => `<option value="${c}">Class ${c}</option>`).join('');
    const ms = $('#monthSelect'); if (ms && !ms.options.length) ms.innerHTML = RESULTS.months.map(m => `<option value="${m}">${m}</option>`).join('');
    const yi = $('#yearInput'); if (yi && !yi.value) yi.value = new Date().getFullYear();
  }

  const loaderForm = $('#loaderForm');
  if (loaderForm) {
    populateSelects();
    loaderForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const cls = $('#classSelect').value, roll = $('#rollInput').value.trim();
      const month = $('#monthSelect').value, year = $('#yearInput').value.trim();
      if (!roll) return setMsg('#loaderMsg', 'Please enter the roll number.', 'err');
      if (!year) return setMsg('#loaderMsg', 'Please enter the year.', 'err');

      setMsg('#loaderMsg', '', '');
      const btn = $('#loadBtn'); btn.disabled = true; const original = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Loading…';

      try {
        const data = await callProxy({ action: 'admin_lookup', class: cls, roll, month, year });
        state.subjects = data.subjects; state.student = data.student; state.existing = data.existing; state.passPct = data.passPct; state.requested = { class: cls, roll, month, year };
        renderMarksPanel();
      } catch (err) {
        setMsg('#loaderMsg', err.message || 'Could not load.', 'err'); $('#marksPanel').style.display = 'none';
      } finally {
        btn.disabled = false; btn.textContent = original;
      }
    });
  }

  /* Render Marks */
  function renderMarksPanel() {
    const panel = $('#marksPanel'); panel.style.display = '';
    $('#saveSuccess').classList.remove('show');
    const { student, existing, requested, passPct } = state;
    const modeLabel = existing ? 'Existing entry — editing' : 'No entry — creating new';
    const modeClass = existing ? 'badge editing' : 'badge new';

    $('#marksLead').textContent = `Entering marks for ${requested.month} ${requested.year}. ` + (existing ? 'Editing existing entry.' : 'Creating new entry.');
    $('#studentSummary').innerHTML = `
      <div class="field-pair"><span>Roll No</span><strong>${esc(student.roll)}</strong></div>
      <div class="field-pair"><span>Name</span><strong>${esc(student.name || '—')}</strong></div>
      <div class="field-pair"><span>Father</span><strong>${esc(student.father || '—')}</strong></div>
      <div class="field-pair"><span>Class</span><strong>${esc(requested.class)}</strong></div>
      <div class="field-pair"><span>Month</span><strong>${esc(requested.month)} ${esc(requested.year)}</strong></div>
      <span class="${modeClass}">${modeLabel}</span>`;

    const grid = $('#subjectGrid');
    grid.innerHTML = state.subjects.map(s => {
      const current = existing && existing.marks[s.name] != null ? existing.marks[s.name] : '';
      const label = computeSubjectLabel(s.name, student.stream);
      return `<div class="subject-field"><label class="subj-name" for="subj_${safeId(s.name)}"><span class="subj-label">${esc(label)}</span><span class="subj-max">out of ${s.max}</span></label><input id="subj_${safeId(s.name)}" data-subject="${esc(s.name)}" data-max="${s.max}" type="number" min="0" max="${s.max}" step="0.5" placeholder="—" value="${current !== '' ? current : ''}"></div>`;
    }).join('');

    grid.querySelectorAll('input[data-max]').forEach(inp => {
      inp.addEventListener('input', () => { const v = parseFloat(inp.value), m = parseFloat(inp.dataset.max); inp.classList.toggle('out-of-range', !isNaN(v) && (v < 0 || v > m)); });
    });

    if (requested.class === '9' || requested.class === '10') {
      $('#streamField').style.display = '';
      $('#streamSelect').value = student.stream || 'Computer';
      $('#streamSelect').onchange = function () { updateComputerBioLabel(this.value); };
    } else {
      $('#streamField').style.display = 'none';
    }

    $('#remarksInput').value = existing && existing.meta && existing.meta.remarks ? existing.meta.remarks : '';
    $('#submitNote').textContent = state.subjects.length + ' subjects' + (passPct ? ' · Pass: ' + passPct + '%' : '');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* Save Marks */
  const marksForm = $('#marksForm');
  if (marksForm) {
    marksForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const marks = {}; let bad = '';
      $$('#subjectGrid input[data-subject]').forEach(inp => {
        const raw = inp.value.trim(); if (raw === '') return;
        const n = parseFloat(raw), m = parseFloat(inp.dataset.max);
        if (isNaN(n) || n < 0 || n > m) { if (!bad) bad = inp.dataset.subject; return; }
        marks[inp.dataset.subject] = n;
      });
      if (bad) return setMsg('#saveMsg', `Mark for "${bad}" is out of range.`, 'err');
      if (!Object.keys(marks).length) return setMsg('#saveMsg', 'Please enter at least one mark.', 'err');

      const btn = $('#saveBtn'); btn.disabled = true; const original = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Saving…';
      setMsg('#saveMsg', '', '');

      try {
        const { requested } = state;
        const stream = (requested.class === '9' || requested.class === '10') ? $('#streamSelect').value : '';
        const result = await callProxy({ action: 'admin_submit', class: requested.class, roll: requested.roll, month: requested.month, year: requested.year, marks, remarks: $('#remarksInput').value.trim(), stream });

        $('#marksPanel').style.display = 'none';
        $('#saveSuccess').classList.add('show');
        $('#saveSuccessTitle').textContent = result.action === 'updated' ? 'Marks updated.' : 'Marks saved.';
        $('#saveSuccessBody').textContent = `Class ${requested.class} · Roll ${requested.roll} · ${requested.month} ${requested.year} recorded.`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setMsg('#saveMsg', err.message || 'Could not save marks.', 'err');
      } finally {
        btn.disabled = false; btn.textContent = original;
      }
    });
  }

  function resetMarks() { $('#marksPanel').style.display = 'none'; $('#saveSuccess').classList.remove('show'); $('#loaderForm').reset(); populateSelects(); $('#rollInput').value = ''; $('#rollInput').focus(); setMsg('#loaderMsg', '', ''); setMsg('#saveMsg', '', ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if($('#clearBtn')) $('#clearBtn').addEventListener('click', resetMarks);
  if($('#loadAnother')) $('#loadAnother').addEventListener('click', resetMarks);

  /* Students Management */
  if($('#filterClass')) $('#filterClass').addEventListener('change', loadStudentsList);
  if($('#addStudentBtn')) $('#addStudentBtn').addEventListener('click', openAddModal);

  async function loadStudentsList() {
    const cls = $('#filterClass').value;
    setMsg('#studentsMsg', '', '');
    $('#studentsBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Loading…</td></tr>';
    try {
      const data = await callProxy({ action: 'admin_list_students', class: cls });
      renderStudentsTable(data.students || []);
    } catch (err) {
      setMsg('#studentsMsg', err.message || 'Could not load students.', 'err'); $('#studentsBody').innerHTML = '';
    }
  }

  function renderStudentsTable(students) {
    const body = $('#studentsBody');
    if (!students.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">No students found.</td></tr>'; return; }
    body.innerHTML = students.map(s => `
      <tr><td>${esc(s.roll)}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>Class ${esc(s.class)}</td><td>${esc(s.stream || '—')}</td>
      <td class="student-actions"><button class="btn-small btn-edit" data-roll="${esc(s.roll)}" data-class="${esc(s.class)}">Edit</button><button class="btn-small btn-delete" data-roll="${esc(s.roll)}" data-class="${esc(s.class)}" data-name="${esc(s.name)}">Delete</button></td></tr>`).join('');
    body.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.roll, btn.dataset.class)));
    body.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => openDeleteModal(btn.dataset.roll, btn.dataset.class, btn.dataset.name)));
  }

  function openAddModal() {
    $('#modalTitle').textContent = 'Add Student'; $('#origRoll').value = ''; $('#origClass').value = '';
    $('#studentRoll').value = ''; $('#studentName').value = ''; $('#studentFather').value = ''; $('#studentClass').value = ''; $('#studentStream').value = '';
    toggleStreamField(''); setMsg('#modalMsg', '', ''); $('#studentModal').classList.add('show'); $('#studentRoll').focus();
  }

  async function openEditModal(roll, cls) {
    try {
      const data = await callProxy({ action: 'admin_get_student', roll, class: cls });
      const s = data.student;
      $('#modalTitle').textContent = 'Edit Student'; $('#origRoll').value = s.roll; $('#origClass').value = s.class;
      $('#studentRoll').value = s.roll; $('#studentName').value = s.name; $('#studentFather').value = s.father; $('#studentClass').value = s.class; $('#studentStream').value = s.stream || '';
      toggleStreamField(s.class); setMsg('#modalMsg', '', ''); $('#studentModal').classList.add('show');
    } catch (err) { setMsg('#studentsMsg', err.message || 'Could not load student.', 'err'); }
  }

  function toggleStreamField(cls) { if($('#studentStreamField')) $('#studentStreamField').style.display = (cls === '9' || cls === '10') ? '' : 'none'; }
  if($('#studentClass')) $('#studentClass').addEventListener('change', function () { toggleStreamField(this.value); });
  if($('#modalClose')) $('#modalClose').addEventListener('click', () => $('#studentModal').classList.remove('show'));
  if($('#modalCancel')) $('#modalCancel').addEventListener('click', () => $('#studentModal').classList.remove('show'));

  if($('#studentForm')) $('#studentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const isEdit = $('#origRoll').value !== '';
    const payload = { action: isEdit ? 'admin_update_student' : 'admin_add_student', roll: $('#studentRoll').value.trim(), name: $('#studentName').value.trim(), father: $('#studentFather').value.trim(), class: $('#studentClass').value, stream: $('#studentStream').value };
    if (isEdit) { payload.originalRoll = $('#origRoll').value; payload.originalClass = $('#origClass').value; }
    const btn = $('#modalSave'); btn.disabled = true; const original = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      await callProxy(payload); $('#studentModal').classList.remove('show'); setMsg('#studentsMsg', (isEdit ? 'Student updated.' : 'Student added.'), 'ok'); loadStudentsList();
    } catch (err) { setMsg('#modalMsg', err.message || 'Save failed.', 'err'); } finally { btn.disabled = false; btn.textContent = original; }
  });

  function openDeleteModal(roll, cls, name) {
    state.deleteTarget = { roll, class: cls }; $('#deleteMessage').innerHTML = `Delete <strong>${esc(name)}</strong> (Roll ${esc(roll)})?`; $('#deleteMarksCheckbox').checked = true; setMsg('#deleteMsg', '', ''); $('#deleteModal').classList.add('show');
  }
  if($('#deleteModalClose')) $('#deleteModalClose').addEventListener('click', () => $('#deleteModal').classList.remove('show'));
  if($('#deleteCancel')) $('#deleteCancel').addEventListener('click', () => $('#deleteModal').classList.remove('show'));

  if($('#deleteConfirm')) $('#deleteConfirm').addEventListener('click', async function () {
    const btn = this; btn.disabled = true; const original = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Deleting…';
    try {
      await callProxy({ action: 'admin_delete_student', roll: state.deleteTarget.roll, class: state.deleteTarget.class, deleteMarks: $('#deleteMarksCheckbox').checked });
      $('#deleteModal').classList.remove('show'); setMsg('#studentsMsg', 'Student deleted.', 'ok'); loadStudentsList();
    } catch (err) { setMsg('#deleteMsg', err.message || 'Delete failed.', 'err'); } finally { btn.disabled = false; btn.textContent = original; }
  });

  /* Subject Settings */
  if($('#settingsClassSelect')) $('#settingsClassSelect').addEventListener('change', loadSubjectSettings);
  if($('#saveSubjectSettings')) $('#saveSubjectSettings').addEventListener('click', saveSubjectSettings);

  async function loadSubjectSettings() {
    const cls = $('#settingsClassSelect').value;
    setMsg('#settingsMsg', '', ''); $('#settingsBody').innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:#888">Loading…</td></tr>';
    try {
      const data = await callProxy({ action: 'admin_get_subject_settings', class: cls });
      renderSettingsTable(data.subjects || []);
      if($('#passPctInput')) $('#passPctInput').value = (data.passPct != null) ? data.passPct : 40;
    } catch (err) { setMsg('#settingsMsg', err.message || 'Could not load settings.', 'err'); $('#settingsBody').innerHTML = ''; }
  }

  function renderSettingsTable(subjects) {
    if (!subjects.length) { $('#settingsBody').innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:#888">No subjects found.</td></tr>'; return; }
    $('#settingsBody').innerHTML = subjects.map(s => `<tr><td><strong style="color:#1e3a5f">${esc(s.name)}</strong>${s.hasMaxOverride ? '' : '<span style="color:#8a8a8a;font-size:.8rem;margin-left:8px">(default 100)</span>'}</td><td><input type="number" class="max-input" data-subject="${esc(s.name)}" value="${s.max}" min="1" max="1000" step="1"></td></tr>`).join('');
    $$('#settingsBody input.max-input').forEach(inp => { inp.addEventListener('input', () => { const v = parseFloat(inp.value); inp.style.borderColor = (isNaN(v) || v < 1 || v > 1000) ? '#9d1f1f' : ''; }); });
  }

  async function saveSubjectSettings() {
    const cls = $('#settingsClassSelect').value; const updates = []; let bad = '';
    $$('#settingsBody input.max-input').forEach(inp => { const v = parseFloat(inp.value); if (isNaN(v) || v < 1 || v > 1000) { if (!bad) bad = inp.dataset.subject; return; } updates.push({ name: inp.dataset.subject, max: v }); });
    if (bad) return setMsg('#settingsMsg', `Total for "${bad}" must be 1-1000.`, 'err');
    const passPct = parseFloat($('#passPctInput').value);
    if (isNaN(passPct) || passPct < 1 || passPct >= 100) return setMsg('#settingsMsg', 'Passing percentage must be 1-99.', 'err');
    if (!updates.length) return setMsg('#settingsMsg', 'No valid totals to save.', 'err');

    const btn = $('#saveSubjectSettings'); btn.disabled = true; const original = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Saving…'; setMsg('#settingsMsg', '', '');

    try {
      const res = await callProxy({ action: 'admin_update_subject_max', class: cls, updates, passPct });
      setMsg('#settingsMsg', `Saved Class ${cls} — ${res.applied} updates applied.`, 'ok'); loadSubjectSettings();
    } catch (err) { setMsg('#settingsMsg', err.message || 'Could not save settings.', 'err'); } finally { btn.disabled = false; btn.textContent = original; }
  }

  /* Masthead */
  document.addEventListener('DOMContentLoaded', () => {
    if($('#crestMark')) $('#crestMark').textContent = SCHOOL.short;
    if($('#crestName')) $('#crestName').textContent = SCHOOL.name;
    if($('#footCopyright')) $('#footCopyright').textContent = '\u00A9 ' + new Date().getFullYear() + ' ' + SCHOOL.name + ', ' + SCHOOL.campus + '.';
    if($('#welcomeName')) $('#welcomeName').textContent = name || "Staff";
  });
})();