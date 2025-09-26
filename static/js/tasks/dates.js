// Date helpers to avoid timezone off-by-one issues
export function parseTaskDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d) return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return new Date(dateStr);
}

export function formatDateForInput(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimeForInput(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

