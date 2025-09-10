// EditorJS-based Tasks Overview and Inline Editing
// - Replaces visual rendering of #taskList with an EditorJS checklist-based overview
// - Right panel exposes metadata editing for the selected task

(function() {
  const api = {
    async getTasks() {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tasks');
      return data.tasks || [];
    },
    async updateTask(id, updates) {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update task');
      return data.task;
    },
    async createTask(payload) {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      return data.task;
    }
  };

  let editor = null;
  let tasks = [];
  // Simple in-memory index by title to id to support quick mapping
  const titleToId = new Map();
  let selectedTaskId = null;

  function setStatusPill(status) {
    const pill = document.getElementById('taskMetaStatusPill');
    if (!pill) return;
    pill.textContent = status === 'completed' ? 'Completed' : (status === 'in_progress' ? 'In progress' : 'Pending');
  }

  function fillMetaPanel(task) {
    if (!task) return;
    selectedTaskId = task.id;
    setStatusPill(task.status || 'pending');
    const t = (id) => document.getElementById(id);
    t('taskMetaTitle').value = task.title || '';
    if (task.due_date) t('taskMetaDate').value = task.due_date;
    else t('taskMetaDate').value = '';
    if (task.due_time) t('taskMetaTime').value = task.due_time?.slice(0,5) || '';
    else t('taskMetaTime').value = '';
    t('taskMetaPriority').value = task.priority || '';
    const tagNames = (task.tags || []).map(x => typeof x === 'object' ? x.name : x);
    t('taskMetaTags').value = tagNames.join(', ');
    t('taskMetaRepeat').value = task.repeat_pattern || '';
  }

  function taskToChecklistBlock(task) {
    // Show title in bold; add tiny pills for due time if present
    let titleHtml = `<b>${escapeHtml(task.title || '')}</b>`;
    const pills = [];
    if (task.due_date) pills.push(`📅 ${task.due_date}`);
    if (task.due_time) pills.push(`⏰ ${task.due_time.substring(0,5)}`);
    if (task.priority) pills.push(priorityPill(task.priority));
    if (pills.length) titleHtml += ` <span style="color:#888;">${pills.join(' · ')}</span>`;
    return {
      type: 'checklist',
      data: {
        items: [{ text: titleHtml, checked: task.status === 'completed' }]
      }
    };
  }

  function priorityPill(p) {
    const map = { urgente: '🔥', alta: '🔴', media: '🟡', baja: '🟢' };
    return `${map[p] || ''} ${p}`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }

  async function loadAndRender() {
    tasks = await api.getTasks();
    titleToId.clear();
    tasks.forEach(t => titleToId.set((t.title || '').trim().toLowerCase(), t.id));

    const blocks = tasks.map(taskToChecklistBlock);

    if (!editor) {
      const HeaderTool = window.Header;
      const ChecklistTool = window.Checklist;
      const ListTool = window.List;
      const MarkerTool = window.Marker;
      const ToggleBlockTool = window.ToggleBlock;

      const tools = {};
      if (HeaderTool) tools.header = { class: HeaderTool, inlineToolbar: ['link'] };
      if (ChecklistTool) tools.checklist = { class: ChecklistTool, inlineToolbar: ['bold', 'marker', 'link'] };
      if (ListTool) tools.list = { class: ListTool, inlineToolbar: true };
      if (MarkerTool) tools.marker = { class: MarkerTool };
      if (ToggleBlockTool) tools.toggle = { class: ToggleBlockTool };

      editor = new EditorJS({
        holder: 'taskEditor',
        autofocus: false,
        tools,
        data: { blocks }
      });
    } else {
      await editor.isReady;
      // Replace content
      const apiBlocks = editor.blocks;
      apiBlocks.clear();
      blocks.forEach(b => apiBlocks.insert(b.type, b.data));
    }
  }

  // Delegate checkbox toggles to API updates
  function bindEditorDomEvents() {
    const holder = document.getElementById('taskEditor');
    if (!holder) return;

    holder.addEventListener('change', async (e) => {
      const el = e.target;
      if (el && el.matches('input[type="checkbox"]')) {
        // Find the nearest checklist item text content
        const item = el.closest('.cdx-checklist__item');
        const textEl = item && item.querySelector('.cdx-checklist__item-text');
        const plain = textEl ? textEl.textContent.trim() : '';
        if (!plain) return;

        // Map by normalized title
        const id = titleToId.get(plain.toLowerCase());
        if (!id) return;

        try {
          const newStatus = el.checked ? 'completed' : 'pending';
          const updated = await api.updateTask(id, { status: newStatus });
          setStatusPill(updated.status);
        } catch (err) {
          console.error('Failed to update task status', err);
        }
      }
    });

    holder.addEventListener('click', (e) => {
      const item = e.target.closest('.cdx-checklist__item');
      if (!item) return;
      const textEl = item.querySelector('.cdx-checklist__item-text');
      const plain = textEl ? textEl.textContent.trim() : '';
      const id = titleToId.get(plain.toLowerCase());
      if (!id) return;
      const task = tasks.find(t => t.id === id);
      if (task) fillMetaPanel(task);
    });
  }

  function bindMetaPanelActions() {
    const saveBtn = document.getElementById('taskMetaSave');
    const completeBtn = document.getElementById('taskMetaComplete');
    const syncBtn = document.getElementById('taskEditorSync');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        // Create new tasks from any lines that don't match existing titles
        if (!editor) return;
        try {
          const saved = await editor.save();
          const seen = new Set([...titleToId.keys()]);
          const pendingCreates = [];
          saved.blocks.forEach(b => {
            if (b.type !== 'checklist') return;
            (b.data.items || []).forEach(item => {
              const title = (item.text || '').replace(/<[^>]*>/g, '').trim();
              if (!title) return;
              const key = title.toLowerCase();
              if (!titleToId.has(key)) {
                pendingCreates.push({ title, status: item.checked ? 'completed' : 'pending' });
              } else {
                seen.delete(key);
              }
            });
          });
          for (const payload of pendingCreates) {
            const created = await api.createTask(payload);
          }
          await loadAndRender();
        } catch (e) {
          console.error('Sync failed', e);
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (!selectedTaskId) return;
        const t = (id) => document.getElementById(id);
        const updates = {
          title: t('taskMetaTitle').value.trim(),
          priority: t('taskMetaPriority').value || null,
          repeat_pattern: t('taskMetaRepeat').value || null,
        };
        const d = t('taskMetaDate').value;
        const tm = t('taskMetaTime').value;
        if (d) updates.due_date = d;
        if (tm) updates.due_time = tm + ':00';
        const tags = t('taskMetaTags').value.split(',').map(x => x.trim()).filter(Boolean);
        if (tags.length) updates.tags = tags;
        try {
          await api.updateTask(selectedTaskId, updates);
          await loadAndRender();
          const task = tasks.find(x => x.id === selectedTaskId);
          if (task) fillMetaPanel(task);
        } catch (e) {
          console.error('Failed saving task meta', e);
        }
      });
    }

    if (completeBtn) {
      completeBtn.addEventListener('click', async () => {
        if (!selectedTaskId) return;
        try {
          const task = tasks.find(t => t.id === selectedTaskId);
          const newStatus = task && task.status !== 'completed' ? 'completed' : 'pending';
          await api.updateTask(selectedTaskId, { status: newStatus });
          await loadAndRender();
          const updated = tasks.find(t => t.id === selectedTaskId);
          if (updated) fillMetaPanel(updated);
        } catch (e) {
          console.error('Failed toggling complete', e);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('tasksSection')) return;
    if (!document.getElementById('taskEditor')) return;
    try {
      bindEditorDomEvents();
      bindMetaPanelActions();
      await loadAndRender();
    } catch (e) {
      console.error('Task editor init error', e);
    }
  });
})();
