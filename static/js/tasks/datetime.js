import { TasksAPI } from './api.js';
import { notify } from './notifications.js';

export function bindDateTime(ctrl) {
  const {
    taskDateTimeDisplay,
    dateTimePicker,
    dtTimePanel,
    hourToggleBtn,
    repeatToggleBtn,
    repeatMenu,
    setTimeBtn,
    hourMinus,
    hourPlus,
    minuteMinus,
    minutePlus,
    timeHour,
    timeMinute,
    calPrev,
    calNext,
    calMonthLabel,
    calendarGrid,
    monthYearPicker,
    monthsGrid,
    yearInput,
    yearUp,
    yearDown,
  } = ctrl.els;

  if (taskDateTimeDisplay && !taskDateTimeDisplay.dataset.bound) {
    taskDateTimeDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      ensureDtState(ctrl);
      renderCalendar(ctrl);
      if (dtTimePanel) dtTimePanel.classList.add('is-hidden');
      if (repeatMenu) repeatMenu.classList.add('is-hidden');
      toggle(dateTimePicker);
    });
    taskDateTimeDisplay.dataset.bound = '1';
  }

  if (hourToggleBtn && dtTimePanel && !hourToggleBtn.dataset.bound) {
    hourToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle(dtTimePanel);
    });
    hourToggleBtn.dataset.bound = '1';
  }

  if (repeatToggleBtn && repeatMenu && !repeatToggleBtn.dataset.bound) {
    repeatToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle(repeatMenu);
    });
    repeatToggleBtn.dataset.bound = '1';
  }

  if (setTimeBtn && !setTimeBtn.dataset.bound) {
    setTimeBtn.addEventListener('click', async () => {
      await applyTime(ctrl);
    });
    setTimeBtn.dataset.bound = '1';
  }

  // Calendar navigation
  if (calPrev && !calPrev.dataset.bound) {
    calPrev.addEventListener('click', () => shiftCalendar(ctrl, -1));
    calPrev.dataset.bound = '1';
  }
  if (calNext && !calNext.dataset.bound) {
    calNext.addEventListener('click', () => shiftCalendar(ctrl, 1));
    calNext.dataset.bound = '1';
  }
  if (calMonthLabel && monthYearPicker && !calMonthLabel.dataset.bound) {
    calMonthLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      const willShow = monthYearPicker.classList.contains('is-hidden');
      monthYearPicker.classList.toggle('is-hidden', !willShow);
      if (yearInput) yearInput.value = String(ctrl.dtState.viewYear || new Date().getFullYear());
      if (monthsGrid) {
        monthsGrid.querySelectorAll('button').forEach((btn) => {
          const m = parseInt(btn.dataset.month, 10);
          btn.classList.toggle('active', m === (ctrl.dtState.viewMonth || 0));
          btn.addEventListener('click', () => {
            ctrl.dtState.viewMonth = Math.max(0, Math.min(11, m));
            monthYearPicker.classList.add('is-hidden');
            renderCalendar(ctrl);
          });
        });
      }
    });
    calMonthLabel.dataset.bound = '1';
  }
  if (yearUp && !yearUp.dataset.bound) {
    yearUp.addEventListener('click', () => setPickerYear(ctrl, (ctrl.dtState.viewYear || new Date().getFullYear()) + 1));
    yearUp.dataset.bound = '1';
  }
  if (yearDown && !yearDown.dataset.bound) {
    yearDown.addEventListener('click', () => setPickerYear(ctrl, (ctrl.dtState.viewYear || new Date().getFullYear()) - 1));
    yearDown.dataset.bound = '1';
  }
  if (yearInput && !yearInput.dataset.bound) {
    yearInput.addEventListener('change', () => setPickerYear(ctrl, parseInt(yearInput.value, 10) || new Date().getFullYear()));
    yearInput.dataset.bound = '1';
  }

  // Hour/minute controls
  if (hourPlus) hourPlus.addEventListener('click', () => adjust(ctrl, 'hour', 1));
  if (hourMinus) hourMinus.addEventListener('click', () => adjust(ctrl, 'hour', -1));
  if (minutePlus) minutePlus.addEventListener('click', () => adjust(ctrl, 'minute', 5));
  if (minuteMinus) minuteMinus.addEventListener('click', () => adjust(ctrl, 'minute', -5));

  if (timeHour) {
    timeHour.addEventListener('blur', () => setFromInput(ctrl, 'hour', timeHour.value));
  }
  if (timeMinute) {
    timeMinute.addEventListener('blur', () => setFromInput(ctrl, 'minute', timeMinute.value));
  }

  // Outside click and Escape to close picker
  if (dateTimePicker && !dateTimePicker.dataset.outsideBound) {
    const outsideHandler = (e) => {
      if (!isVisible(dateTimePicker)) return;
      const t = e.target;
      if (dateTimePicker.contains(t)) return;
      if (taskDateTimeDisplay && taskDateTimeDisplay.contains(t)) return;
      hidePicker(ctrl);
    };
    const escHandler = (e) => {
      if (e.key === 'Escape' && isVisible(dateTimePicker)) hidePicker(ctrl);
    };
    document.addEventListener('click', outsideHandler, true);
    document.addEventListener('keydown', escHandler, true);
    dateTimePicker.dataset.outsideBound = '1';
  }
}

function toggle(el) {
  if (!el) return;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  const hidden = el.classList.contains('is-hidden') || el.style.display === 'none' || (style && style.display === 'none');
  if (hidden) {
    el.classList.remove('is-hidden');
    if (el.style) el.style.display = 'block';
  } else {
    el.classList.add('is-hidden');
    if (el.style) el.style.display = 'none';
  }
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  return !(el.classList.contains('is-hidden') || el.style.display === 'none' || (style && style.display === 'none'));
}

function hideEl(el) {
  if (!el) return;
  el.classList.add('is-hidden');
  if (el.style) el.style.display = 'none';
}

function adjust(ctrl, key, delta) {
  ctrl.dtState = ctrl.dtState || { hour: 0, minute: 0 };
  let v = Number(ctrl.dtState[key] || 0) + delta;
  if (key === 'hour') v = (v + 24) % 24;
  if (key === 'minute') v = (v + 60) % 60;
  ctrl.dtState[key] = v;
  syncInputs(ctrl);
}

function setFromInput(ctrl, key, value) {
  let v = parseInt(value, 10);
  if (isNaN(v)) v = 0;
  if (key === 'hour') v = Math.max(0, Math.min(23, v));
  if (key === 'minute') v = Math.max(0, Math.min(59, v));
  ctrl.dtState[key] = v;
  syncInputs(ctrl);
}

function syncInputs(ctrl) {
  const { timeHour, timeMinute } = ctrl.els;
  if (timeHour) timeHour.value = String(ctrl.dtState.hour ?? 0).padStart(2, '0');
  if (timeMinute) timeMinute.value = String(ctrl.dtState.minute ?? 0).padStart(2, '0');
}

async function applyTime(ctrl) {
  if (!ctrl.selectedTask) return;
  const t = ctrl.selectedTask;
  const baseDate = t.due_date ? new Date(t.due_date) : new Date();
  const y = baseDate.getFullYear();
  const m = String(baseDate.getMonth() + 1).padStart(2, '0');
  const d = String(baseDate.getDate()).padStart(2, '0');
  const hh = String(ctrl.dtState?.hour ?? 0).padStart(2, '0');
  const mm = String(ctrl.dtState?.minute ?? 0).padStart(2, '0');
  const due_date = `${y}-${m}-${d}T${hh}:${mm}:00`;
  try {
    await TasksAPI.update(t.id, { due_date });
    await ctrl.reloadTasks();
    const updated = (ctrl.tasks || []).find((x) => String(x.id) === String(t.id));
    if (updated) ctrl.selectTask(updated);
    notify('Hora actualizada', 'success');
  } catch (e) {
    notify('Error al actualizar fecha/hora', 'error');
  }
}

// ===== Calendar helpers =====
function ensureDtState(ctrl) {
  const now = new Date();
  const t = ctrl.selectedTask;
  if (t && t.due_date) {
    const d = new Date(t.due_date);
    ctrl.dtState.viewYear = d.getFullYear();
    ctrl.dtState.viewMonth = d.getMonth();
    ctrl.dtState.selectedDate = localYMD(d);
    ctrl.dtState.hour = d.getHours();
    ctrl.dtState.minute = d.getMinutes();
  } else {
    ctrl.dtState.viewYear = now.getFullYear();
    ctrl.dtState.viewMonth = now.getMonth();
    ctrl.dtState.selectedDate = null;
    ctrl.dtState.hour = ctrl.dtState.hour ?? 0;
    ctrl.dtState.minute = ctrl.dtState.minute ?? 0;
  }
}

function localYMD(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthNameEs(m) {
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return names[m] || '';
}

export function renderCalendar(ctrl) {
  const grid = ctrl.els.calendarGrid;
  if (!grid || ctrl.dtState.viewYear == null || ctrl.dtState.viewMonth == null) return;
  const y = ctrl.dtState.viewYear;
  const m = ctrl.dtState.viewMonth;
  if (ctrl.els.calMonthLabel) ctrl.els.calMonthLabel.textContent = `${monthNameEs(m)} ${y}`;
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevMonthDays = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    const dayNum = prevMonthDays - startWeekday + 1 + i;
    const d = new Date(y, m - 1, dayNum);
    cells.push({ date: d, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), outside: false });
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: true });
  }
  grid.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  const selected = ctrl.dtState.selectedDate;
  const frag = document.createDocumentFragment();
  cells.forEach(cell => {
    const el = document.createElement('div');
    el.className = 'cal-day';
    if (cell.outside) el.classList.add('is-outside');
    const d0 = new Date(cell.date); d0.setHours(0,0,0,0);
    if (d0.getTime() === today.getTime()) el.classList.add('is-today');
    const ymd = localYMD(cell.date);
    if (selected && ymd === selected) el.classList.add('is-selected');
    el.textContent = String(cell.date.getDate());
    el.dataset.date = ymd;
    el.addEventListener('click', () => selectDate(ctrl, ymd));
    frag.appendChild(el);
  });
  grid.appendChild(frag);
}

function shiftCalendar(ctrl, deltaMonths) {
  let y = ctrl.dtState.viewYear;
  let m = ctrl.dtState.viewMonth + deltaMonths;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  ctrl.dtState.viewYear = y;
  ctrl.dtState.viewMonth = m;
  renderCalendar(ctrl);
}

function setPickerYear(ctrl, y) {
  ctrl.dtState.viewYear = y;
  if (ctrl.els.yearInput) ctrl.els.yearInput.value = String(y);
  renderCalendar(ctrl);
}

function selectDate(ctrl, ymd) {
  ctrl.dtState.selectedDate = ymd;
  renderCalendar(ctrl);
  // Immediately persist the selected date (auto-save behavior)
  void persistDueDate(ctrl);
}

function hidePicker(ctrl) {
  const { dateTimePicker, dtTimePanel, repeatMenu, monthYearPicker } = ctrl.els;
  hideEl(dtTimePanel);
  hideEl(repeatMenu);
  hideEl(monthYearPicker);
  hideEl(dateTimePicker);
}

async function persistDueDate(ctrl) {
  try {
    if (!ctrl.selectedTask) return;
    let dueDateStr = null;
    if (ctrl.dtState.selectedDate) {
      const hh = String(ctrl.dtState.hour ?? 0).padStart(2, '0');
      const mm = String(ctrl.dtState.minute ?? 0).padStart(2, '0');
      dueDateStr = `${ctrl.dtState.selectedDate}T${hh}:${mm}:00`;
    }
    await TasksAPI.update(ctrl.selectedTask.id, { due_date: dueDateStr, repeat_pattern: ctrl.dtState.repeat || null });
    await ctrl.reloadTasks();
    const updated = (ctrl.tasks || []).find((t) => String(t.id) === String(ctrl.selectedTask.id));
    if (updated) ctrl.selectTask(updated);
    notify('Fecha actualizada', 'success');
  } catch (e) {
    notify('Error al actualizar fecha', 'error');
  }
}
