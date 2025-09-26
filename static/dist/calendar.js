(function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const START_HOUR = 0; // 00:00
  const END_HOUR = 23;  // 23:00
  const SLOT_MINUTES = 15; // 15-minute snapping

  function fmtDateISO(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function toMinutes(h, m) { return h * 60 + m; }
  function fromMinutes(min) { return { h: Math.floor(min/60), m: min % 60 }; }
  function startOfWeek(d) { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s.getTime()+6*DAY_MS); e.setHours(23,59,59,999); return e; }
  function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
  function endOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x; }
  function getWeeksInMonth(d){ const first = startOfMonth(d); const start = startOfWeek(first); const last = endOfMonth(d); const end = endOfWeek(last); const weeks=[]; let cur=new Date(start); while(cur<=end){ weeks.push(new Date(cur)); cur = new Date(cur.getTime()+7*DAY_MS);} return weeks; }
  function prettyMonth(d){ return d.toLocaleString(undefined,{ month:'long', year:'numeric' }); }
  function prettyWeekRange(d){ const s=startOfWeek(d), e=endOfWeek(d); const opts={ month:'short', day:'numeric' }; const sStr=s.toLocaleDateString(undefined, opts); const eStr=e.toLocaleDateString(undefined, opts); return `${sStr} – ${eStr}, ${d.getFullYear()}`; }
  function prettyDay(d){ return d.toLocaleString(undefined,{ weekday:'short', month:'short', day:'numeric', year:'numeric' }); }

  function fmtLocalDateTime(d){
    const pad = (n) => String(n).padStart(2, '0');
    return `${fmtDateISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function attachUtilsToWindow(){
    window.CalendarUtils = { DAY_MS, START_HOUR, END_HOUR, SLOT_MINUTES, fmtDateISO, fmtLocalDateTime, toMinutes, fromMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeeksInMonth, prettyMonth, prettyWeekRange, prettyDay };
  }

  var Utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    DAY_MS: DAY_MS,
    END_HOUR: END_HOUR,
    SLOT_MINUTES: SLOT_MINUTES,
    START_HOUR: START_HOUR,
    attachUtilsToWindow: attachUtilsToWindow,
    endOfMonth: endOfMonth,
    endOfWeek: endOfWeek,
    fmtDateISO: fmtDateISO,
    fmtLocalDateTime: fmtLocalDateTime,
    fromMinutes: fromMinutes,
    getWeeksInMonth: getWeeksInMonth,
    prettyDay: prettyDay,
    prettyMonth: prettyMonth,
    prettyWeekRange: prettyWeekRange,
    startOfMonth: startOfMonth,
    startOfWeek: startOfWeek,
    toMinutes: toMinutes
  });

  class CalendarStore {
    constructor(storageKey='calendar_events_v1') { this.key = storageKey; this.events = this.load(); }
    load(){ try{ const s = localStorage.getItem(this.key); return s ? JSON.parse(s) : []; }catch(_){ return []; } }
    save(){ try{ localStorage.setItem(this.key, JSON.stringify(this.events)); }catch(_){} }
    list(){ return [...this.events]; }
    byDay(date){ const dayISO = fmtDateISO(date); return this.events.filter(ev => fmtDateISO(new Date(String(ev.start).replace(' ','T')))===dayISO); }
    add(ev){ ev.id = String(ev.id || (Date.now()+Math.random())); this.events.push(ev); this.save(); return ev; }
    update(id, patch){ const sid = String(id); const i=this.events.findIndex(e=>String(e.id)===sid); if(i>=0){ this.events[i] = { ...this.events[i], ...patch }; this.save(); return this.events[i]; } return null; }
    get(id){ const sid=String(id); return this.events.find(e=>String(e.id)===sid)||null; }
    delete(id){ const sid=String(id); const i=this.events.findIndex(e=>String(e.id)===sid); if(i>=0){ this.events.splice(i,1); this.save(); return true; } return false; }
    ensureRangeLoaded(_start,_end){ return Promise.resolve(); }
  }

  class CalendarApiStore {
    constructor(baseUrl='/api/calendar/events'){
      this.baseUrl = baseUrl;
      this.events = [];
      this._pending = new Map();
    }
    list(){ return [...this.events]; }
    get(id){ const sid=String(id); return this.events.find(e=>String(e.id)===sid)||null; }
    async ensureRangeLoaded(startISO, endISO){
      const params = new URLSearchParams();
      if (startISO) params.set('start', startISO);
      if (endISO) params.set('end', endISO);
      const res = await fetch(`${this.baseUrl}?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming = Array.isArray(data.events) ? data.events : [];
      // merge
      const byId = new Map(this.events.map(e=>[String(e.id), e]));
      incoming.forEach(ev => {
        const id = String(ev.id);
        // normalize datetime to T form for UI consistency
        const norm = { ...ev };
        if (typeof norm.start === 'string') norm.start = norm.start.replace(' ', 'T').slice(0,16);
        if (typeof norm.end === 'string') norm.end = norm.end.replace(' ', 'T').slice(0,16);
        if (byId.has(id)){
          Object.assign(byId.get(id), norm);
        } else {
          byId.set(id, norm);
        }
      });
      this.events = Array.from(byId.values());
    }
    async add(payload){
      const body = JSON.stringify(payload);
      const res = await fetch(this.baseUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, body });
      if (!res.ok) throw new Error('Failed to create event');
      const data = await res.json();
      const ev = data.event || {};
      // normalize
      if (typeof ev.start === 'string') ev.start = ev.start.replace(' ', 'T').slice(0,16);
      if (typeof ev.end === 'string') ev.end = ev.end.replace(' ', 'T').slice(0,16);
      ev.id = String(ev.id);
      this.events.push(ev);
      return ev;
    }
    update(id, patch, opts = {}){
      const { debounce = true } = opts;
      // optimistic local update
      const sid=String(id);
      const i=this.events.findIndex(e=>String(e.id)===sid);
      const norm = { ...patch };
      if (typeof norm.start === 'string') norm.start = norm.start.replace(' ', 'T').slice(0,16);
      if (typeof norm.end === 'string') norm.end = norm.end.replace(' ', 'T').slice(0,16);
      if(i>=0){ this.events[i] = { ...this.events[i], ...norm }; }
      if (!debounce){
        // immediate PUT and promise resolution
        return (async () => {
          try {
            const res = await fetch(`${this.baseUrl}/${encodeURIComponent(sid)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(patch) });
            if (res.ok){
              const data = await res.json();
              const ev = data.event || {};
              if (typeof ev.start === 'string') ev.start = ev.start.replace(' ', 'T').slice(0,16);
              if (typeof ev.end === 'string') ev.end = ev.end.replace(' ', 'T').slice(0,16);
              const j=this.events.findIndex(e=>String(e.id)===sid);
              if (j>=0) this.events[j] = { ...this.events[j], ...ev };
              return this.events[j] || null;
            }
          } catch(_){ /* ignore network errors for now */ }
          return this.events[i] || null;
        })();
      }
      // debounce PUT for drag/resize
      if (this._pending.has(sid)) clearTimeout(this._pending.get(sid));
      const t = setTimeout(async ()=>{
        try {
          const res = await fetch(`${this.baseUrl}/${encodeURIComponent(sid)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(patch) });
          if (res.ok){ const data = await res.json(); const ev = data.event; if (ev){ if (typeof ev.start === 'string') ev.start = ev.start.replace(' ', 'T').slice(0,16); if (typeof ev.end === 'string') ev.end = ev.end.replace(' ', 'T').slice(0,16); const j=this.events.findIndex(e=>String(e.id)===sid); if (j>=0) this.events[j] = { ...this.events[j], ...ev }; } }
        } catch(_){ }
        finally { this._pending.delete(sid); }
      }, 200);
      this._pending.set(sid, t);
      return Promise.resolve(this.events[i] || null);
    }
    async delete(id){
      const sid=String(id);
      const i=this.events.findIndex(e=>String(e.id)===sid);
      if(i>=0){ this.events.splice(i,1); }
      try { await fetch(`${this.baseUrl}/${encodeURIComponent(sid)}`, { method:'DELETE' }); } catch(_){ }
      return true;
    }
  }

  const DEFAULT_EVENT_COLOR = '#f4f6ff';
  const PASTEL_COLOR_MAP = {
    blue: '#dbeafe',
    purple: '#ede9fe',
    orange: '#ffedd5',
    green: '#dcfce7',
    red: '#fee2e2',
    teal: '#ccfbf1',
    gray: '#e5e7eb',
    pink: '#fce7f3',
    yellow: '#fef9c3',
    indigo: '#e0e7ff',
  };

  const pastelizeColor = (value) => {
    if (!value) return DEFAULT_EVENT_COLOR;
    const trimmed = String(value).trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
    const key = trimmed.toLowerCase();
    if (PASTEL_COLOR_MAP[key]) return PASTEL_COLOR_MAP[key];
    if (/^rgba?\(/.test(key) || key.startsWith('var(')) return trimmed;
    return trimmed.length ? trimmed : DEFAULT_EVENT_COLOR;
  };

  class CalendarApp {
    constructor(rootId) {
      this.$root = document.getElementById(rootId);
      if (!this.$root) return;
    this.store = new CalendarApiStore();
      this.view = 'month';
      this.currentDate = new Date();
      this.drag = null;
      this.nowTimer = null;
      this._nowNeedles = null;
      this._suppressClickUntil = 0;
      this.setup();
      this.render();
    }

    setup(){
      this.$root.classList.add('calendar-root');
      this.$root.innerHTML = `
      <div class="calendar-header">
        <div class="left">
          <button class="btn secondary" data-act="today">Today</button>
          <button class="btn icon" data-act="prev" title="Previous"><i class="fas fa-chevron-left"></i></button>
          <div class="title" id="calTitle"></div>
          <button class="btn icon" data-act="next" title="Next"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="right">
          <button class="btn primary" data-act="add"><i class="fas fa-plus"></i></button>
          <div class="view-toggle" role="tablist" aria-label="Calendar views">
            <button class="pill" data-view="month">Month</button>
            <button class="pill" data-view="week">Week</button>
            <button class="pill" data-view="day">Day</button>
          </div>
        </div>
      </div>
      <div class="calendar-body">
        <div id="calendarView" class="calendar-view"></div>
      </div>
      <div id="calendarModalRoot"></div>
    `;
      this.$title = this.$root.querySelector('#calTitle');
      this.$view = this.$root.querySelector('#calendarView');

      this.$root.querySelector('[data-act="today"]').addEventListener('click', ()=>{ this.currentDate = new Date(); this.render(); });
      this.$root.querySelector('[data-act="prev"]').addEventListener('click', ()=>{ this.navigate(-1); });
      this.$root.querySelector('[data-act="next"]').addEventListener('click', ()=>{ this.navigate(1); });
      this.$root.querySelector('[data-act="add"]').addEventListener('click', ()=>{ this.openEventModal(); });
      this.$root.querySelectorAll('.view-toggle .pill').forEach(btn=>{
        btn.addEventListener('click', ()=>{ this.view = btn.dataset.view; this.render(); });
      });

      document.addEventListener('mouseup', (e)=> this.onMouseUp(e));
      document.addEventListener('mousemove', (e)=> this.onMouseMove(e));
    }

    navigate(delta){
      if(this.view==='month'){
        const d=this.currentDate; this.currentDate = new Date(d.getFullYear(), d.getMonth()+delta, Math.min(d.getDate(), 28));
      } else if(this.view==='week'){
        this.currentDate = new Date(this.currentDate.getTime()+delta*7*DAY_MS);
      } else {
        this.currentDate = new Date(this.currentDate.getTime()+delta*DAY_MS);
      }
      this.render();
    }

    async render(){
      this.$root.querySelectorAll('.view-toggle .pill').forEach(b=>{
        b.classList.toggle('active', b.dataset.view===this.view);
      });
      this.clearNowTimer();
      // ensure events loaded for the visible range
      if(this.view==='month'){
        const first = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const last = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth()+1, 0);
        await this.store.ensureRangeLoaded(`${fmtDateISO(first)} 00:00:00`, `${fmtDateISO(last)} 23:59:59`);
        this.$title.textContent = prettyMonth(this.currentDate);
        this.renderMonth();
      } else if(this.view==='week'){
        const s = startOfWeek(this.currentDate); const e = new Date(s.getTime()+6*DAY_MS);
        await this.store.ensureRangeLoaded(`${fmtDateISO(s)} 00:00:00`, `${fmtDateISO(e)} 23:59:59`);
        this.$title.textContent = prettyWeekRange(this.currentDate);
        this.renderWeek();
      } else {
        const d = fmtDateISO(this.currentDate);
        await this.store.ensureRangeLoaded(`${d} 00:00:00`, `${d} 23:59:59`);
        this.$title.textContent = prettyDay(this.currentDate);
        this.renderDay();
      }
    }

    renderMonth(){
      const weeks = getWeeksInMonth(this.currentDate);
      const monthIdx = this.currentDate.getMonth();
      const todayISO = fmtDateISO(new Date());
      const daysHeader = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      let html = '<div class="month-grid">';
      html += '<div class="month-weekdays">' + daysHeader.map(d=>`<div class="wd">${d}</div>`).join('') + '</div>';
      for(const weekStart of weeks){
        html += '<div class="week-row">';
        for(let i=0;i<7;i++){
          const day = new Date(weekStart.getTime()+i*DAY_MS);
          const inMonth = day.getMonth()===monthIdx;
          const dayISO = fmtDateISO(day);
          const dayEvents = this.store.list().filter(ev => {
            const s = ev.start;
            // If string without 'T', it might be date-only (all-day) or space-formatted timestamp
            if (typeof s === 'string' && !s.includes('T')){
              if (s.length <= 10){
                return s.slice(0,10) === dayISO;
              }
              // Space-formatted datetime: parse by inserting 'T'
              const parsed = new Date(s.replace(' ', 'T'));
              return fmtDateISO(parsed) === dayISO;
            }
            return fmtDateISO(new Date(s))===dayISO;
          })
          // Sort: all-day first, then by start time ascending
          .map(ev => {
            const s = ev.start;
            const hasTime = !(typeof s === 'string' && !s.includes('T') && s.length <= 10);
            const d = hasTime ? new Date(typeof s === 'string' ? s : s) : null;
            const startMin = hasTime ? d.getHours()*60 + d.getMinutes() : -1;
            return { ev, hasTime, startMin };
          })
          .sort((a,b)=> (Number(a.hasTime) - Number(b.hasTime)) || (a.startMin - b.startMin) || (a.ev.title||'').localeCompare(b.ev.title||''))
          .map(x=> x.ev);
          html += `
          <div class="day-cell ${inMonth?'':'out-month'} ${dayISO===todayISO ? 'is-today' : ''}" data-date="${dayISO}">
            <div class="date-label">${day.getDate()}</div>
            <div class="events">
              ${dayEvents.map(ev=>{
                const s = ev.start;
                const hasTime = (typeof s === 'string' && s.includes('T')) || (typeof s === 'string' && !s.includes('T') && s.length > 10);
                let timeFrag = '';
                if (hasTime){
                  const sd = new Date((typeof s === 'string' && !s.includes('T')) ? s.replace(' ', 'T') : ev.start);
                  const hh = String(sd.getHours()).padStart(2,'0');
                  const mm = String(sd.getMinutes()).padStart(2,'0');
                  const time24 = `${hh}:${mm}`;
                  timeFrag = `<span class="event-time">${time24}</span>`;
                }
                return `
                <div class=\"event-chip\" data-id=\"${ev.id}\" style=\"background:${pastelizeColor(ev.color)}\" title=\"${ev.title}\">\n                    <span class=\"event-title\">${ev.title}</span>\n                    ${timeFrag}\n                  </div>`;
              }).join('')}
            </div>
          </div>`;
        }
        html += '</div>';
      }
      html += '</div>';
      this.$view.innerHTML = html;

      this.$view.querySelectorAll('.day-cell').forEach(cell=>{
        cell.addEventListener('dblclick', ()=>{
          const date = cell.getAttribute('data-date');
          this.openEventModal({ date });
        });
      });
        this.$view.querySelectorAll('.event-chip').forEach(ch=>{
        ch.addEventListener('click', ()=>{
          const id = String(ch.getAttribute('data-id'));
          this.openEventModal({ id });
        });
      });
    }

    buildTimeGrid(days){
      const times = [];
      for(let h=START_HOUR; h<=END_HOUR; h++) times.push(h);
      const todayISO = fmtDateISO(new Date());
      const header = `<div class="time-header">
      <div class="head-row">
        <div class="time-col"></div>
        ${days.map(d=>`<div class="day-col-head ${fmtDateISO(d)===todayISO ? 'is-today' : ''}">${d.toLocaleDateString(undefined,{ weekday:'short', month:'short', day:'numeric' })}</div>`).join('')}
      </div>
      <div class="all-day-row">
        <div class="all-day-label">All-day</div>
        ${days.map((_d, di)=>`<div class="all-day-cell" data-day-index="${di}"></div>`).join('')}
      </div>
    </div>`;
      const body = `<div class="time-body">
      <div class="time-col">
        ${times.map(h=>`<div class="time-slot"><span>${String(h).padStart(2,'0')}:00</span></div>`).join('')}
      </div>
      ${days.map((_d, di)=>`<div class="day-col" data-day-index="${di}"></div>`).join('')}
    </div>`;
      return header + body;
    }

    renderWeek(){
      const s = startOfWeek(this.currentDate);
      const days = Array.from({length:7}, (_,i)=> new Date(s.getTime()+i*DAY_MS));
      this.$view.innerHTML = `<div class="week-grid">${this.buildTimeGrid(days)}</div>`;
      this.renderAllDayEvents(days);
      this.renderTimedEvents(days);
      this.setupNowNeedle(days);
      this.$view.querySelectorAll('.all-day-cell').forEach((cell, di)=>{
        cell.addEventListener('dblclick', ()=>{
          const dateISO = fmtDateISO(days[di]);
          this.openEventModal({ date: dateISO, allDay: true });
        });
      });
      this.$view.querySelectorAll('.day-col').forEach((col, di)=>{
        col.addEventListener('dblclick', (e)=>{
          const rect = col.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const hourHeight = col.clientHeight / (END_HOUR-START_HOUR+1);
          const minutesFromStart = Math.round((y/hourHeight)*60/ SLOT_MINUTES) * SLOT_MINUTES;
          const date = days[di];
          const startMin = toMinutes(START_HOUR,0) + minutesFromStart;
          const endMin = startMin + 60;
          const {h:sh,m:sm}=fromMinutes(startMin); const {h:eh,m:em}=fromMinutes(endMin);
          const dateISO = fmtDateISO(date);
          this.openEventModal({ date: dateISO, start: `${dateISO}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`, end: `${dateISO}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`});
        });
      });
    }

    renderDay(){
      const days=[new Date(this.currentDate)];
      this.$view.innerHTML = `<div class="day-grid">${this.buildTimeGrid(days)}</div>`;
      this.renderAllDayEvents(days);
      this.renderTimedEvents(days);
      this.setupNowNeedle(days);
      const allDayCell = this.$view.querySelector('.all-day-cell');
      if (allDayCell) allDayCell.addEventListener('dblclick', ()=>{
        const dateISO = fmtDateISO(days[0]);
        this.openEventModal({ date: dateISO, allDay: true });
      });
      const col = this.$view.querySelector('.day-col');
      if (col) col.addEventListener('dblclick', (e)=>{
        const rect = col.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hourHeight = col.clientHeight / (END_HOUR-START_HOUR+1);
        const minutesFromStart = Math.round((y/hourHeight)*60/ SLOT_MINUTES) * SLOT_MINUTES;
        const date = days[0];
        const startMin = toMinutes(START_HOUR,0) + minutesFromStart;
        const endMin = startMin + 60;
        const {h:sh,m:sm}=fromMinutes(startMin); const {h:eh,m:em}=fromMinutes(endMin);
        const dateISO = fmtDateISO(date);
        this.openEventModal({ date: dateISO, start: `${dateISO}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`, end: `${dateISO}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`});
      });
    }

    renderTimedEvents(days){
    const cols = this.$view.querySelectorAll('.day-col');
    const totalHours = (END_HOUR-START_HOUR+1);

      days.forEach((date, di)=>{
        const dayISO = fmtDateISO(date);
        const events = this.store.list().filter(ev=> {
          const isAllDay = !!ev.allDay || (typeof ev.start === 'string' && !ev.start.includes('T'));
          if (isAllDay) return false;
          return fmtDateISO(new Date(ev.start))===dayISO;
        });
        const items = events.map(ev=>({
          ev,
          startMin: toMinutes(new Date(ev.start).getHours(), new Date(ev.start).getMinutes()),
          endMin: toMinutes(new Date(ev.end).getHours(), new Date(ev.end).getMinutes())
        })).sort((a,b)=> a.startMin - b.startMin || (b.endMin - a.endMin));
        const lanes=[];
        items.forEach(item=>{
          let placed=false;
          for (let li=0; li<lanes.length; li++){
            const lane=lanes[li];
            if (lane[lane.length-1].endMin <= item.startMin){ lane.push(item); placed=true; item.col=li; break; }
          }
          if(!placed){ item.col = lanes.length; lanes.push([item]); }
        });
        const colCount = lanes.length || 1;
        const col = cols[di];
        if (!col) return;
    const hourHeight = col.getBoundingClientRect().height / totalHours;
        items.forEach(item=>{
          const block = document.createElement('div');
          block.className = 'event-block';
          if (item.ev.category) block.setAttribute('data-category', item.ev.category);
          block.setAttribute('data-id', item.ev.id);
          const topMin = item.startMin - toMinutes(START_HOUR,0);
          const durMin = Math.max(30, item.endMin - item.startMin);
          const top = (topMin/60)*hourHeight;
          const height = (durMin/60)*hourHeight;
          const widthPct = (100/colCount) - 2;
          const leftPct = (100/colCount)*item.col;
          block.style.top = `${top}px`;
          block.style.left = `${leftPct}%`;
          block.style.width = `calc(${widthPct}% - 4px)`;
          block.style.height = `${height}px`;
          block.style.background = pastelizeColor(item.ev.color);
          const sD = new Date(item.ev.start), eD = new Date(item.ev.end);
          const s24 = `${String(sD.getHours()).padStart(2,'0')}:${String(sD.getMinutes()).padStart(2,'0')}`;
          const e24 = `${String(eD.getHours()).padStart(2,'0')}:${String(eD.getMinutes()).padStart(2,'0')}`;
          block.innerHTML = `
          <div class="event-content">
            <div class="event-title">${item.ev.title}</div>
            <div class="event-time">${s24}–${e24}</div>
          </div>
          <div class="resize-handle"></div>
        `;
          block.addEventListener('mousedown', (e)=>{
            if ((e.target).classList && (e.target).classList.contains('resize-handle')){
              this.drag = { id: item.ev.id, type:'resize', startY: e.clientY, origStart: new Date(item.ev.start), origEnd: new Date(item.ev.end), hourHeight, moved:false, col };
            } else {
              const rect = block.getBoundingClientRect();
              const grabOffsetPx = e.clientY - rect.top;
              const durMin = Math.max(15, Math.round((new Date(item.ev.end) - new Date(item.ev.start)) / 60000));
              this.drag = {
                id: item.ev.id,
                type:'move',
                startY: e.clientY,
                origStart: new Date(item.ev.start),
                origEnd: new Date(item.ev.end),
                hourHeight,
                moved:false,
                grabOffsetPx,
                col: col,
                durationMin: durMin
              };
            }
            document.body.classList.add('dragging');
          });
          block.addEventListener('click', (ev)=>{
            if (Date.now() < this._suppressClickUntil) { ev.preventDefault(); return; }
            this.openEventModal({ id: String(item.ev.id) });
          });
          col.appendChild(block);
        });
      });
    }

    renderAllDayEvents(days){
      const cells = this.$view.querySelectorAll('.all-day-cell');
      days.forEach((date, di)=>{
        const dayISO = fmtDateISO(date);
        const events = this.store.list().filter(ev=>{
          // All-day if explicitly flagged OR start is date-only string (YYYY-MM-DD)
          const s = ev.start;
          const isDateOnly = (typeof s === 'string' && !s.includes('T') && s.length <= 10);
          const isAllDay = !!ev.allDay || isDateOnly;
          if (!isAllDay) return false;
          if (isDateOnly){
            return s.slice(0,10) === dayISO;
          }
          return fmtDateISO(new Date(s)) === dayISO;
        })
        // Stable alphabetical sort to keep consistent order
        .sort((a,b)=> (a.title||'').localeCompare(b.title||''));
        const cell = cells[di]; if (!cell) return;
        cell.innerHTML = events.map(ev=>`
        <div class="allday-chip" data-id="${ev.id}" style="background:${pastelizeColor(ev.color)}" title="${ev.title}">
          <span class="title">${ev.title}</span>
        </div>
      `).join('');
      });
      this.$view.querySelectorAll('.allday-chip').forEach(ch=>{
        ch.addEventListener('click', ()=>{
          const id = String(ch.getAttribute('data-id'));
          this.openEventModal({ id });
        });
      });
    }

    onMouseMove(e){
      if(!this.drag) return;
      const deltaPx = e.clientY - this.drag.startY;
      const minutesDelta = Math.round((deltaPx / this.drag.hourHeight) * 60 / SLOT_MINUTES) * SLOT_MINUTES;
      const id = this.drag.id;
      const ev = this.store.get(id); if (!ev) return;
      if (!this.drag.moved && (Math.abs(deltaPx) >= 2 || minutesDelta !== 0)) this.drag.moved = true;
      if (this.drag.type==='move'){
        // Compute target start from cursor position inside the day column
        const col = this.drag.col;
        const timeBody = this.$view.querySelector('.time-body');
        const scrollTop = timeBody ? timeBody.scrollTop : 0;
        const colRect = col.getBoundingClientRect();
        const pointerYInCol = (e.clientY - colRect.top) + scrollTop;
        const targetTopPx = pointerYInCol; // align event top to cursor
        const totalHours = (END_HOUR-START_HOUR+1);
    const hourHeight = col.getBoundingClientRect().height / totalHours;
        // Add a tiny epsilon before rounding to avoid bias toward earlier slots
        let topMinutesFromStart = Math.round(((targetTopPx / hourHeight) * 60 / SLOT_MINUTES) + 1e-6) * SLOT_MINUTES;
        if (topMinutesFromStart < 0) topMinutesFromStart = 0;
        if (topMinutesFromStart > totalHours*60 - SLOT_MINUTES) topMinutesFromStart = totalHours*60 - SLOT_MINUTES;
        const newStart = new Date(this.drag.origStart);
        const dayISO = fmtDateISO(newStart);
        const absStartMin = START_HOUR*60 + topMinutesFromStart;
        newStart.setHours(Math.floor(absStartMin/60), absStartMin%60, 0, 0);
        const newEnd = new Date(newStart);
        newEnd.setMinutes(newEnd.getMinutes() + (this.drag.durationMin || 60));
        const maxEnd = new Date(`${dayISO}T${String(END_HOUR).padStart(2,'0')}:59`);
        if (newEnd > maxEnd){ newEnd.setTime(maxEnd.getTime()); }
        this.previewDrag(id, newStart, newEnd, e);
      } else {
        const start = new Date(this.drag.origStart);
        const end = new Date(this.drag.origEnd);
        end.setMinutes(end.getMinutes()+minutesDelta);
        if (end <= start) { end.setTime(start.getTime()+30*60000); }
        const maxEnd = new Date(`${fmtDateISO(end)}T${String(END_HOUR).padStart(2,'0')}:59`);
        if (end>maxEnd) end.setTime(maxEnd.getTime());
        this.previewDrag(id, start, end, e);
      }
    }

    previewDrag(id, start, end, mouseEvent){
      // Save last previewed times for commit on mouseup
      if (this.drag){ this.drag.lastStart = new Date(start); this.drag.lastEnd = new Date(end); }
      // Live update block position and label without full re-render
      const block = this.$view.querySelector(`.event-block[data-id="${id}"]`);
      const col = block?.parentElement;
      if (!block || !col) return;
    const totalHours = (END_HOUR-START_HOUR+1);
    const hourHeight = col.getBoundingClientRect().height / totalHours;
      const startMin = start.getHours()*60 + start.getMinutes();
      const endMin = end.getHours()*60 + end.getMinutes();
      const topMin = startMin - (START_HOUR*60);
      const durMin = Math.max(30, endMin - startMin);
      const top = (topMin/60)*hourHeight;
      const height = (durMin/60)*hourHeight;
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      const s24 = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
      const e24 = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
      const timeEl = block.querySelector('.event-time');
      if (timeEl) timeEl.textContent = `${s24}–${e24}`;
      block.classList.add('is-dragging');

      // Edge auto-scroll when near top/bottom of the time body
      const timeBody = this.$view.querySelector('.time-body');
      if (timeBody && mouseEvent){
        const rect = timeBody.getBoundingClientRect();
        const margin = 40; // px
        const speed = 12; // px per move
        if (mouseEvent.clientY < rect.top + margin){
          timeBody.scrollTop = Math.max(0, timeBody.scrollTop - speed);
        } else if (mouseEvent.clientY > rect.bottom - margin){
          timeBody.scrollTop = Math.min(timeBody.scrollHeight, timeBody.scrollTop + speed);
        }
      }
    }

    onMouseUp(e){
      if (!this.drag) return;
      const { id, moved } = this.drag;
      if (moved){
        // Suppress click shortly after a drag/resize interaction
        this._suppressClickUntil = Date.now() + 300;
        // Compute a final snapped position from the mouseup pointer to ensure we commit exactly what you set
        const finalizeFromPointer = () => {
          const col = this.drag.col;
          if (!col) return;
          const timeBody = this.$view.querySelector('.time-body');
          const scrollTop = timeBody ? timeBody.scrollTop : 0;
          const colRect = col.getBoundingClientRect();
          const pointerYInCol = (e.clientY - colRect.top) + scrollTop;
          const totalHours = (END_HOUR-START_HOUR+1);
          const hourHeight = col.clientHeight / totalHours;
          let minutesFromStart = Math.round(((pointerYInCol / hourHeight) * 60 / SLOT_MINUTES) + 1e-6) * SLOT_MINUTES;
          if (minutesFromStart < 0) minutesFromStart = 0;
          if (minutesFromStart > totalHours*60 - SLOT_MINUTES) minutesFromStart = totalHours*60 - SLOT_MINUTES;
          if (this.drag.type === 'move'){
            const base = new Date(this.drag.origStart);
            const dayISO = fmtDateISO(base);
            const absMin = START_HOUR*60 + minutesFromStart;
            const newStart = new Date(base);
            newStart.setHours(Math.floor(absMin/60), absMin%60, 0, 0);
            const newEnd = new Date(newStart);
            newEnd.setMinutes(newEnd.getMinutes() + (this.drag.durationMin || 60));
            const maxEnd = new Date(`${dayISO}T${String(END_HOUR).padStart(2,'0')}:59`);
            if (newEnd > maxEnd){ newEnd.setTime(maxEnd.getTime()); }
            this.drag.lastStart = newStart; this.drag.lastEnd = newEnd;
          } else if (this.drag.type === 'resize'){
            const start = new Date(this.drag.origStart);
            const dayISO = fmtDateISO(start);
            const absMin = START_HOUR*60 + minutesFromStart;
            const newEnd = new Date(start);
            newEnd.setHours(Math.floor(absMin/60), absMin%60, 0, 0);
            if (newEnd <= start){ newEnd.setTime(start.getTime()+30*60000); }
            const maxEnd = new Date(`${dayISO}T${String(END_HOUR).padStart(2,'0')}:59`);
            if (newEnd > maxEnd){ newEnd.setTime(maxEnd.getTime()); }
            this.drag.lastStart = start; this.drag.lastEnd = newEnd;
          }
        };
        finalizeFromPointer();
        const { lastStart, lastEnd } = this.drag;
        // Commit if we have a final position
        const commit = async () => {
          const timeBody = this.$view.querySelector('.time-body');
          const st = timeBody ? timeBody.scrollTop : 0;
          if (lastStart && lastEnd){
            await this.store.update(id, {
              start: fmtLocalDateTime(lastStart),
              end: fmtLocalDateTime(lastEnd)
            }, { debounce: false });
          }
          // Re-render current view only and restore scroll position
          if (this.view === 'week'){
            this.renderWeek();
          } else if (this.view === 'day'){
            this.renderDay();
          } else {
            this.renderMonth();
          }
          const tb2 = this.$view.querySelector('.time-body');
          if (tb2 && (this.view==='week' || this.view==='day')) tb2.scrollTop = st;
        };
        commit();
      }
      this.drag = null;
      document.body.classList.remove('dragging');
    }

    openEventModal(opts={}){
      const modal = window.modalManager || new window.ModalManager();
    const existing = opts.id ? this.store.get(opts.id) : null;
      const dateISO = opts.date || (existing ? fmtDateISO(new Date(existing.start)) : fmtDateISO(this.currentDate));
      const isAllDay = existing ? !!existing.allDay || (typeof existing.start==='string' && !existing.start.includes('T')) : !!opts.allDay;
      const start = opts.start || (existing? existing.start : `${dateISO}T09:00`);
      const end = opts.end || (existing? existing.end : `${dateISO}T10:00`);
      const title = existing? existing.title : '';
      const color = existing ? pastelizeColor(existing.color) : DEFAULT_EVENT_COLOR;
      const category = existing? existing.category || '' : '';
      const description = existing? existing.description || '' : '';
      const timeStart = typeof start === 'string' && start.includes('T') ? start.split('T')[1].slice(0,5) : '09:00';
      const timeEnd = typeof end === 'string' && end.includes('T') ? end.split('T')[1].slice(0,5) : '10:00';
      const content = `
      <div class="cal-form">
        <label>Title<input id="calTitleInput" type="text" value="${title}"></label>
        <div class="row between">
          <label class="inline"><input id="calAllDayInput" type="checkbox" ${isAllDay?'checked':''}> All day</label>
          <div class="dur-chips">
            <button type="button" class="dur-btn" data-min="15">15m</button>
            <button type="button" class="dur-btn" data-min="30">30m</button>
            <button type="button" class="dur-btn" data-min="60">1h</button>
            <button type="button" class="dur-btn" data-min="120">2h</button>
          </div>
        </div>
        <div class="row">
          <label>Date<input id="calDateInput" type="date" value="${dateISO}"></label>
          <div class="inline-fields" id="timeFields">
            <label>Start<select id="calStartTimeSel"></select></label>
            <label>End<select id="calEndTimeSel"></select></label>
          </div>
        </div>
        <div class="row">
          <label>Category
            <select id="calCatSelect">
              <option value="" ${category===''?'selected':''}>None</option>
              <option value="meeting" ${category==='meeting'?'selected':''}>Meeting</option>
              <option value="personal" ${category==='personal'?'selected':''}>Personal</option>
              <option value="task" ${category==='task'?'selected':''}>Task</option>
            </select>
          </label>
          <div class="color-picker">
            <div class="swatches" id="calColorSwatches"></div>
            <input id="calCustomColorPicker" type="color" style="display:none" value="${color}">
          </div>
        </div>
        <label>Description<textarea id="calDescInput" rows="3">${description}</textarea></label>
      </div>`;
      const actions = [
    existing ? { label:'Delete', action:()=>{ this.deleteEvent(existing.id); }, primary:false } : null,
        { label:'Cancel', action:()=>{}, primary:false },
        { label:'Save', action:async ()=>{
            const t = document.getElementById('calTitleInput').value.trim() || 'Untitled';
            const allDay = document.getElementById('calAllDayInput').checked;
            const date = document.getElementById('calDateInput').value;
            const c = document.getElementById('calCatSelect').value;
            const swWrap = document.getElementById('calColorSwatches');
            const col = (swWrap && (swWrap.getAttribute('data-selected') || (swWrap.querySelector('.swatch.selected')?.getAttribute('data-color')))) || color;
            const desc = document.getElementById('calDescInput').value.trim();
            let s, e;
            if (allDay){
              s = date;
              e = `${date}T00:00`;
            } else {
              const st = document.getElementById('calStartTimeSel').value || '09:00';
              let et = document.getElementById('calEndTimeSel').value || '10:00';
              s = `${date}T${st}`;
              e = `${date}T${et}`;
              if (new Date(e) <= new Date(s)){
                const [hh,mm] = st.split(':').map(Number);
                const mins = hh*60+mm + 15;
                const hh2 = String(Math.floor(mins/60)%24).padStart(2,'0');
                const mm2 = String(mins%60).padStart(2,'0');
                e = `${date}T${hh2}:${mm2}`;
              }
            }
            const payload = { title: t, start: s.replace('T',' '), end: e.replace('T',' '), category: c, color: col, description: desc, allDay };
            if (existing){
              await this.store.update(existing.id, payload, { debounce: false });
            } else {
              await this.store.add(payload);
            }
            this.render();
          }, primary:true }
      ].filter(Boolean);
      modal.showDialog(existing? 'Edit Event' : 'New Event', content, actions);
      setTimeout(()=>{
        const allDayEl = document.getElementById('calAllDayInput');
        const timeFields = document.getElementById('timeFields');
        const durChips = document.querySelector('.dur-chips');
        const applyAllDay = () => {
          const hide = allDayEl && allDayEl.checked;
          if (timeFields) timeFields.style.display = hide ? 'none' : 'grid';
          if (durChips) durChips.style.display = hide ? 'none' : 'flex';
        };
        if (allDayEl){ allDayEl.addEventListener('change', applyAllDay); applyAllDay(); }

        const populateTimeSelect = (selEl, selected) => {
          if (!selEl) return;
          selEl.innerHTML = '';
          for (let mins=0; mins<24*60; mins+=15){
            const hh = String(Math.floor(mins/60)).padStart(2,'0');
            const mm = String(mins%60).padStart(2,'0');
            const val = `${hh}:${mm}`;
            const opt = document.createElement('option');
            opt.value = val; opt.textContent = val; opt.dataset.base = val;
            if (selected === val) opt.selected = true;
            selEl.appendChild(opt);
          }
        };
        const startSel = document.getElementById('calStartTimeSel');
        const endSel = document.getElementById('calEndTimeSel');
        populateTimeSelect(startSel, timeStart);
        populateTimeSelect(endSel, timeEnd);

        const minutesFromHHMM = (s) => { const [h,m] = (s||'00:00').split(':').map(Number); return h*60+m; };
        const fmtDur = (mins) => {
          if (mins < 60) return `${mins} min`;
          const hours = Math.floor(mins/60);
          const remainder = mins % 60;
          const quarter = Math.round(remainder / 15) * 0.25;
          let dec = hours + (quarter >= 1 ? 1 : quarter);
          const decStr = (dec % 1 === 0) ? String(dec) : String(dec.toFixed(2)).replace(/\.00$/, '').replace(/0$/, '');
          return dec === 1 ? '1 hour' : `${decStr} hours`;
        };
        let endOpen = false;
        const applyEndConstraints = () => {
          if (!endSel || !startSel) return;
          const sM = minutesFromHHMM(startSel.value || '09:00');
          let firstValid = null;
          Array.from(endSel.options).forEach(opt => {
            const eM = minutesFromHHMM(opt.value);
            const valid = eM > sM;
            opt.disabled = !valid;
            if (valid && !firstValid) firstValid = opt;
          });
          const curM = minutesFromHHMM(endSel.value || '00:00');
          if (curM <= sM && firstValid){ endSel.value = firstValid.value; }
        };
        const annotateEndOptions = (show) => {
          if (!endSel || !startSel) return;
          const sM = minutesFromHHMM(startSel.value || '09:00');
          Array.from(endSel.options).forEach(opt => {
            const base = opt.dataset.base || opt.value;
            const eM = minutesFromHHMM(opt.value);
            if (!show){ opt.textContent = base; return; }
            if (eM <= sM){ opt.textContent = base; return; }
            const diff = eM - sM;
            opt.textContent = `${base} — ${fmtDur(diff)}`;
          });
        };
        endSel?.addEventListener('mousedown', ()=>{ endOpen = true; applyEndConstraints(); annotateEndOptions(true); });
        endSel?.addEventListener('focus', ()=>{ endOpen = true; applyEndConstraints(); annotateEndOptions(true); });
        endSel?.addEventListener('blur', ()=>{ endOpen = false; annotateEndOptions(false); });
        endSel?.addEventListener('change', ()=>{ endOpen = false; annotateEndOptions(false); });
        startSel?.addEventListener('change', ()=>{ applyEndConstraints(); if (endOpen) annotateEndOptions(true); });
        applyEndConstraints();

        document.querySelectorAll('.dur-btn').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            if (!startSel || !endSel || (allDayEl && allDayEl.checked)) return;
            const min = Number(btn.getAttribute('data-min'))||30;
            const [hh,mm] = (startSel.value||'09:00').split(':').map(Number);
            const mins = hh*60+mm + min;
            const hh2 = String(Math.floor(mins/60)%24).padStart(2,'0');
            const mm2 = String(mins%60).padStart(2,'0');
            endSel.value = `${hh2}:${mm2}`;
            endSel.dispatchEvent(new Event('change'));
          });
        });

        const defaults = ['#e0f2ff','#d1fae5','#fde4cf','#ede9fe','#fef9c3','#fee2e2','#ccfbf1','#f3e8ff','#e5e7eb'];
        const CUSTOM_KEY = 'calendar_custom_colors_v1';
        const loadCustom = () => { try{ return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'); }catch(_){ return []; } };
        const saveCustom = (arr) => { try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr.slice(0,5))); }catch(_){} };
        const wrap = document.getElementById('calColorSwatches');
        const colorInput = document.getElementById('calCustomColorPicker');
        const renderSwatches = () => {
          if (!wrap) return;
          wrap.innerHTML = '';
          const customs = loadCustom();
          const all = [...defaults, ...customs];
          all.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'swatch'; btn.setAttribute('data-color', c); btn.style.background = c;
            if (c === color) btn.classList.add('selected');
            btn.addEventListener('click', ()=>{
              wrap.querySelectorAll('.swatch').forEach(s=> s.classList.toggle('selected', s===btn));
              wrap.setAttribute('data-selected', c);
            });
            wrap.appendChild(btn);
          });
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'swatch add-swatch';
          addBtn.title = 'Add color';
          addBtn.textContent = '+';
          addBtn.addEventListener('click', ()=> colorInput?.click());
          wrap.appendChild(addBtn);
        };
        renderSwatches();
        colorInput?.addEventListener('input', ()=>{
          const c = colorInput.value;
          const customs = loadCustom();
          if (!customs.includes(c)){
            if (customs.length >= 5) customs.shift();
            customs.push(c); saveCustom(customs);
          }
          renderSwatches();
          const last = wrap?.querySelector(`.swatch[data-color="${c}"]`);
          if (last) last.click();
        });

        const swWrap = document.getElementById('calColorSwatches');
        if (swWrap){
          swWrap.querySelectorAll('.swatch').forEach(sw=>{
            sw.addEventListener('click', ()=>{
              const c = sw.getAttribute('data-color');
              const input = document.getElementById('calColorInput');
              if (input) input.value = c;
              swWrap.querySelectorAll('.swatch').forEach(s=> s.classList.toggle('selected', s===sw));
            });
          });
        }
      }, 0);
    }

    deleteEvent(id){
      Promise.resolve(this.store.delete(id)).then(()=> this.render());
    }

    clearNowTimer(){
      if (this.nowTimer){ clearInterval(this.nowTimer); this.nowTimer = null; }
      if (this._nowNeedles){ try { this._nowNeedles.forEach(({ needle })=> needle && needle.remove()); } catch(_){} this._nowNeedles = null; }
    }

    setupNowNeedle(days){
      this.clearNowTimer();
      const cols = this.$view.querySelectorAll('.day-col');
      const todayISO = fmtDateISO(new Date());
      const needles = [];
      days.forEach((d, i)=>{
        if (fmtDateISO(d) === todayISO){
          const col = cols[i];
          if (!col) return;
          let needle = col.querySelector('.now-needle');
          if (!needle){ needle = document.createElement('div'); needle.className = 'now-needle'; col.appendChild(needle); }
          needles.push({ col, needle, day: d });
        }
      });
      this._nowNeedles = needles;
      const update = () => {
        const now = new Date();
        needles.forEach(({ col, needle })=>{
          const totalHours = (END_HOUR - START_HOUR + 1);
          const hourHeight = col.clientHeight / totalHours;
          const minsSinceStart = now.getHours()*60 + now.getMinutes() - (START_HOUR*60);
          if (minsSinceStart < 0 || minsSinceStart > totalHours*60){ needle.style.display = 'none'; return; }
          needle.style.display = 'block';
          const top = (minsSinceStart/60) * hourHeight;
          needle.style.top = `${top}px`;
        });
      };
      update();
      this.nowTimer = setInterval(update, 60000);
    }
  }

  // Expose for legacy consumers
  window.CalendarUtils = window.CalendarUtils || Utils;
  window.CalendarStoreModule = window.CalendarStoreModule || { CalendarStore };
  window.CalendarApp = window.CalendarApp || CalendarApp;

  // Auto-init when present
  document.addEventListener('DOMContentLoaded', ()=>{
    const root = document.getElementById('calendarRoot');
    if (root) {
      window.calendarApp = new CalendarApp('calendarRoot');
    }
  });

})();
//# sourceMappingURL=calendar.js.map
