// Minimal Time Tracking UI
(function() {
  function el(id){ return document.getElementById(id); }

  async function apiListActivities(){
    const res = await fetch('/api/time/activities');
    if (!res.ok) throw new Error('activities_failed');
    return res.json();
  }
  async function apiUpsertActivity(name){
    const res = await fetch('/api/time/activities', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error('activity_upsert_failed');
    return res.json();
  }
  async function apiListEntries(day){
    const qs = day? `?day=${encodeURIComponent(day)}`: '';
    const res = await fetch(`/api/time/entries${qs}`);
    if (!res.ok) throw new Error('entries_failed');
    return res.json();
  }
  async function apiStartEntry(activityId, startTime, noteId, description){
    const res = await fetch('/api/time/entries', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ activityId, startTime, noteId, description }) });
    if (!res.ok) throw new Error('start_failed');
    return res.json();
  }
  async function apiStopEntry(entryId){
    const res = await fetch(`/api/time/entries/${entryId}/stop`, { method:'POST' });
    if (!res.ok) throw new Error('stop_failed');
    return res.json();
  }

  async function loadTemplates(){
    try {
      const res = await fetch('/api/dev/load_template?name=template3');
      const j = await res.json();
      if (j && j.status === 'ok') { await refresh(); notify('Sample data loaded'); }
      else notify('Failed to load templates','error');
    } catch(e){ notify('Failed to load templates','error'); }
  }

  function notify(msg, type){
    if (window.toast) { window.toast(msg, type); return; }
    console.log(`[time] ${msg}`);
  }

  async function fillActivities(){
    const sel = el('timeActivity'); if (!sel) return;
    sel.innerHTML = '<option value="">Select activity</option>';
    try {
      const data = await apiListActivities();
      const acts = data.activities || [];
      for (const a of acts){
        const opt = document.createElement('option');
        opt.value = a.id; opt.textContent = a.name;
        sel.appendChild(opt);
      }
    } catch(e){ /* ignore */ }
  }

  function bindControls(){
    const dayInput = el('timeDay');
    if (dayInput) {
      const today = new Date().toISOString().slice(0,10);
      dayInput.value = today;
      dayInput.addEventListener('change', refresh);
    }
    const startBtn = el('timeStart'); if (startBtn) startBtn.addEventListener('click', startEntry);
    const tmplBtn = el('timeLoadTemplates'); if (tmplBtn) tmplBtn.addEventListener('click', loadTemplates);
    const newAct = el('timeNewActivity');
    if (newAct) newAct.addEventListener('keydown', async (e)=>{
      if (e.key === 'Enter' && newAct.value.trim()){
        const a = await apiUpsertActivity(newAct.value.trim());
        await fillActivities();
        if (a && a.id) el('timeActivity').value = a.id;
        newAct.value='';
      }
    });
  }

  async function refresh(){
    await fillActivities();
    const day = el('timeDay')?.value || '';
    const list = el('timeEntries'); if (!list) return;
    list.innerHTML = '<div class="loading">Loading entries...</div>';
    try {
      const data = await apiListEntries(day);
      const entries = data.entries || [];
      if (!entries.length){ list.innerHTML = '<div class="empty">No entries</div>'; return; }
      const rows = entries.map(e=>{
        const running = !e.end_time;
        return `<tr data-id="${e.id}"><td>${escapeHtml(e.description||'')}</td><td>${e.start_time||''}</td><td>${e.end_time||''}</td><td>${running?'<button class="btn btn-secondary stop-entry">Stop</button>':''}</td></tr>`;
      }).join('');
      list.innerHTML = `<table class="table" style="width:100%"><thead><tr><th>Description</th><th>Start</th><th>End</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
      list.querySelectorAll('button.stop-entry').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
          const tr = e.target.closest('tr');
          await apiStopEntry(tr.dataset.id);
          await refresh();
        });
      });
    } catch(e){ list.innerHTML = '<div class="error">Failed to load entries</div>'; }
  }

  async function startEntry(){
    const actId = el('timeActivity')?.value;
    const desc = el('timeDesc')?.value || '';
    if (!actId){ notify('Select or add activity','error'); return; }
    await apiStartEntry(actId, null, null, desc);
    el('timeDesc').value = '';
    await refresh();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"]+/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    window.timeView = { onShown: () => { refresh(); } };
    bindControls();
  });
})();

