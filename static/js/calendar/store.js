import { fmtDateISO } from './utils.js';

export class CalendarStore {
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

export class CalendarApiStore {
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
