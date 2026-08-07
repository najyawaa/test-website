(() => {
  'use strict';

  /* ---------------- Grade scale ---------------- */
  const GRADES = [
    { label: 'A',  value: 4.0 },
    { label: 'B+', value: 3.5 },
    { label: 'B',  value: 3.0 },
    { label: 'C+', value: 2.5 },
    { label: 'C',  value: 2.0 },
    { label: 'D+', value: 1.5 },
    { label: 'D',  value: 1.0 },
    { label: 'F',  value: 0.0 }
  ];
  const CREDITS = [1, 1.5, 2, 3, 4];
  const STORAGE_KEY = 'gpa_calc_courses_v1';
  const THEME_KEY = 'gpa_calc_theme_v1';
  const RING_CIRCUMFERENCE = 603.19;

  /* -------- storage wrapper: falls back to memory if localStorage is blocked -------- */
  const memoryStore = {};
  let storageAvailable = true;
  try {
    const t = '__gpa_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
  } catch (e) {
    storageAvailable = false;
  }
  const storage = {
    get(key) {
      if (storageAvailable) {
        try { return window.localStorage.getItem(key); } catch (e) { /* fallthrough */ }
      }
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    },
    set(key, val) {
      if (storageAvailable) {
        try { window.localStorage.setItem(key, val); return; } catch (e) { /* fallthrough */ }
      }
      memoryStore[key] = val;
    }
  };

  /* ---------------- DOM refs ---------------- */
  const courseBody   = document.getElementById('courseBody');
  const addRowBtn     = document.getElementById('addRowBtn');
  const resetBtn       = document.getElementById('resetBtn');
  const exportBtn      = document.getElementById('exportBtn');
  const themeToggle    = document.getElementById('themeToggle');
  const gpaValueEl     = document.getElementById('gpaValue');
  const totalCreditsEl = document.getElementById('totalCredits');
  const totalCoursesEl = document.getElementById('totalCourses');
  const totalPointsEl  = document.getElementById('totalPoints');
  const ringProgress   = document.getElementById('ringProgress');
  const autosaveNote   = document.getElementById('autosaveNote');
  const toastEl        = document.getElementById('toast');

  let rowCounter = 0;
  let toastTimer = null;

  /* ---------------- Toast ---------------- */
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* ---------------- Row creation ---------------- */
  function buildGradeOptions(selected) {
    return GRADES.map(g =>
      `<option value="${g.value}" ${g.value === selected ? 'selected' : ''}>${g.label} (${g.value.toFixed(1)})</option>`
    ).join('');
  }
  function buildCreditOptions(selected) {
    return CREDITS.map(c =>
      `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`
    ).join('');
  }

  function createRow(data = {}) {
    rowCounter += 1;
    const tr = document.createElement('tr');
    tr.className = 'course-row';
    tr.dataset.rowId = rowCounter;

    const name   = data.name || '';
    const credit = data.credit !== undefined ? Number(data.credit) : 3;
    const grade  = data.grade !== undefined ? Number(data.grade) : 4.0;

    tr.innerHTML = `
      <td class="row-idx"></td>
      <td><input type="text" class="field field-name" placeholder="เช่น แคลคูลัส 1" value="${escapeHtml(name)}" /></td>
      <td>
        <select class="field field-credit">${buildCreditOptions(credit)}</select>
      </td>
      <td>
        <select class="field field-grade">${buildGradeOptions(grade)}</select>
      </td>
      <td class="points-cell">0.00</td>
      <td>
        <button type="button" class="del-btn" aria-label="ลบวิชานี้">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </td>
    `;

    tr.querySelector('.field-name').addEventListener('input', handleChange);
    tr.querySelector('.field-credit').addEventListener('change', handleChange);
    tr.querySelector('.field-grade').addEventListener('change', handleChange);
    tr.querySelector('.del-btn').addEventListener('click', () => removeRow(tr));

    return tr;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function reindexRows() {
    const rows = courseBody.querySelectorAll('.course-row');
    rows.forEach((row, i) => {
      row.querySelector('.row-idx').textContent = i + 1;
    });
  }

  /* ---------------- Add / remove ---------------- */
  function addRow(data, { skipSave } = {}) {
    const row = createRow(data);
    courseBody.appendChild(row);
    reindexRows();
    calculate();
    if (!skipSave) saveState();
    return row;
  }

  function removeRow(row) {
    if (courseBody.querySelectorAll('.course-row').length <= 1) {
      // keep at least one row, just clear it
      row.querySelector('.field-name').value = '';
      row.querySelector('.field-credit').value = '3';
      row.querySelector('.field-grade').value = '4';
      calculate();
      saveState();
      return;
    }
    row.classList.add('removing');
    row.addEventListener('animationend', () => {
      row.remove();
      reindexRows();
      calculate();
      saveState();
    }, { once: true });
  }

  function handleChange() {
    calculate();
    saveState();
  }

  /* ---------------- Calculation ---------------- */
  function calculate() {
    const rows = courseBody.querySelectorAll('.course-row');
    let totalCredits = 0;
    let totalPoints = 0;
    let courseCount = 0;

    rows.forEach(row => {
      const creditSel = row.querySelector('.field-credit');
      const gradeSel  = row.querySelector('.field-grade');
      const credit = parseFloat(creditSel.value) || 0;
      const gradeVal = parseFloat(gradeSel.value);
      const points = credit * gradeVal;

      row.querySelector('.points-cell').textContent = points.toFixed(2);

      if (credit > 0) {
        totalCredits += credit;
        totalPoints += points;
        courseCount += 1;
      }
    });

    const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;

    animateNumberText(gpaValueEl, gpa.toFixed(2));
    totalCreditsEl.textContent = formatCredits(totalCredits);
    totalCoursesEl.textContent = String(courseCount);
    totalPointsEl.textContent = totalPoints.toFixed(2);

    const ratio = Math.max(0, Math.min(1, gpa / 4));
    const offset = RING_CIRCUMFERENCE * (1 - ratio);
    ringProgress.style.strokeDashoffset = offset.toFixed(2);
    ringProgress.style.stroke = gpaColor(gpa);
  }

  function formatCredits(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function gpaColor(gpa) {
    if (gpa >= 3.5) return getVar('--good-600');
    if (gpa >= 2.5) return getVar('--gold-500');
    if (gpa >= 1.5) return getVar('--warn-600');
    return getVar('--bad-600');
  }
  function getVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim() || '#c9a227';
  }

  let lastGpaText = null;
  function animateNumberText(el, text) {
    if (text === lastGpaText) return;
    lastGpaText = text;
    el.textContent = text;
    el.classList.remove('pulse');
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  /* ---------------- Persistence ---------------- */
  function saveState() {
    const rows = courseBody.querySelectorAll('.course-row');
    const data = Array.from(rows).map(row => ({
      name: row.querySelector('.field-name').value,
      credit: row.querySelector('.field-credit').value,
      grade: row.querySelector('.field-grade').value
    }));
    storage.set(STORAGE_KEY, JSON.stringify(data));
  }

  function loadState() {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length === 0) return false;
      courseBody.innerHTML = '';
      data.forEach(item => addRow(item, { skipSave: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- Reset ---------------- */
  function resetAll() {
    courseBody.innerHTML = '';
    addRow({}, { skipSave: true });
    saveState();
    showToast('ล้างข้อมูลเรียบร้อยแล้ว');
  }

  /* ---------------- Theme ---------------- */
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    storage.set(THEME_KEY, theme);
    // refresh ring color which reads CSS vars
    calculate();
  }
  function initTheme() {
    const saved = storage.get(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }
  themeToggle.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ---------------- Export as image ---------------- */
  exportBtn.addEventListener('click', async () => {
    if (typeof html2canvas === 'undefined') {
      showToast('ไม่สามารถโหลดโมดูลบันทึกภาพได้ ลองใหม่อีกครั้ง');
      return;
    }
    exportBtn.disabled = true;
    const originalLabel = exportBtn.innerHTML;
    exportBtn.innerHTML = 'กำลังสร้างภาพ...';
    try {
      const target = document.querySelector('.hero-grid');
      const canvas = await html2canvas(target, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `gpa-result-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('บันทึกภาพผลลัพธ์เรียบร้อยแล้ว');
    } catch (err) {
      showToast('เกิดข้อผิดพลาดขณะบันทึกภาพ');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalLabel;
    }
  });

  /* ---------------- Wire up ---------------- */
  addRowBtn.addEventListener('click', () => addRow());
  resetBtn.addEventListener('click', () => {
    if (confirm('ต้องการล้างข้อมูลรายวิชาทั้งหมดหรือไม่?')) resetAll();
  });

  if (!storageAvailable) {
    autosaveNote.textContent = 'หน้าต่างนี้บล็อกการบันทึกลงเบราว์เซอร์ ข้อมูลจะหายเมื่อรีเฟรช (เปิดไฟล์นี้ตรงๆ ในเบราว์เซอร์เพื่อบันทึกอัตโนมัติ)';
  }

  /* ---------------- Init ---------------- */
  initTheme();
  const restored = loadState();
  if (!restored) {
    addRow({ name: '', credit: 3, grade: 4.0 }, { skipSave: true });
  }
  calculate();
})();