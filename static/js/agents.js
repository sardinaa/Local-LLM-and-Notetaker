(function(){
  // Minimal Agents UI Manager
  const api = {
    async list() {
      const r = await fetch('/api/agents');
      if (!r.ok) throw new Error('Failed to load agents');
      const j = await r.json();
      return j.agents || [];
    },
    async create(agent) {
      const r = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(agent) });
      if (!r.ok) throw new Error('Failed to create agent');
      return r.json();
    },
    async update(name, patch) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error('Failed to update agent');
      return r.json();
    },
    async remove(name) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to delete agent');
      return r.json();
    },
    async run(agent_name, query, model) {
      const r = await fetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_name, query, model }) });
      const j = await r.json();
      return j;
    },
    async knowledgeList(name) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/knowledge`);
      const j = await r.json();
      return j.documents || [];
    },
    async knowledgeUpload(name, files) {
      const fd = new FormData();
      const list = (files && typeof files.length === 'number') ? Array.from(files) : (files ? [files] : []);
      if (list.length <= 1) {
        fd.append('file', list[0]);
      } else {
        for (const f of list) fd.append('files', f);
      }
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/knowledge/upload`, { method: 'POST', body: fd });
      return r.json();
    },
    async knowledgeDelete(name, filename) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/knowledge`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename })});
      return r.json();
    },
    async listLinks(name) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/links`);
      const j = await r.json();
      return j.links || [];
    },
    async addLink(name, url, ingest=true) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, ingest })});
      return r.json();
    },
    async removeLink(name, url) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/links`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })});
      return r.json();
    },
    async listDatabases(name) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/databases`);
      const j = await r.json();
      return j.databases || [];
    },
    async addDatabase(name, db) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/databases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db)});
      return r.json();
    },
    async deleteDatabase(name, dbName) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/databases/${encodeURIComponent(dbName)}`, { method: 'DELETE' });
      return r.json();
    },
    async ingestDatabase(name, dbName) {
      const r = await fetch(`/api/agents/${encodeURIComponent(name)}/databases/${encodeURIComponent(dbName)}/ingest`, { method: 'POST' });
      return r.json();
    },
    knowledgeUploadProgress(name, file, onProgress) {
      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/api/agents/${encodeURIComponent(name)}/knowledge/upload`);
          xhr.onload = () => {
            try {
              const res = JSON.parse(xhr.responseText || '{}');
              if (xhr.status >= 200 && xhr.status < 300) resolve(res);
              else reject(res);
            } catch (e) { reject(e); }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          if (xhr.upload && typeof onProgress === 'function') {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
          }
          const fd = new FormData();
          fd.append('file', file);
          xhr.send(fd);
        } catch (err) { reject(err); }
      });
    }
  };

  function el(tag, attrs={}, ...children) {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function renderAgentList(container, agents) {
    container.innerHTML = '';
    const header = el('div', { class: 'agents-header' },
      el('h3', {}, 'Agents'),
      el('button', { class: 'btn small primary', id: 'agentNewBtn', html: '<i class="fas fa-plus"></i> New Agent' })
    );
    container.appendChild(header);

    const list = el('div', { class: 'agents-list' });
    agents.forEach(a => {
      const row = el('div', { class: 'agent-row' });
      
      // Agent header with name and status indicators
      const agentHeader = el('div', { class: 'agent-header-info' });
      const nameEl = el('div', { class: 'agent-name' });
      if (a.icon) {
        nameEl.classList.add('has-icon');
        nameEl.appendChild(el('span', { class: 'agent-icon' }, a.icon));
      }
      nameEl.appendChild(document.createTextNode(a.name || '(unnamed)'));
      agentHeader.appendChild(nameEl);
      
      // Status indicators
      const statusRow = el('div', { class: 'agent-status' });
      if (a.tag_filters && a.tag_filters.tags && a.tag_filters.tags.length > 0) {
        statusRow.appendChild(el('span', { class: 'status-badge tags' }, `${a.tag_filters.tags.length} tags`));
      }
      statusRow.appendChild(el('span', { class: 'status-badge strategy' }, a.search_strategy || 'hybrid'));
      statusRow.appendChild(el('span', { class: 'status-badge model' }, `k=${a.top_k || 6}`));
      agentHeader.appendChild(statusRow);
      
      row.appendChild(agentHeader);
      row.appendChild(el('div', { class: 'agent-desc' }, a.description || 'No description provided'));
      
      const actions = el('div', { class: 'agent-actions' });
      const runBtn = el('button', { class: 'btn' });
      runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
      runBtn.onclick = () => openRunModal(a);
      const editBtn = el('button', { class: 'btn' });
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
      editBtn.onclick = () => openEditModal(a);
      const delBtn = el('button', { class: 'btn danger' });
      delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
      delBtn.onclick = async () => {
        if (!confirm(`Delete agent "${a.name}"?`)) return;
        await api.remove(a.name);
        load();
      };
      actions.append(runBtn, editBtn, delBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });
    container.appendChild(list);

    document.getElementById('agentNewBtn').onclick = () => openEditModal(null);
  }

  function openEditModal(agent) {
    const data = agent || {
      name: '', description: '', role_prompt: '', icon: '🤖', tag_filters: { mode: 'AND', tags: [] },
      search_strategy: 'hybrid', top_k: 6, chunk_size: 800, recency_boost_days: '', required_citations: true,
      answer_style: 'balanced', tooling: { rag_notes: true, compose_actions: false, web_search: false },
      agent_type: (agent && agent.agent_type) || 'qa',
      knowledge: { use_notes: true, use_agent_docs: true, links: [] },
      safety_policies: '', output_format: 'markdown', temperature: 0.2, max_tokens: 1200, visibility: 'private'
    };

    const modal = el('div', { class: 'agents-modal' });
    modal.innerHTML = `
      <div class="agents-modal-content">
        <div class="agents-modal-header">
          <h3>${agent ? 'Edit Agent' : 'New Agent'}</h3>
          <button class="agents-modal-close">×</button>
        </div>
        <div class="agents-form">
          <label>Name <input id="aName" value="${data.name || ''}" placeholder="Enter agent name..." ${agent ? 'disabled' : ''}></label>
          <label>Description <input id="aDesc" value="${data.description || ''}" placeholder="What does this agent do?"></label>
          <input id="aIcon" type="hidden" value="${data.icon || ''}">
          <label>Role Prompt <textarea id="aRole" placeholder="Define the agent's role and behavior...">${data.role_prompt || ''}</textarea></label>
          <label>Tag Filters 
            <div class="tag-filter-section">
              <div class="tag-pills-container" id="aTagPills"></div>
              <div class="tag-input-wrapper">
                <input id="aTagInput" placeholder="Search existing tags..." autocomplete="off">
                <div class="tag-suggestions" id="aTagSuggestions"></div>
              </div>
            </div>
          </label>
          <label>Mode <select id="aMode"><option ${(!data.tag_filters||data.tag_filters.mode==='AND')?'selected':''}>AND</option><option ${(data.tag_filters&&data.tag_filters.mode==='OR')?'selected':''}>OR</option></select></label>
          <label>Strategy <select id="aStrat"><option ${data.search_strategy==='keyword'?'selected':''}>keyword</option><option ${data.search_strategy==='semantic'?'selected':''}>semantic</option><option ${data.search_strategy==='hybrid'?'selected':''}>hybrid</option></select></label>
          <label>Agent Type <select id="aType"><option ${data.agent_type==='qa'?'selected':''} value="qa">Q&A</option><option ${data.agent_type==='curate'?'selected':''} value="curate">Curate</option><option ${data.agent_type==='task'?'selected':''} value="task">Task</option></select></label>
          <div class="row">
            <label>Top K <input id="aTopK" type="number" min="1" max="20" value="${data.top_k || 6}"></label>
            <label>Chunk Size <input id="aChunk" type="number" min="200" max="4000" value="${data.chunk_size || 800}"></label>
            <label>Temperature <input id="aTemp" type="number" step="0.1" min="0" max="1" value="${data.temperature || 0.2}"></label>
            <label>Max Tokens <input id="aMaxTok" type="number" min="128" max="4096" value="${data.max_tokens || 1200}"></label>
          </div>
          <label>Answer Style <select id="aStyle"><option ${data.answer_style==='concise'?'selected':''}>concise</option><option ${data.answer_style==='balanced'?'selected':''}>balanced</option><option ${data.answer_style==='detailed'?'selected':''}>detailed</option></select></label>
          <label>Output Format <select id="aFmt"><option ${data.output_format==='markdown'?'selected':''}>markdown</option><option ${data.output_format==='plain'?'selected':''}>plain</option><option ${data.output_format==='json'?'selected':''}>json</option></select></label>
          <label style="display: flex; align-items: center; gap: 8px; flex-direction: row;"><input id="aCite" type="checkbox" ${data.required_citations?'checked':''}> Require Citations</label>
          <div class="knowledge-toggles">
            <label style="display:flex;align-items:center;gap:8px;"><input id="aUseNotes" type="checkbox" ${(!data.knowledge||data.knowledge.use_notes)?'checked':''}> Use Notes</label>
            <label style="display:flex;align-items:center;gap:8px;"><input id="aUseDocs" type="checkbox" ${(!data.knowledge||data.knowledge.use_agent_docs)?'checked':''}> Use Agent Documents</label>
          </div>
        </div>
        <div class="agents-modal-actions">
          <button class="btn primary" id="aSave"><i class="fas fa-save"></i> Save</button>
        </div>
        </div>`;

    document.body.appendChild(modal);
    modal.querySelector('.agents-modal-close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Initialize tag filter functionality
    initializeTagFilter(data.tag_filters?.tags || [], 'aTagPills', 'aTagInput', 'aTagSuggestions');  modal.querySelector('#aSave').onclick = async () => {
      const payload = {
        name: data.name || document.getElementById('aName').value.trim(),
        description: document.getElementById('aDesc').value.trim(),
        icon: document.getElementById('aIcon').value.trim(),
        role_prompt: document.getElementById('aRole').value,
        tag_filters: {
          mode: document.getElementById('aMode').value,
          tags: getSelectedTags('aTagPills')
        },
        search_strategy: document.getElementById('aStrat').value,
        agent_type: document.getElementById('aType').value,
        top_k: parseInt(document.getElementById('aTopK').value || '6', 10),
        chunk_size: parseInt(document.getElementById('aChunk').value || '800', 10),
        required_citations: document.getElementById('aCite').checked,
        answer_style: document.getElementById('aStyle').value,
        output_format: document.getElementById('aFmt').value,
        temperature: parseFloat(document.getElementById('aTemp').value || '0.2'),
        max_tokens: parseInt(document.getElementById('aMaxTok').value || '1200', 10),
        knowledge: {
          use_notes: document.getElementById('aUseNotes').checked,
          use_agent_docs: document.getElementById('aUseDocs').checked,
          links: (data.knowledge && data.knowledge.links) || []
        }
      };
      try {
        if (agent) {
          await api.update(agent.name, payload);
        } else {
          await api.create(payload);
        }
        modal.remove();
        // Refresh tree and optionally show details
        document.dispatchEvent(new CustomEvent('agents:refresh-tree'));
        if (!agent) {
          // Show the created agent immediately
          try {
            const all = await api.list();
            const created = all.find(x => x.name === payload.name);
            if (created) {
              if (window.tabManager) {
                document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabType: 'agents' } }));
              }
              renderAgentDetails(created);
            }
          } catch {}
        }
      } catch (e) {
        alert('Failed to save agent');
      }
    };

    // Attach icon picker to modal icon input
    try {
      const iconInput = modal.querySelector('#aIcon');
      if (iconInput) attachIconPicker(iconInput);
    } catch {}
  }

  function openRunModal(agent) {
    const modal = el('div', { class: 'agents-modal' });
    modal.innerHTML = `
      <div class="agents-modal-content">
        <div class="agents-modal-header">
          <h3>Run Agent: ${agent.name}</h3>
          <button class="agents-modal-close">×</button>
        </div>
        <div class="agents-form">
          <div class="hint"><i class="fas fa-info-circle"></i> Agent Config: ${(agent.tag_filters && agent.tag_filters.tags || []).join(', ') || '(no tags)'} | Strategy: ${agent.search_strategy} | Mode: ${agent.tag_filters?.mode || 'AND'}</div>
          <label><i class="fas fa-question-circle"></i> Question<input id="runQuery" placeholder="Ask a question about your notes..."/></label>
          <label><i class="fas fa-robot"></i> Model (optional)<input id="runModel" placeholder="e.g. llama3.2:1b (leave empty for default)"/></label>
        </div>
        <div class="agents-modal-actions">
          <button class="btn primary" id="runBtn"><i class="fas fa-rocket"></i> Run</button>
        </div>
        <div class="agents-output" id="agentOutput"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.agents-modal-close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const output = modal.querySelector('#agentOutput');
    modal.querySelector('#runBtn').onclick = async () => {
      const q = document.getElementById('runQuery').value.trim();
      const model = document.getElementById('runModel').value.trim() || undefined;
      if (!q) return;
      
      const runBtn = document.getElementById('runBtn');
      const originalText = runBtn.innerHTML;
      runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
      runBtn.disabled = true;
      
      output.innerHTML = '<div class="loading-message"><i class="fas fa-cog fa-spin"></i> Processing your question...</div>';
      
      try {
        const res = await api.run(agent.name, q, model);
        
        if (res.status === 'needs_tags') {
          output.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i> This agent has no tags. Please edit the agent and add tags.</div>';
        } else if (res.status === 'no_results') {
          output.innerHTML = '<div class="warning-message"><i class="fas fa-search"></i> No matching notes found. Try different tags or rephrase your query.</div>';
        } else if (res.status === 'success') {
          const ans = el('div', { class: 'agents-answer' });
          ans.textContent = res.answer || '';
          const sources = el('div', { class: 'agents-sources' });
          sources.appendChild(el('div', { class: 'sources-title' }, 'Sources'));
          (res.sources||[]).forEach(s => {
            sources.appendChild(el('div', { class: 'source-item' }, `${s.title} (${s.note_id}) — ${s.snippet}`));
          });
          output.innerHTML = '';
          output.appendChild(ans);
          output.appendChild(sources);
        } else {
          output.innerHTML = `<div class="error-message"><i class="fas fa-times-circle"></i> ${res.message || 'An error occurred'}</div>`;
        }
      } catch (error) {
        output.innerHTML = '<div class="error-message"><i class="fas fa-times-circle"></i> Failed to run agent. Please try again.</div>';
      } finally {
        runBtn.innerHTML = originalText;
        runBtn.disabled = false;
      }
    };
  }

  async function openRunModalByName(name) {
    try {
      const agents = await api.list();
      const a = agents.find(x => x.name === name);
      if (a) openRunModal(a);
    } catch (e) {
      console.warn('Unable to open agent by name:', name);
    }
  }

  // Render selected agent details into the agents section (inline edit form)
  function renderAgentDetails(agent) {
    const section = document.getElementById('agentsSection');
    if (!section) return;
    section.innerHTML = '';

    const container = el('div', { class: 'agents-wrap' });
    const header = el('div', { class: 'agents-header' },
      (() => {
        const h = el('h3', { class: agent.icon ? 'has-icon' : '' });
        if (agent.icon) h.appendChild(el('span', { class: 'agent-icon' }, agent.icon));
        h.appendChild(document.createTextNode(agent.name || '(New Agent)'));
        const editIconBtn = el('button', { class: 'edit-icon-btn', title: 'Edit icon' });
        editIconBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        editIconBtn.onclick = (e) => {
          e.preventDefault();
          const iconInput = container.querySelector('.agents-form #aIcon');
          if (!iconInput) return;
          if (!iconInput._iconPicker) {
            attachIconPicker(iconInput, { anchorEl: editIconBtn, onSelect: (emo) => {
              let ico = h.querySelector('.agent-icon');
              if (!ico) {
                ico = document.createElement('span');
                ico.className = 'agent-icon';
                h.classList.add('has-icon');
                h.insertBefore(ico, h.firstChild);
              }
              ico.textContent = emo;
              // Live update Agents tree node icon
              try {
                const tv = window.agentsTreeView;
                if (tv && tv.nodes && typeof tv.findNodeById === 'function') {
                  const node = tv.findNodeById(tv.nodes, `agent:${agent.name}`);
                  if (node) { node.customIcon = emo; tv.render(); }
                }
              } catch {}
              // Notify other UIs (e.g., chat agent picker)
              try {
                document.dispatchEvent(new CustomEvent('agent:icon-updated', { detail: { name: agent.name, icon: emo } }));
              } catch {}
            }});
          }
          iconInput._iconPicker.show();
        };
        h.appendChild(editIconBtn);
        return h;
      })(),
      el('div', { class: 'agent-actions' },
        agent.name ? el('button', { class: 'btn danger', id: 'agentDeleteBtn', html: '<i class="fas fa-trash"></i> Delete' }) : null
      )
    );
    container.appendChild(header);

    // Inline edit form (same fields as modal)
    const form = el('div', { class: 'agents-form' });
    form.innerHTML = `
      <label>Name <input id="aName" value="${agent.name || ''}" placeholder="Enter agent name..." ${agent.name ? 'disabled' : ''}></label>
      <label>Description <input id="aDesc" value="${agent.description || ''}" placeholder="What does this agent do?"></label>
      <input id="aIcon" type="hidden" value="${agent.icon || ''}">
      <label>Role Prompt <textarea id="aRole" placeholder="Define the agent's role and behavior...">${agent.role_prompt || ''}</textarea></label>
      <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="devModeToggle"> Dev Mode</label>
      <div id="advSettings" style="display:none;">
        <label>Mode <select id="aMode"><option ${( !agent.tag_filters || agent.tag_filters.mode==='AND') ? 'selected' : ''}>AND</option><option ${(agent.tag_filters && agent.tag_filters.mode==='OR') ? 'selected' : ''}>OR</option></select></label>
        <label>Strategy <select id="aStrat"><option ${agent.search_strategy==='keyword'?'selected':''}>keyword</option><option ${agent.search_strategy==='semantic'?'selected':''}>semantic</option><option ${(agent.search_strategy==null||agent.search_strategy==='hybrid')?'selected':''}>hybrid</option></select></label>
        <div class="row">
          <label>Top K <input id="aTopK" type="number" min="1" max="20" value="${agent.top_k ?? 6}"></label>
          <label>Chunk Size <input id="aChunk" type="number" min="200" max="4000" value="${agent.chunk_size ?? 800}"></label>
          <label>Temperature <input id="aTemp" type="number" step="0.1" min="0" max="1" value="${agent.temperature ?? 0.2}"></label>
          <label>Max Tokens <input id="aMaxTok" type="number" min="128" max="4096" value="${agent.max_tokens ?? 1200}"></label>
        </div>
        <label>Answer Style <select id="aStyle"><option ${agent.answer_style==='concise'?'selected':''}>concise</option><option ${(agent.answer_style==null||agent.answer_style==='balanced')?'selected':''}>balanced</option><option ${agent.answer_style==='detailed'?'selected':''}>detailed</option></select></label>
        <label>Output Format <select id="aFmt"><option ${(agent.output_format==null||agent.output_format==='markdown')?'selected':''}>markdown</option><option ${agent.output_format==='plain'?'selected':''}>plain</option><option ${agent.output_format==='json'?'selected':''}>json</option></select></label>
        <label style="display: flex; align-items: center; gap: 8px; flex-direction: row;"><input id="aCite" type="checkbox" ${agent.required_citations ? 'checked' : ''}> Require Citations</label>
      </div>
    `;
    container.appendChild(form);

    // Inject Agent Type selector
    const typeSel = document.createElement('select');
    typeSel.id = 'aType';
    ['qa','curate','task'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = (v==='qa'?'Q&A':v.charAt(0).toUpperCase()+v.slice(1));
      if ((agent.agent_type||'qa') === v) opt.selected = true;
      typeSel.appendChild(opt);
    });
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Agent Type ';
    typeLabel.appendChild(typeSel);
    form.appendChild(typeLabel);

    // Knowledge toggles will appear inside knowledge section per spec

    const actions = el('div', { class: 'agents-modal-actions' });
    const saveBtn = el('button', { class: 'btn primary', html: '<i class="fas fa-save"></i> Save' });
    actions.appendChild(saveBtn);
    container.appendChild(actions);

    section.appendChild(container);

    // Dev Mode toggler for advanced settings
    const devToggle = form.querySelector('#devModeToggle');
    const advBox = form.querySelector('#advSettings');
    devToggle.addEventListener('change', () => { advBox.style.display = devToggle.checked ? '' : 'none'; });


    // Save
    saveBtn.onclick = async () => {
      const payload = {
        name: agent.name || document.getElementById('aName').value.trim(),
        description: document.getElementById('aDesc').value.trim(),
        icon: document.getElementById('aIcon').value.trim(),
        role_prompt: document.getElementById('aRole').value,
        tag_filters: {
          mode: document.getElementById('aMode') ? document.getElementById('aMode').value : (agent.tag_filters?.mode || 'AND'),
          // tags moved to knowledge section; read from knowledge pills
          tags: getSelectedTags('kTagPills')
        },
        search_strategy: document.getElementById('aStrat').value,
        agent_type: document.getElementById('aType').value,
        top_k: parseInt(document.getElementById('aTopK').value || '6', 10),
        chunk_size: parseInt(document.getElementById('aChunk').value || '800', 10),
        required_citations: document.getElementById('aCite').checked,
        answer_style: document.getElementById('aStyle').value,
        output_format: document.getElementById('aFmt').value,
        temperature: parseFloat(document.getElementById('aTemp').value || '0.2'),
        max_tokens: parseInt(document.getElementById('aMaxTok').value || '1200', 10),
        knowledge: agent.knowledge || {}
      };
      try {
        if (agent.name) {
          await api.update(agent.name, payload);
        } else {
          await api.create(payload);
        }
        document.dispatchEvent(new CustomEvent('agents:refresh-tree'));
        // Reload and re-render
        const all = await api.list();
        const updated = all.find(x => x.name === payload.name);
        if (updated) renderAgentDetails(updated);
      } catch (e) {
        alert('Failed to save agent');
      }
    };

    // Delete existing agent
    const delBtn = document.getElementById('agentDeleteBtn');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`Delete agent "${agent.name}"?`)) return;
      await api.remove(agent.name);
      document.dispatchEvent(new CustomEvent('agents:refresh-tree'));
      section.innerHTML = '';
    };

    // Knowledge panel (only when agent exists)
    if (agent.name) {
      const know = document.createElement('div');
      know.className = 'agents-knowledge';
      know.innerHTML = `
        <h4><i class="fas fa-book"></i> Agent Knowledge</h4>
        <div class="knowledge-toggles" id="knowledgeToggles" style="display:flex;gap:16px;margin:8px 0;align-items:center;">
          <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aUseNotesKS"> Use Notes</label>
          <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aUseDocsKS"> Use Agent Documents</label>
          <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="aUseLinksKS"> Use Links</label>
        </div>
        <div class="agents-knowledge-actions">
          <div class="knowledge-block" id="notesFilterBlock">
            <div class="kb-title"><span class="kb-label"><i class="fas fa-tags"></i> Note Tag Filters</span></div>
            <div class="tag-filter-section">
              <div class="tag-pills-container" id="kTagPills"></div>
              <div class="tag-input-wrapper">
                <input id="kTagInput" placeholder="Search existing tags..." autocomplete="off">
                <div class="tag-suggestions" id="kTagSuggestions"></div>
              </div>
            </div>
          </div>
          <div class="knowledge-block" id="agentDocBlock">
            <div class="kb-title"><span class="kb-label"><i class="fas fa-file"></i> Documents</span><div class="kb-actions"><button class="btn" id="agentDocUpload"><i class="fas fa-upload"></i> Upload</button></div></div>
            <div class="kb-row" id="agentDocDrop">
              <input type="file" id="agentDocFile" multiple style="display:none" />
              <button class="drop-plus" id="agentDocTrigger" title="Add documents"><i class="fas fa-plus"></i></button>
            </div>
            <div class="agents-knowledge-uploads" id="agentDocUploads" style="margin:6px 0 8px 0;"></div>
            <div class="agents-knowledge-list" id="agentDocList">Loading…</div>
          </div>
          <div class="knowledge-block" id="agentLinksBlock">
            <div class="kb-title"><span class="kb-label"><i class="fas fa-link"></i> Links</span></div>
            <div class="kb-row">
              <input type="url" id="agentLinkUrl" placeholder="https://example.com/article" style="flex:1;" />
              <button class="btn" id="agentLinkAdd"><i class="fas fa-plus"></i> Add</button>
            </div>
            <div class="input-feedback" id="agentLinkFeedback"></div>
            <div class="agents-knowledge-list" id="agentLinkList">Loading…</div>
          </div>
          <div class="knowledge-block">
            <div class="kb-title"><i class="fas fa-database"></i> Databases (SQLite)</div>
            <div class="kb-row" style="gap:8px;flex-wrap:wrap;">
              <input type="text" id="agentDbName" placeholder="Name (e.g., analytics)" />
              <input type="text" id="agentDbPath" placeholder="Path (e.g., instance/notetaker.db)" style="flex:1;" />
              <input type="text" id="agentDbQuery" placeholder="SQL query (e.g., SELECT * FROM notes LIMIT 200)" style="flex:2;" />
              <button class="btn" id="agentDbAdd"><i class="fas fa-plus"></i> Add</button>
            </div>
            <div class="agents-knowledge-list" id="agentDbList">Loading…</div>
          </div>
        </div>
      `;
      container.appendChild(know);
      const docListEl = know.querySelector('#agentDocList');
      const linkListEl = know.querySelector('#agentLinkList');
      const dbListEl = know.querySelector('#agentDbList');
      // Init toggles from agent config
      const useNotesKS = know.querySelector('#aUseNotesKS');
      const useDocsKS = know.querySelector('#aUseDocsKS');
      const useLinksKS = know.querySelector('#aUseLinksKS');
      const knowledgeCfg = agent.knowledge || {};
      useNotesKS.checked = (knowledgeCfg.use_notes !== false);
      useDocsKS.checked = (knowledgeCfg.use_agent_docs !== false);
      useLinksKS.checked = (knowledgeCfg.use_links !== false);
      // Initialize tag filter in knowledge section
      initializeTagFilter(agent.tag_filters?.tags || [], 'kTagPills', 'kTagInput', 'kTagSuggestions');
      const setBlockVisibility = () => {
        const docBlock = know.querySelector('#agentDocBlock');
        const linksBlock = know.querySelector('#agentLinksBlock');
        const notesBlock = know.querySelector('#notesFilterBlock');
        if (docBlock) docBlock.style.display = useDocsKS.checked ? '' : 'none';
        if (linksBlock) linksBlock.style.display = useLinksKS.checked ? '' : 'none';
        if (notesBlock) notesBlock.style.display = useNotesKS.checked ? '' : 'none';
      };
      setBlockVisibility();
      const saveKnowledge = async () => {
        try {
          await api.update(agent.name, { knowledge: { ...(agent.knowledge||{}), use_notes: useNotesKS.checked, use_agent_docs: useDocsKS.checked, use_links: useLinksKS.checked } });
          agent.knowledge = { ...(agent.knowledge||{}), use_notes: useNotesKS.checked, use_agent_docs: useDocsKS.checked, use_links: useLinksKS.checked };
        } catch (e) { /* no-op UI save */ }
      };
      useNotesKS.onchange = () => { setBlockVisibility(); saveKnowledge(); };
      useDocsKS.onchange = () => { setBlockVisibility(); saveKnowledge(); };
      useLinksKS.onchange = () => { setBlockVisibility(); saveKnowledge(); };

      const loadDocs = async () => {
        try {
          const docs = await api.knowledgeList(agent.name);
          docListEl.innerHTML = '';
          if (!docs || docs.length === 0) { docListEl.textContent = 'No documents yet.'; return; }
          docs.forEach(d => {
            const card = document.createElement('div');
            card.className = 'agent-doc-card';
            card.style.position = 'relative';
            card.style.border = '1px solid #ddd';
            card.style.borderRadius = '6px';
            card.style.padding = '8px 12px';
            card.style.margin = '6px 0';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'space-between';
            const name = document.createElement('div');
            name.textContent = d.filename;
            name.style.wordBreak = 'break-all';
            const del = document.createElement('button');
            del.className = 'btn small danger';
            del.innerHTML = '<i class="fas fa-times"></i>';
            del.style.position = 'absolute';
            del.style.top = '6px';
            del.style.right = '6px';
            del.title = 'Remove document';
            del.onclick = async () => {
              const ok = confirm(`Remove document "${d.filename}"?`);
              if (!ok) return;
              try { await api.knowledgeDelete(agent.name, d.filename); await new Promise(r=>setTimeout(r,150)); await loadDocs(); } catch { alert('Failed to remove document'); }
            };
            card.appendChild(name);
            card.appendChild(del);
            docListEl.appendChild(card);
          });
        } catch { docListEl.textContent = 'Failed to load documents.'; }
      };
      const loadLinks = async () => {
        try {
          const links = await api.listLinks(agent.name);
          linkListEl.innerHTML = '';
          if (!links || links.length === 0) { linkListEl.textContent = 'No links yet.'; return; }
          links.forEach(u => {
            const card = document.createElement('div');
            card.className = 'agent-doc-card';
            const a = document.createElement('a'); a.href = u; a.textContent = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.wordBreak = 'break-all';
            const del = document.createElement('button'); del.className='btn small danger'; del.innerHTML = '<i class="fas fa-times"></i>';
            del.style.position = 'absolute'; del.style.top='6px'; del.style.right='6px'; del.title='Remove link';
            del.onclick = async () => { const ok = confirm('Remove this link?'); if (!ok) return; await api.removeLink(agent.name, u); await loadLinks(); };
            card.appendChild(a); card.appendChild(del);
            linkListEl.appendChild(card);
          });
        } catch { linkListEl.textContent = 'Failed to load links.'; }
      };
      const loadDbs = async () => {
        try {
          const dbs = await api.listDatabases(agent.name);
          dbListEl.innerHTML = '';
          if (!dbs || dbs.length === 0) { dbListEl.textContent = 'No databases yet.'; return; }
          dbs.forEach(d => {
            const row = document.createElement('div');
            row.className = 'agent-db-row';
            const name = document.createElement('span'); name.textContent = `${d.name} — ${d.path}`;
            const ing = document.createElement('button'); ing.className='btn small'; ing.innerHTML = '<i class="fas fa-download"></i> Ingest';
            ing.onclick = async () => { const r = await api.ingestDatabase(agent.name, d.name); alert(r.message || `Ingested ${r.chunks||0} chunks`); };
            const del = document.createElement('button'); del.className='btn small'; del.innerHTML = '<i class="fas fa-trash"></i>';
            del.onclick = async () => { await api.deleteDatabase(agent.name, d.name); await loadDbs(); };
            row.appendChild(name); row.appendChild(ing); row.appendChild(del);
            dbListEl.appendChild(row);
          });
        } catch { dbListEl.textContent = 'Failed to load databases.'; }
      };

      loadDocs(); loadLinks(); loadDbs();

      const normalizeUrl = (s) => {
        let u = (s || '').trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        try { new URL(u); return u; } catch { return ''; }
      };
      const addLinkNow = async () => {
        const input = know.querySelector('#agentLinkUrl');
        const feedback = know.querySelector('#agentLinkFeedback');
        const raw = input ? (input.value || '') : '';
        const url = normalizeUrl(raw);
        if (!url) {
          if (feedback) {
            feedback.textContent = 'Enter a valid URL (e.g., https://example.com)';
            feedback.classList.add('show');
          }
          input && input.classList.add('invalid');
          setTimeout(() => { feedback && (feedback.textContent=''); feedback && feedback.classList.remove('show'); input && input.classList.remove('invalid'); }, 2500);
          return;
        }
        try {
          const btn = know.querySelector('#agentLinkAdd');
          const prev = btn ? btn.innerHTML : '';
          if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
          const res = await api.addLink(agent.name, url, true);
          if (!res || res.status !== 'success') {
            const msg = (res && res.message) ? res.message : 'Failed to add link';
            if (feedback) { feedback.textContent = msg; feedback.classList.add('show'); setTimeout(()=>{ feedback.textContent=''; feedback.classList.remove('show'); }, 3000); }
            return;
          }
          input && (input.value = '');
          await loadLinks();
        } catch (e) {
          if (feedback) { feedback.textContent = 'Failed to add link'; feedback.classList.add('show'); setTimeout(()=>{ feedback.textContent=''; feedback.classList.remove('show'); }, 2500); }
        } finally {
          const btn = know.querySelector('#agentLinkAdd');
          if (btn) { btn.innerHTML = '<i class="fas fa-plus"></i> Add'; btn.disabled = false; }
        }
      };
      const linkAddBtn = know.querySelector('#agentLinkAdd');
      if (linkAddBtn) linkAddBtn.onclick = (e) => { e.preventDefault(); addLinkNow(); };
      const linkInput = know.querySelector('#agentLinkUrl');
      if (linkInput) linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLinkNow(); } });

      const uploadsEl = know.querySelector('#agentDocUploads');
      const stage = [];
      const renderStage = () => {
        uploadsEl.innerHTML = '';
        if (stage.length === 0) return;
        stage.forEach((f, idx) => {
          const row = document.createElement('div');
          row.className = 'agent-stage-row';
          row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.margin = '4px 0';
          const name = document.createElement('span'); name.textContent = f.name; name.style.flex = '1';
          const remove = document.createElement('button'); remove.className = 'btn small'; remove.innerHTML = '<i class="fas fa-times"></i>';
          remove.title = 'Remove from upload list';
          remove.onclick = () => { stage.splice(idx,1); renderStage(); };
          row.appendChild(name); row.appendChild(remove);
          uploadsEl.appendChild(row);
        });
      };

      const addToStage = (files) => {
        if (!files) return;
        Array.from(files).forEach(f => {
          // avoid duplicates by name+size+lastModified
          const key = f.name + '|' + f.size + '|' + f.lastModified;
          if (!stage.some(x => (x.name+'|'+x.size+'|'+x.lastModified) === key)) stage.push(f);
        });
        renderStage();
      };
      const runUploads = async (files) => {
        if (!files || files.length === 0) return;
        uploadsEl.innerHTML = '';
        const list = Array.from(files);
        // Upload sequentially to keep UI simpler
        for (const file of list) {
          const row = document.createElement('div');
          row.className = 'agent-upload-row';
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '8px';
          const name = document.createElement('span');
          name.textContent = file.name;
          name.style.flex = '1';
          const barWrap = document.createElement('div');
          barWrap.style.flex = '2';
          barWrap.style.height = '6px';
          barWrap.style.background = '#eee';
          barWrap.style.borderRadius = '4px';
          const bar = document.createElement('div');
          bar.style.height = '100%';
          bar.style.width = '0%';
          bar.style.background = '#4a90e2';
          bar.style.borderRadius = '4px';
          barWrap.appendChild(bar);
          const status = document.createElement('span');
          status.textContent = '0%';
          status.style.minWidth = '40px';
          row.appendChild(name); row.appendChild(barWrap); row.appendChild(status);
          uploadsEl.appendChild(row);

          try {
            await api.knowledgeUploadProgress(agent.name, file, (pct) => { bar.style.width = pct + '%'; status.textContent = pct + '%'; });
            bar.style.background = '#32a852'; // green
            status.textContent = 'Done';
          } catch (e) {
            bar.style.background = '#d9534f'; // red
            status.textContent = 'Error';
          }
        }
        await loadDocs();
      };

      know.querySelector('#agentDocUpload').onclick = async () => {
        const fi = know.querySelector('#agentDocFile');
        if (fi.files && fi.files.length) addToStage(fi.files);
        if (stage.length === 0) return;
        await runUploads(stage);
        stage.length = 0; // clear
        renderStage();
        fi.value = '';
      };

      // Drag & Drop support
      const dropZone = know.querySelector('#agentDocDrop');
      const docBlock = know.querySelector('#agentDocBlock');
      const setDropState = (on) => {
        if (on) { docBlock.classList.add('drag-over'); dropZone.classList.add('drag-over'); }
        else { docBlock.classList.remove('drag-over'); dropZone.classList.remove('drag-over'); }
      };
      ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setDropState(true); }));
      ['dragleave','dragend','drop'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); if (ev !== 'drop') setDropState(false); }));
      dropZone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        const files = dt && dt.files ? dt.files : null;
        setDropState(false);
        addToStage(files);
      });

      // Also stage files immediately when selected via input or plus icon
      const fileInput = know.querySelector('#agentDocFile');
      fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files.length) addToStage(fileInput.files);
      });
      const triggerBtn = know.querySelector('#agentDocTrigger');
      triggerBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
      know.querySelector('#agentLinkAdd').onclick = async () => {
        const input = know.querySelector('#agentLinkUrl');
        const url = (input.value || '').trim();
        if (!url) return;
        const btn = know.querySelector('#agentLinkAdd');
        const prev = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
        try { await api.addLink(agent.name, url, true); input.value=''; await loadLinks(); }
        catch { alert('Failed to add link'); }
        finally { btn.innerHTML = prev; btn.disabled = false; }
      };
      know.querySelector('#agentDbAdd').onclick = async () => {
        const nameEl = know.querySelector('#agentDbName');
        const pathEl = know.querySelector('#agentDbPath');
        const qEl = know.querySelector('#agentDbQuery');
        const payload = { name: nameEl.value.trim(), path: pathEl.value.trim(), queries: qEl.value.trim() ? [qEl.value.trim()] : [] };
        if (!payload.name || !payload.path) { alert('Name and path required'); return; }
        const btn = know.querySelector('#agentDbAdd'); const prev = btn.innerHTML; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
        try { await api.addDatabase(agent.name, payload); nameEl.value=''; pathEl.value=''; qEl.value=''; await loadDbs(); }
        catch { alert('Failed to add database'); }
        finally { btn.innerHTML = prev; btn.disabled = false; }
      };
    }
  }

  async function mountAgentsTab() {
    const section = document.getElementById('agentsSection');
    if (!section) return;

    // When tab becomes active, default to empty view until a selection is made
    document.addEventListener('tabChanged', (e) => {
      if (e.detail && e.detail.tabType === 'agents') {
        // no-op; wait for selection from tree
      }
    });
  }

  // expose helpers for sidebar buttons or other modules
  window.agents = {
  openCreateModal: () => {
      // Render blank form inline and switch to agents tab
      renderAgentDetails({
        name: '', description: '', role_prompt: '', icon: '🤖', tag_filters: { mode: 'AND', tags: [] },
        search_strategy: 'hybrid', top_k: 6, chunk_size: 800, required_citations: true,
        answer_style: 'balanced', output_format: 'markdown', temperature: 0.2, max_tokens: 1200
      });
      document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabType: 'agents' } }));
    },
    openEditModal,
    openRunModal,
    openRunModalByName,
  renderAgentDetails,
  };

  // Tag filter management functions
  async function fetchAvailableTags(query = '') {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('limit', '50');
      params.set('includeUsage', 'true');
      const response = await fetch(`/api/tags?${params.toString()}`);
      const data = await response.json();
      // Normalize tag fields for UI consumers
      const tags = (data.tags || []).map(t => ({
        ...t,
        usage_count: (t.usage_count != null ? t.usage_count : (t.usage != null ? t.usage : 0))
      }));
      return tags;
    } catch (error) {
      console.error('Failed to fetch tags:', error);
      return [];
    }
  }

  function createTagPill(tag, containerId) {
    const pill = document.createElement('span');
    pill.className = `tag-pill tag-${tag.color || 'default'}`;
    pill.setAttribute('data-tag-id', tag.id);
    pill.setAttribute('data-tag-name', tag.name);
    pill.innerHTML = `
      <span class="tag-name">${tag.name}</span>
      <button class="tag-remove" type="button" aria-label="Remove tag">×</button>
    `;
    
    // Remove tag when clicking the X
    pill.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pill.remove();
    });
    
    return pill;
  }

  function addTagToPills(tag, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Check if tag already exists
    const existingPills = container.querySelectorAll('.tag-pill');
    for (const pill of existingPills) {
      if (pill.getAttribute('data-tag-name') === tag.name) {
        return; // Tag already exists
      }
    }
    
    const pill = createTagPill(tag, containerId);
    container.appendChild(pill);
  }

  function getSelectedTags(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    
    return Array.from(container.querySelectorAll('.tag-pill')).map(pill => 
      pill.getAttribute('data-tag-name')
    );
  }

  function initializeTagFilter(initialTags, pillsContainerId, inputId, suggestionsId) {
    const pillsContainer = document.getElementById(pillsContainerId);
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    
    if (!pillsContainer || !input || !suggestions) return;

    // Add initial tags as pills - convert string tags to tag objects
    if (Array.isArray(initialTags) && initialTags.length > 0) {
      // Load all tags first, then match them
      fetchAvailableTags().then(allTags => {
        for (const tagName of initialTags) {
          const tag = allTags.find(t => t.name === tagName);
          if (tag) {
            addTagToPills(tag, pillsContainerId);
          } else {
            // Fallback for tags that might not be found
            addTagToPills({ name: tagName, color: 'default', id: tagName }, pillsContainerId);
          }
        }
      }).catch(error => {
        console.error('Failed to load initial tags:', error);
        // Fallback: add tags with default styling
        for (const tagName of initialTags) {
          addTagToPills({ name: tagName, color: 'default', id: tagName }, pillsContainerId);
        }
      });
    }

    let debounceTimer;
    // Keep last fetched suggestion list around for free-text matching
    let lastAvailableTags = [];
    
    // Helper: add tags by free-text (comma-separated), only if they exist in available list
    const addByFreeText = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return;
      // Ensure we have a reasonably complete list to match against
      let pool = lastAvailableTags;
      if (!pool || pool.length === 0) {
        try {
          // Fetch a larger list for matching; server enforces limits anyway
          const params = new URLSearchParams();
          params.set('limit', '200');
          params.set('includeUsage', 'true');
          const resp = await fetch(`/api/tags?${params.toString()}`);
          const data = await resp.json();
          pool = (data && data.tags) || [];
        } catch (e) {
          pool = [];
        }
      }
      const lowerPoolMap = new Map(pool.map(t => [String(t.name).toLowerCase(), t]));
      let addedAny = false;
      for (const p of parts) {
        const t = lowerPoolMap.get(p.toLowerCase());
        if (t) {
          addTagToPills(t, pillsContainerId);
          addedAny = true;
        }
      }
      if (addedAny) {
        input.value = '';
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
      }
    };
    
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const query = input.value.trim();
        
        // If query empty, still show a default list to help discovery
        const tags = await fetchAvailableTags(query);
        const selectedTagNames = getSelectedTags(pillsContainerId);
        
        // Filter out already selected tags
        const availableTags = tags.filter(tag => !selectedTagNames.includes(tag.name));
        // Cache for free-text/keyboard support
        lastAvailableTags = availableTags;
        
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
        
        // Only show existing tags (no creation option)
        if (availableTags.length > 0) {
          availableTags.slice(0, 8).forEach(tag => {
            const option = document.createElement('div');
            option.className = 'tag-suggestion';
            option.innerHTML = `
              <span class="tag-pill tag-${tag.color || 'default'} suggestion-pill">
                <span class="tag-name">${tag.name}</span>
              </span>
              <span class="usage-count">${(tag.usage_count || 0)} ${((tag.usage_count || 0) === 1 ? 'note' : 'notes')}</span>
            `;
            option.addEventListener('click', (evt) => {
              evt.preventDefault();
              evt.stopPropagation();
              addTagToPills(tag, pillsContainerId);
              input.value = '';
              // Refresh suggestions to allow rapid multi-add
              input.focus();
              input.dispatchEvent(new Event('input'));
            });
            suggestions.appendChild(option);
          });
          suggestions.style.display = 'block';
        } else {
          suggestions.innerHTML = '<div class="no-suggestions">No existing tags found</div>';
          suggestions.style.display = 'block';
        }
      }, 300);
    });

    // Handle keyboard navigation and quick-add
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // If input contains comma-separated names, prefer multi-add
        if (input.value.includes(',')) {
          await addByFreeText();
          // After multi-add, repopulate suggestions for more additions
          input.focus();
          input.dispatchEvent(new Event('input'));
          return;
        }
        const firstSuggestion = suggestions.querySelector('.tag-suggestion');
        if (firstSuggestion) {
          firstSuggestion.dispatchEvent(new Event('click', { bubbles: true }));
        } else {
          await addByFreeText();
          input.focus();
          input.dispatchEvent(new Event('input'));
        }
      } else if (e.key === ',') {
        // Support comma-separated multi-add
        e.preventDefault();
        await addByFreeText();
      } else if (e.key === 'Tab') {
        // Tab can also accept the first suggestion if present
        const firstSuggestion = suggestions.querySelector('.tag-suggestion');
        if (firstSuggestion) {
          e.preventDefault();
          firstSuggestion.click();
        }
      } else if (e.key === 'Escape') {
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
        input.blur();
      }
    });

    // Handle paste of comma-separated tags
    input.addEventListener('paste', async (evt) => {
      try {
        const text = (evt.clipboardData || window.clipboardData).getData('text');
        if (text && text.includes(',')) {
          // Allow the paste to complete, then parse
          setTimeout(addByFreeText, 0);
        }
      } catch {}
    });

    // Show/hide suggestions on focus/blur
    input.addEventListener('focus', () => {
      // Always show suggestions on focus to promote discovery
      input.dispatchEvent(new Event('input'));
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !suggestions.contains(e.target)) {
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', mountAgentsTab);

  // iOS-style emoji icon picker with categories + recents (anchored to a button)
  function attachIconPicker(inputEl, opts = {}) {
    if (!inputEl || inputEl.dataset.iconPicker) return;
    inputEl.dataset.iconPicker = '1';
    const anchorEl = opts.anchorEl || inputEl;

    const pop = document.createElement('div');
    pop.className = 'icon-picker-popover';
    pop.setAttribute('role', 'listbox');
    pop.style.display = 'none';
    // Header with tabs (iOS-style)
    const header = document.createElement('div');
    header.className = 'icon-picker-header';
    const tabs = document.createElement('div');
    tabs.className = 'icon-tabs';
    header.appendChild(tabs);
    pop.appendChild(header);

    // Content grid
    const grid = document.createElement('div');
    grid.className = 'icon-grid';
    pop.appendChild(grid);
    document.body.appendChild(pop);

    // Categories
    const CATS = [
      { key: 'recent', label: '★', title: 'Recent' },
      { key: 'smileys', label: '😀', title: 'Smileys' },
      { key: 'people', label: '🧑', title: 'People' },
      { key: 'animals', label: '🐻', title: 'Animals' },
      { key: 'food', label: '🍔', title: 'Food' },
      { key: 'activities', label: '⚽', title: 'Activities' },
      { key: 'travel', label: '🚗', title: 'Travel' },
      { key: 'objects', label: '💡', title: 'Objects' },
      { key: 'symbols', label: '❤️', title: 'Symbols' },
      { key: 'flags', label: '🏳️', title: 'Flags' }
    ];

    const DATA = {
      smileys: '😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🙂‍↕️ 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤠 🤡 👻 💩 👽 🤖'.split(' '),
      people: '👋 🤚 ✋ 🖐 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🦵 🦶 👣 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁 👅 👄 🧑 🧒 👦 👧 👨 👩 🧔 👱‍♂️ 👱‍♀️ 🤵 👰 🤰 🤱 👨‍👩‍👧 👨‍👩‍👦'.split(' '),
      animals: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦂 🕷️ 🐢 🐍 🦎 🐙 🦑 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🦧 🦍 🐘 🐫 🐪 🐐 🐏 🐑 🐎 🐄 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🌾 🌺 🌸 🌼 🌻 🌷 🌹 🍄'.split(' '),
      food: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🥕 🧄 🧅 🥔 🍞 🥐 🥖 🥨 🥯 🥞 🧇 🧀 🍗 🍖 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍱 🍤 🍚 🍙 🍘 🥮 🥟 🥠 🥡 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥤 ☕ 🍵 🍺 🍻 🍷 🍸 🍹 🥃 🧋 🧉'.split(' '),
      activities: '⚽ 🏀 🏈 🏐 🏉 🎾 🥏 🎱 🏓 🏸 🥅 🏒 🏑 🥍 🥌 ⛳ 🏹 🎣 🛷 ⛸️ 🥊 🥋 🎽 🛹 🛼 🥇 🥈 🥉 🏆 🎖 🎗 🎫 🎟 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🧩 ♟️ 🎯 🎳 🎮 🕹️'.split(' '),
      travel: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 ✈️ 🛩️ 🛫 🛬 🪂 🚀 🛸 🚁 🚂 🚆 🚇 🚊 🚝 🚞 🚋 🚈 🚉 ⛵ 🚤 🛥️ 🛳️ ⛴️ ⚓ 🗽 🗼 🗿 🗺️ 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🛣️ 🛤️ 🏗️ 🏭 🏢 🏬 🏛️ 🕌 🛕 ⛪ 🕍 🏯 🏰 🏠 🏡 🏙️ 🌃 🌆 🌇'.split(' '),
      objects: '💡 🔦 🔌 🔋 🧯 🧲 🧪 ⚗️ 🧫 🧬 🔭 🔬 🔧 🔨 🛠️ ⚙️ 🧱 🧲 🪛 🔩 💎 💍 📿 🔗 🧷 🧵 🪡 🧶 🧥 👚 👕 👖 🧦 🧤 🧣 👗 👔 👟 👞 🥾 👜 👝 🎒 👓 🕶️ 🧳 ⌚ 📱 💻 🖥️ 🖨️ ⌨️ 🖱️ 💽 💾 💿 📷 🎥 📹 🔍 🔎 🕯️ 🛏️ 🛋️ 🚪 🪑 🪟 🧴 🧻 🪠 🧹 🧺 🧼 🧽 🪥'.split(' '),
      symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ ☸️ ✡️ 🔯 ☯️ ☦️ ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ 🔼 🔽 ⏫ ⏬ ➕ ➖ ➗ ❌ ✅ ✔️ ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↖️ ↙️ ↔️ ↩️ ↪️ ⤴️ ⤵️'.split(' '),
      flags: '🏳️ 🏴 🏁 🚩 🇺🇳 🇪🇺 🇺🇸 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇨🇦 🇲🇽 🇧🇷 🇦🇷 🇨🇴 🇨🇱 🇯🇵 🇨🇳 🇰🇷 🇮🇳 🇦🇺 🇳🇿 🇿🇦 🇳🇬 🇪🇬 🇸🇦 🇹🇷 🇺🇦 🇷🇺'.split(' ')
    };

    function loadRecents() {
      try { return JSON.parse(localStorage.getItem('icon_picker_recents') || '[]'); } catch { return []; }
    }
    function saveRecents(arr) {
      try { localStorage.setItem('icon_picker_recents', JSON.stringify(arr.slice(0, 24))); } catch {}
    }

    let currentCat = 'recent';
    let recents = loadRecents();

    let suppressClose = false;

    function renderTabs() {
      tabs.innerHTML = '';
      CATS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-tab' + (currentCat === c.key ? ' active' : '');
        b.title = c.title;
        b.textContent = c.label;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          currentCat = c.key;
          // Keep the menu open; just refresh contents and tabs
          suppressClose = true;
          // Defer re-render to next frame to avoid DOM removal affecting outside-click detector
          requestAnimationFrame(() => { renderTabs(); renderGrid(); });
        });
        tabs.appendChild(b);
      });
    }

    function addRecent(emo) {
      recents = [emo, ...recents.filter(x => x !== emo)];
      saveRecents(recents);
    }

    function selectEmoji(e) {
      inputEl.value = e;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof opts.onSelect === 'function') {
        try { opts.onSelect(e); } catch {}
      }
      addRecent(e);
      if (currentCat === 'recent') renderGrid();
      hide();
      // No focusing of hidden input; keep UX on header
    }

    function renderGrid() {
      grid.innerHTML = '';
      let list = [];
      if (currentCat === 'recent') {
        list = recents;
      } else {
        list = DATA[currentCat] || [];
      }
      list.forEach(e => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn';
        btn.textContent = e;
        btn.setAttribute('aria-label', `Use ${e} as icon`);
        btn.addEventListener('click', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          selectEmoji(e);
        });
        grid.appendChild(btn);
      });
      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'icon-empty';
        empty.textContent = 'No matches';
        grid.appendChild(empty);
      }
    }

    function position() {
      try {
        const r = anchorEl.getBoundingClientRect();
        const top = Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 8);
        let left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
        pop.style.top = `${Math.max(8, top)}px`;
        pop.style.left = `${left}px`;
      } catch {}
    }
    function show() { pop.style.display = 'block'; renderTabs(); renderGrid(); position(); }
    function hide() { pop.style.display = 'none'; }
    function isOpen() { return pop.style.display !== 'none'; }

    // Events
    document.addEventListener('click', (e) => {
      if (suppressClose) { suppressClose = false; return; }
      const clickInsideAnchor = (anchorEl && typeof anchorEl.contains === 'function') ? anchorEl.contains(e.target) : false;
      if (!pop.contains(e.target) && !clickInsideAnchor) hide();
    });
    window.addEventListener('resize', () => { if (isOpen()) position(); });
    window.addEventListener('scroll', () => { if (isOpen()) position(); }, true);

    // Expose programmatic controls for external triggers (e.g., header pencil)
    inputEl._iconPicker = { show, hide, isOpen, popEl: pop, anchorEl };
  }
})();
