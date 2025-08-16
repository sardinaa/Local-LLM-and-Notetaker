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
      agentHeader.appendChild(el('div', { class: 'agent-name' }, a.name || '(unnamed)'));
      
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
      name: '', description: '', role_prompt: '', tag_filters: { mode: 'AND', tags: [] },
      search_strategy: 'hybrid', top_k: 6, chunk_size: 800, recency_boost_days: '', required_citations: true,
      answer_style: 'balanced', tooling: { rag_notes: true, compose_actions: false, web_search: false },
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
          <div class="row">
            <label>Top K <input id="aTopK" type="number" min="1" max="20" value="${data.top_k || 6}"></label>
            <label>Chunk Size <input id="aChunk" type="number" min="200" max="4000" value="${data.chunk_size || 800}"></label>
            <label>Temperature <input id="aTemp" type="number" step="0.1" min="0" max="1" value="${data.temperature || 0.2}"></label>
            <label>Max Tokens <input id="aMaxTok" type="number" min="128" max="4096" value="${data.max_tokens || 1200}"></label>
          </div>
          <label>Answer Style <select id="aStyle"><option ${data.answer_style==='concise'?'selected':''}>concise</option><option ${data.answer_style==='balanced'?'selected':''}>balanced</option><option ${data.answer_style==='detailed'?'selected':''}>detailed</option></select></label>
          <label>Output Format <select id="aFmt"><option ${data.output_format==='markdown'?'selected':''}>markdown</option><option ${data.output_format==='plain'?'selected':''}>plain</option><option ${data.output_format==='json'?'selected':''}>json</option></select></label>
          <label style="display: flex; align-items: center; gap: 8px; flex-direction: row;"><input id="aCite" type="checkbox" ${data.required_citations?'checked':''}> Require Citations</label>
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
        role_prompt: document.getElementById('aRole').value,
        tag_filters: {
          mode: document.getElementById('aMode').value,
          tags: getSelectedTags('aTagPills')
        },
        search_strategy: document.getElementById('aStrat').value,
        top_k: parseInt(document.getElementById('aTopK').value || '6', 10),
        chunk_size: parseInt(document.getElementById('aChunk').value || '800', 10),
        required_citations: document.getElementById('aCite').checked,
        answer_style: document.getElementById('aStyle').value,
        output_format: document.getElementById('aFmt').value,
        temperature: parseFloat(document.getElementById('aTemp').value || '0.2'),
        max_tokens: parseInt(document.getElementById('aMaxTok').value || '1200', 10)
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
      el('h3', {}, agent.name || '(New Agent)'),
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
      <label>Role Prompt <textarea id="aRole" placeholder="Define the agent's role and behavior...">${agent.role_prompt || ''}</textarea></label>
      <label>Tag Filters 
        <div class="tag-filter-section">
          <div class="tag-pills-container" id="aTagPillsInline"></div>
          <div class="tag-input-wrapper">
            <input id="aTagInputInline" placeholder="Search existing tags..." autocomplete="off">
            <div class="tag-suggestions" id="aTagSuggestionsInline"></div>
          </div>
        </div>
      </label>
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
    `;
    container.appendChild(form);

    const actions = el('div', { class: 'agents-modal-actions' });
    const saveBtn = el('button', { class: 'btn primary', html: '<i class="fas fa-save"></i> Save' });
    actions.appendChild(saveBtn);
    container.appendChild(actions);

    section.appendChild(container);

    // Initialize tag filter functionality for inline form
    initializeTagFilter(agent.tag_filters?.tags || [], 'aTagPillsInline', 'aTagInputInline', 'aTagSuggestionsInline');

    // Save
    saveBtn.onclick = async () => {
      const payload = {
        name: agent.name || document.getElementById('aName').value.trim(),
        description: document.getElementById('aDesc').value.trim(),
        role_prompt: document.getElementById('aRole').value,
        tag_filters: {
          mode: document.getElementById('aMode').value,
          tags: getSelectedTags('aTagPillsInline')
        },
        search_strategy: document.getElementById('aStrat').value,
        top_k: parseInt(document.getElementById('aTopK').value || '6', 10),
        chunk_size: parseInt(document.getElementById('aChunk').value || '800', 10),
        required_citations: document.getElementById('aCite').checked,
        answer_style: document.getElementById('aStyle').value,
        output_format: document.getElementById('aFmt').value,
        temperature: parseFloat(document.getElementById('aTemp').value || '0.2'),
        max_tokens: parseInt(document.getElementById('aMaxTok').value || '1200', 10)
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
        name: '', description: '', role_prompt: '', tag_filters: { mode: 'AND', tags: [] },
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
      return data.tags || [];
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
        
        if (query.length < 1) {
          suggestions.innerHTML = '';
          suggestions.style.display = 'none';
          return;
        }

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
              <span class="usage-count">${tag.usage_count || 0} notes</span>
            `;
            option.addEventListener('click', () => {
              addTagToPills(tag, pillsContainerId);
              input.value = '';
              suggestions.innerHTML = '';
              suggestions.style.display = 'none';
            });
            suggestions.appendChild(option);
          });
          suggestions.style.display = 'block';
        } else {
          suggestions.innerHTML = '<div class="no-suggestions">No existing tags found matching "' + query + '"</div>';
          suggestions.style.display = 'block';
        }
      }, 300);
    });

    // Handle keyboard navigation and quick-add
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstSuggestion = suggestions.querySelector('.tag-suggestion');
        if (firstSuggestion) {
          firstSuggestion.click();
        } else {
          // No visible suggestions — try free-text add (comma or single)
          await addByFreeText();
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
      if (input.value.trim()) {
        input.dispatchEvent(new Event('input'));
      }
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
})();
