export const DAY_MS = 24 * 60 * 60 * 1000;
export const START_HOUR = 0; // 00:00
export const END_HOUR = 23;  // 23:00
export const SLOT_MINUTES = 15; // 15-minute snapping

export function fmtDateISO(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
export function toMinutes(h, m) { return h * 60 + m; }
export function fromMinutes(min) { return { h: Math.floor(min/60), m: min % 60 }; }
export function startOfWeek(d) { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
export function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s.getTime()+6*DAY_MS); e.setHours(23,59,59,999); return e; }
export function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
export function endOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x; }
export function getWeeksInMonth(d){ const first = startOfMonth(d); const start = startOfWeek(first); const last = endOfMonth(d); const end = endOfWeek(last); const weeks=[]; let cur=new Date(start); while(cur<=end){ weeks.push(new Date(cur)); cur = new Date(cur.getTime()+7*DAY_MS);} return weeks; }
export function prettyMonth(d){ return d.toLocaleString(undefined,{ month:'long', year:'numeric' }); }
export function prettyWeekRange(d){ const s=startOfWeek(d), e=endOfWeek(d); const opts={ month:'short', day:'numeric' }; const sStr=s.toLocaleDateString(undefined, opts); const eStr=e.toLocaleDateString(undefined, opts); return `${sStr} – ${eStr}, ${d.getFullYear()}`; }
export function prettyDay(d){ return d.toLocaleString(undefined,{ weekday:'short', month:'short', day:'numeric', year:'numeric' }); }

export function fmtLocalDateTime(d){
  const pad = (n) => String(n).padStart(2, '0');
  return `${fmtDateISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function attachUtilsToWindow(){
  window.CalendarUtils = { DAY_MS, START_HOUR, END_HOUR, SLOT_MINUTES, fmtDateISO, fmtLocalDateTime, toMinutes, fromMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeeksInMonth, prettyMonth, prettyWeekRange, prettyDay };
}
