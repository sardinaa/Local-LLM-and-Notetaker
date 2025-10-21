var AgentsBundle = (function (exports) {
  'use strict';

  let initPromise = null;
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

    function openEditModal(agent) {
      const data = agent || {
        name: '', description: '', role_prompt: '', icon: '🤖', tag_filters: { mode: 'AND', tags: [] },
        search_strategy: 'hybrid', top_k: 6, chunk_size: 800, required_citations: true,
        answer_style: 'balanced', agent_type: (agent && agent.agent_type) || 'qa',
        knowledge: { use_notes: true, use_agent_docs: true, links: [] },
        output_format: 'markdown', temperature: 0.2, max_tokens: 1200};

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
                // Open settings modal to agents tab
                if (window.settingsModal && typeof window.settingsModal.open === 'function') {
                  window.settingsModal.open('agents');
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
          <label><i class="fas fa-robot"></i> Model (optional)<input id="runModel" placeholder="leave empty for default from settings"/></label>
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

    // Render agents grid view
    async function renderAgentsGrid() {
      const section = document.getElementById('agentsSection');
      if (!section) return;
      
      try {
        const agents = await api.list();
        
        section.innerHTML = `
        <div class="agents-grid-container">
          <!-- Header with actions -->
          <div class="agents-grid-header">
            <h2><i class="fas fa-robot"></i> Agents</h2>
            <div class="agents-grid-actions">
              <button class="btn secondary" id="selectAllBtn">
                <i class="fas fa-check-square"></i> Select All
              </button>
              <button class="btn primary" id="createAgentBtn">
                <i class="fas fa-plus"></i> Create Agent
              </button>
              <button class="btn danger" id="deleteSelectedBtn" disabled>
                <i class="fas fa-trash"></i> Delete Selected
              </button>
            </div>
          </div>
          
          <!-- Grid of agent cards -->
          <div class="agents-grid" id="agentsGrid">
            ${agents.length === 0 ? '<div class="empty-state"><i class="fas fa-robot"></i><p>No agents yet. Create your first agent!</p></div>' : ''}
          </div>
        </div>
      `;
        
        const grid = section.querySelector('#agentsGrid');
        
        // Render agent cards
        agents.forEach(agent => {
          const card = document.createElement('div');
          card.className = 'agent-card';
          card.innerHTML = `
          <div class="agent-card-header">
            <div class="agent-card-checkbox">
              <input type="checkbox" class="agent-checkbox" data-agent="${agent.name}">
            </div>
          </div>
          <div class="agent-card-body">
            <div class="agent-card-icon">${agent.icon || '🤖'}</div>
            <div class="agent-card-content">
              <h3 class="agent-card-title">${agent.name}</h3>
              <p class="agent-card-description">${agent.description || 'No description'}</p>
              <div class="agent-card-meta">
                <span class="agent-card-type"><i class="fas fa-tag"></i> ${agent.agent_type || 'qa'}</span>
                <span class="agent-card-strategy"><i class="fas fa-search"></i> ${agent.search_strategy || 'hybrid'}</span>
              </div>
            </div>
          </div>
        `;
          
          // Click card to view details (but not checkbox)
          card.addEventListener('click', (e) => {
            if (!e.target.closest('.agent-card-checkbox') && e.target.type !== 'checkbox') {
              renderAgentDetails(agent);
            }
          });
          
          // Checkbox handler
          const checkbox = card.querySelector('.agent-checkbox');
          checkbox.addEventListener('change', updateSelectionState);
          
          grid.appendChild(card);
        });
        
        // Selection state management
        function updateSelectionState() {
          const checkboxes = section.querySelectorAll('.agent-checkbox');
          const checkedBoxes = section.querySelectorAll('.agent-checkbox:checked');
          const selectAllBtn = section.querySelector('#selectAllBtn');
          const deleteSelectedBtn = section.querySelector('#deleteSelectedBtn');
          
          // Update delete button state
          deleteSelectedBtn.disabled = checkedBoxes.length === 0;
          
          // Update select all button
          if (checkedBoxes.length === 0) {
            selectAllBtn.innerHTML = '<i class="fas fa-check-square"></i> Select All';
          } else if (checkedBoxes.length === checkboxes.length) {
            selectAllBtn.innerHTML = '<i class="fas fa-minus-square"></i> Deselect All';
          } else {
            selectAllBtn.innerHTML = '<i class="fas fa-minus-square"></i> Deselect All';
          }
        }
        
        // Button handlers
        const createBtn = section.querySelector('#createAgentBtn');
        createBtn.addEventListener('click', () => {
          renderAgentDetails({ name: '', description: '', role_prompt: '', agent_type: 'qa' });
        });
        
        const selectAllBtn = section.querySelector('#selectAllBtn');
        selectAllBtn.addEventListener('click', () => {
          const checkboxes = section.querySelectorAll('.agent-checkbox');
          const checkedBoxes = section.querySelectorAll('.agent-checkbox:checked');
          const shouldCheck = checkedBoxes.length !== checkboxes.length;
          
          checkboxes.forEach(cb => cb.checked = shouldCheck);
          updateSelectionState();
        });
        
        const deleteSelectedBtn = section.querySelector('#deleteSelectedBtn');
        deleteSelectedBtn.addEventListener('click', async () => {
          const checkedBoxes = section.querySelectorAll('.agent-checkbox:checked');
          const agentNames = Array.from(checkedBoxes).map(cb => cb.dataset.agent);
          
          if (!confirm(`Delete ${agentNames.length} selected agent(s)?`)) return;
          
          try {
            await Promise.all(agentNames.map(name => api.remove(name)));
            document.dispatchEvent(new CustomEvent('agents:refresh-tree'));
            renderAgentsGrid(); // Refresh grid
          } catch (err) {
            alert('Failed to delete some agents');
          }
        });
        
      } catch (err) {
        section.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load agents</p></div>';
      }
    }

    // Render selected agent details into the agents section (inline edit form)
    function renderAgentDetails(agent) {
      const section = document.getElementById('agentsSection');
      if (!section) return;
      section.innerHTML = '';

      const container = el('div', { class: 'agents-wrap' });

      // Inline edit form (same fields as modal)
      const form = el('div', { class: 'agents-form' });
      form.innerHTML = `
      <input id="aIcon" type="hidden" value="${agent.icon || ''}">
      
      <!-- Single Agent Features Section -->
      <div class="agent-features-section">
        <!-- Agent Header Inside -->
        <div class="agent-header-inline">
          <button class="icon-btn back-to-grid-btn" id="backToGridBtn" title="Back to agents">
            <i class="fas fa-arrow-left"></i>
          </button>
          <div class="agent-title-section">
            <h3 class="${agent.icon ? 'has-icon' : ''}">
              ${agent.icon ? `<span class="agent-icon">${agent.icon}</span>` : ''}
              ${agent.name || '(New Agent)'}
            </h3>
            <button class="icon-btn edit-icon-btn" id="editIconBtn" title="Edit icon">
              <i class="fas fa-pencil-alt"></i>
            </button>
          </div>
          <div class="agent-action-buttons">
            <button class="action-btn save-btn" id="agentSaveBtn">
              <i class="fas fa-save"></i>
              <span>Save</span>
            </button>
            ${agent.name ? `
            <button class="action-btn delete-btn" id="agentDeleteBtn">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
            ` : ''}
          </div>
        </div>
        
        <!-- Basic Information -->
        <h4 class="chat-config-header">
          <i class="fas fa-info-circle"></i> Basic Information
        </h4>
        
        <div class="form-field-group">
          <div class="form-field-label">
            <i class="fas fa-tag"></i>
            <span>Name</span>
          </div>
          <input id="aName" value="${agent.name || ''}" placeholder="Enter agent name..." ${agent.name ? 'disabled' : ''}>
        </div>
        
        <div class="form-field-group">
          <div class="form-field-label">
            <i class="fas fa-align-left"></i>
            <span>Description</span>
          </div>
          <input id="aDesc" value="${agent.description || ''}" placeholder="What does this agent do?">
        </div>
        
        <div class="form-field-group">
          <div class="form-field-label">
            <i class="fas fa-user-tie"></i>
            <span>Role Prompt</span>
          </div>
          <textarea id="aRole" placeholder="Define the agent's role and behavior...">${agent.role_prompt || ''}</textarea>
        </div>
      
        <!-- Chat Configuration -->
        <h4 class="chat-config-header" style="margin-top: 24px;">
          <i class="fas fa-cog"></i> Chat Configuration
        </h4>
        
        <!-- Memory Toggle Switch -->
        <div class="chat-config-item">
          <div class="chat-config-content">
            <i class="fas fa-brain chat-config-icon"></i>
            <div class="chat-config-text">
              <div class="chat-config-title">Conversational Memory</div>
              <div class="chat-config-description">Maintains context across conversation</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="aMemory" ${(agent.chat_config?.memory !== false) ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <!-- Web Search Toggle Switch -->
        <div class="chat-config-item">
          <div class="chat-config-content">
            <i class="fas fa-globe chat-config-icon"></i>
            <div class="chat-config-text">
              <div class="chat-config-title">Web Search</div>
              <div class="chat-config-description">Enable real-time web queries</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="aWebSearch" ${(agent.chat_config?.web_search === true) ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <!-- Complexity Radio Buttons -->
        <div class="processing-mode-section">
          <div class="processing-mode-header">
            <i class="fas fa-gauge-high"></i> Processing Mode
          </div>
          <div class="processing-mode-options">
            <label class="processing-mode-option">
              <input type="radio" name="aComplexity" id="aComplexitySimple" value="simple" ${(!agent.chat_config?.complexity || agent.chat_config?.complexity === 'simple') ? 'checked' : ''}>
              <div class="mode-details">
                <div class="mode-title">Standard Mode</div>
                <div class="mode-description">Single-pass processing for quick responses</div>
              </div>
            </label>
            <label class="processing-mode-option">
              <input type="radio" name="aComplexity" id="aComplexityAdaptive" value="adaptive" ${(agent.chat_config?.complexity === 'adaptive') ? 'checked' : ''}>
              <div class="mode-details">
                <div class="mode-title">Advanced Mode</div>
                <div class="mode-description">Multi-iteration processing with configurable graph nodes</div>
              </div>
            </label>
          </div>
          
          <!-- Adaptive Node Controls (hidden by default) -->
          <div id="adaptiveNodeControls" class="adaptive-node-controls ${(agent.chat_config?.complexity === 'adaptive') ? '' : 'hidden'}">
            <div class="node-config-header">
              <i class="fas fa-sitemap"></i> Graph Node Configuration
            </div>
            
            <!-- Multi-hop Toggle -->
            <div class="node-config-item">
              <div class="node-config-content">
                <i class="fas fa-route node-config-icon"></i>
                <div class="node-config-text">
                  <div class="node-title">Multi-hop Reasoning</div>
                  <div class="node-description">Follow-up queries for deeper analysis</div>
                </div>
              </div>
              <label class="toggle-switch toggle-switch-sm">
                <input type="checkbox" id="aNodeMultiHop" ${(agent.chat_config?.nodes?.multi_hop !== false) ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <!-- Refinement Toggle -->
            <div class="node-config-item">
              <div class="node-config-content">
                <i class="fas fa-sync-alt node-config-icon"></i>
                <div class="node-config-text">
                  <div class="node-title">Answer Refinement</div>
                  <div class="node-description">Iterative improvement of responses</div>
                </div>
              </div>
              <label class="toggle-switch toggle-switch-sm">
                <input type="checkbox" id="aNodeRefinement" ${(agent.chat_config?.nodes?.refinement !== false) ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <!-- Verification Toggle -->
            <div class="node-config-item">
              <div class="node-config-content">
                <i class="fas fa-check-circle node-config-icon"></i>
                <div class="node-config-text">
                  <div class="node-title">Answer Verification</div>
                  <div class="node-description">Quality assurance and fact validation</div>
                </div>
              </div>
              <label class="toggle-switch toggle-switch-sm">
                <input type="checkbox" id="aNodeVerification" ${(agent.chat_config?.nodes?.verification !== false) ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
        
        ${agent.name ? `
        <!-- Knowledge Sources Section -->
        <h4 class="chat-config-header" style="margin-top: 24px;">
          <i class="fas fa-database"></i> Knowledge Sources
        </h4>
        
        <!-- Knowledge Source Toggles -->
        <div class="chat-config-item">
          <div class="chat-config-content">
            <i class="fas fa-sticky-note chat-config-icon"></i>
            <div class="chat-config-text">
              <div class="chat-config-title">Use Notes</div>
              <div class="chat-config-description">Search your personal notes</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="aUseNotesKS">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <!-- Use Documents Toggle -->
        <div class="chat-config-item">
          <div class="chat-config-content">
            <i class="fas fa-file-pdf chat-config-icon"></i>
            <div class="chat-config-text">
              <div class="chat-config-title">Use Agent Documents</div>
              <div class="chat-config-description">Search uploaded documents</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="aUseDocsKS">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <!-- Use Links Toggle -->
        <div class="chat-config-item">
          <div class="chat-config-content">
            <i class="fas fa-link chat-config-icon"></i>
            <div class="chat-config-text">
              <div class="chat-config-title">Use Links</div>
              <div class="chat-config-description">Search web content from links</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="aUseLinksKS">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <!-- Knowledge Management Blocks -->
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
          <input type="file" id="agentDocFile" multiple style="display: none;">
          <div class="kb-row" id="agentDocDrop">
            <div class="kb-drop-zone" id="agentDocDropZone">
              <i class="fas fa-cloud-upload-alt"></i>
              <p>Drag & drop files here or click upload</p>
            </div>
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
        ` : ''}
        
        <!-- Developer Settings -->
        <h4 class="chat-config-header" style="cursor: pointer; user-select: none; margin-top: 24px;" id="devModeHeader">
          <i class="fas fa-code"></i> Developer Settings
          <i class="fas fa-chevron-down" id="devModeChevron" style="margin-left: auto; font-size: 12px; transition: transform 0.3s;"></i>
        </h4>
        
        <div id="advSettings" style="display:none;">
          <div class="form-field-group">
            <div class="form-field-label">
              <i class="fas fa-sliders-h"></i>
              <span>Agent Type</span>
            </div>
            <select id="aType">
              <option ${( !agent.agent_type || agent.agent_type==='qa') ? 'selected' : ''} value="qa">Q&A</option>
              <option ${(agent.agent_type==='curate') ? 'selected' : ''} value="curate">Curate</option>
              <option ${(agent.agent_type==='task') ? 'selected' : ''} value="task">Task</option>
            </select>
          </div>
          
          <div class="form-field-group">
            <div class="form-field-label">
              <i class="fas fa-filter"></i>
              <span>Mode</span>
            </div>
            <select id="aMode">
              <option ${( !agent.tag_filters || agent.tag_filters.mode==='AND') ? 'selected' : ''}>AND</option>
              <option ${(agent.tag_filters && agent.tag_filters.mode==='OR') ? 'selected' : ''}>OR</option>
            </select>
          </div>
          
          <div class="form-field-group">
            <div class="form-field-label">
              <i class="fas fa-search"></i>
              <span>Strategy</span>
            </div>
            <select id="aStrat">
              <option ${agent.search_strategy==='keyword'?'selected':''}>keyword</option>
              <option ${agent.search_strategy==='semantic'?'selected':''}>semantic</option>
              <option ${(agent.search_strategy==null||agent.search_strategy==='hybrid')?'selected':''}>hybrid</option>
            </select>
          </div>
          
          <div class="row">
            <div class="form-field-group">
              <div class="form-field-label">
                <i class="fas fa-sort-numeric-up"></i>
                <span>Top K</span>
              </div>
              <input id="aTopK" type="number" min="1" max="20" value="${agent.top_k ?? 6}">
            </div>
            <div class="form-field-group">
              <div class="form-field-label">
                <i class="fas fa-cube"></i>
                <span>Chunk Size</span>
              </div>
              <input id="aChunk" type="number" min="200" max="4000" value="${agent.chunk_size ?? 800}">
            </div>
          </div>
          
          <div class="row">
            <div class="form-field-group">
              <div class="form-field-label">
                <i class="fas fa-temperature-high"></i>
                <span>Temperature</span>
              </div>
              <input id="aTemp" type="number" step="0.1" min="0" max="1" value="${agent.temperature ?? 0.2}">
            </div>
            <div class="form-field-group">
              <div class="form-field-label">
                <i class="fas fa-coins"></i>
                <span>Max Tokens</span>
              </div>
              <input id="aMaxTok" type="number" min="128" max="4096" value="${agent.max_tokens ?? 1200}">
            </div>
          </div>
          
          <div class="form-field-group">
            <div class="form-field-label">
              <i class="fas fa-pen-fancy"></i>
              <span>Answer Style</span>
            </div>
            <select id="aStyle">
              <option ${agent.answer_style==='concise'?'selected':''}>concise</option>
              <option ${(agent.answer_style==null||agent.answer_style==='balanced')?'selected':''}>balanced</option>
              <option ${agent.answer_style==='detailed'?'selected':''}>detailed</option>
            </select>
          </div>
          
          <div class="form-field-group">
            <div class="form-field-label">
              <i class="fas fa-file-code"></i>
              <span>Output Format</span>
            </div>
            <select id="aFmt">
              <option ${(agent.output_format==null||agent.output_format==='markdown')?'selected':''}>markdown</option>
              <option ${agent.output_format==='plain'?'selected':''}>plain</option>
              <option ${agent.output_format==='json'?'selected':''}>json</option>
            </select>
          </div>
          
          <!-- Citations Toggle -->
          <div class="chat-config-item">
            <div class="chat-config-content">
              <i class="fas fa-quote-right chat-config-icon"></i>
              <div class="chat-config-text">
                <div class="chat-config-title">Require Citations</div>
                <div class="chat-config-description">Force agent to cite sources</div>
              </div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="aCite" ${agent.required_citations ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div> <!-- Close agent-features-section -->
    `;
      container.appendChild(form);

      section.appendChild(container);

      // Back to grid button
      const backBtn = form.querySelector('#backToGridBtn');
      if (backBtn) {
        backBtn.onclick = (e) => {
          e.preventDefault();
          renderAgentsGrid();
        };
      }

      // Icon picker handler
      const editIconBtn = form.querySelector('#editIconBtn');
      const iconInput = form.querySelector('#aIcon');
      if (editIconBtn && iconInput) {
        editIconBtn.onclick = (e) => {
          e.preventDefault();
          if (!iconInput._iconPicker) {
            attachIconPicker(iconInput, { anchorEl: editIconBtn, onSelect: (emo) => {
              const h = form.querySelector('.agent-title-section h3');
              let ico = h.querySelector('.agent-icon');
              if (!ico) {
                ico = document.createElement('span');
                ico.className = 'agent-icon';
                h.classList.add('has-icon');
                h.insertBefore(ico, h.firstChild);
              }
              ico.textContent = emo;
              iconInput.value = emo;
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
      }

      // Dev Mode collapsible header
      const devModeHeader = form.querySelector('#devModeHeader');
      const devModeChevron = form.querySelector('#devModeChevron');
      const advBox = form.querySelector('#advSettings');
      
      if (devModeHeader && advBox) {
        devModeHeader.addEventListener('click', () => {
          const isOpen = advBox.style.display !== 'none';
          advBox.style.display = isOpen ? 'none' : '';
          if (devModeChevron) {
            devModeChevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
          }
        });
      }

      // Complexity radio button toggle for adaptive node controls
      const complexitySimple = form.querySelector('#aComplexitySimple');
      const complexityAdaptive = form.querySelector('#aComplexityAdaptive');
      const adaptiveNodeControls = form.querySelector('#adaptiveNodeControls');
      
      const toggleAdaptiveControls = () => {
        if (complexityAdaptive && complexityAdaptive.checked) {
          adaptiveNodeControls.classList.remove('hidden');
        } else {
          adaptiveNodeControls.classList.add('hidden');
        }
      };
      
      if (complexitySimple) complexitySimple.addEventListener('change', toggleAdaptiveControls);
      if (complexityAdaptive) complexityAdaptive.addEventListener('change', toggleAdaptiveControls);


      // Save button handler (now in header)
      const saveBtn = document.getElementById('agentSaveBtn');
      if (saveBtn) saveBtn.onclick = async () => {
        // Get selected complexity
        const complexityRadios = document.getElementsByName('aComplexity');
        let selectedComplexity = 'simple';
        for (const radio of complexityRadios) {
          if (radio.checked) {
            selectedComplexity = radio.value;
            break;
          }
        }
        
        // Build chat_config with node settings if adaptive
        const chatConfig = {
          memory: document.getElementById('aMemory').checked,
          web_search: document.getElementById('aWebSearch').checked,
          complexity: selectedComplexity
        };
        
        // Add node configuration if adaptive mode
        if (selectedComplexity === 'adaptive') {
          chatConfig.nodes = {
            multi_hop: document.getElementById('aNodeMultiHop').checked,
            refinement: document.getElementById('aNodeRefinement').checked,
            verification: document.getElementById('aNodeVerification').checked
          };
        }
        
        // Build knowledge configuration
        const knowledgeConfig = {
          use_notes: document.getElementById('aUseNotesKS')?.checked ?? true,
          use_agent_docs: document.getElementById('aUseDocsKS')?.checked ?? true,
          use_links: document.getElementById('aUseLinksKS')?.checked ?? true,
          links: agent.knowledge?.links || []
        };
        
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
          knowledge: knowledgeConfig,
          chat_config: chatConfig
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
        const docListEl = form.querySelector('#agentDocList');
        const linkListEl = form.querySelector('#agentLinkList');
        const dbListEl = form.querySelector('#agentDbList');
        // Init toggles from agent config
        const useNotesKS = form.querySelector('#aUseNotesKS');
        const useDocsKS = form.querySelector('#aUseDocsKS');
        const useLinksKS = form.querySelector('#aUseLinksKS');
        const knowledgeCfg = agent.knowledge || {};
        useNotesKS.checked = (knowledgeCfg.use_notes !== false);
        useDocsKS.checked = (knowledgeCfg.use_agent_docs !== false);
        useLinksKS.checked = (knowledgeCfg.use_links !== false);
        // Initialize tag filter in knowledge section
        initializeTagFilter(agent.tag_filters?.tags || [], 'kTagPills', 'kTagInput', 'kTagSuggestions');
        const setBlockVisibility = () => {
          const docBlock = form.querySelector('#agentDocBlock');
          const linksBlock = form.querySelector('#agentLinksBlock');
          const notesBlock = form.querySelector('#notesFilterBlock');
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
          const input = form.querySelector('#agentLinkUrl');
          const feedback = form.querySelector('#agentLinkFeedback');
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
            const btn = form.querySelector('#agentLinkAdd');
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
            const btn = form.querySelector('#agentLinkAdd');
            if (btn) { btn.innerHTML = '<i class="fas fa-plus"></i> Add'; btn.disabled = false; }
          }
        };
        const linkAddBtn = form.querySelector('#agentLinkAdd');
        if (linkAddBtn) linkAddBtn.onclick = (e) => { e.preventDefault(); addLinkNow(); };
        const linkInput = form.querySelector('#agentLinkUrl');
        if (linkInput) linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLinkNow(); } });

        const uploadsEl = form.querySelector('#agentDocUploads');
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

        // Upload button triggers file input
        const uploadBtn = form.querySelector('#agentDocUpload');
        const fileInput = form.querySelector('#agentDocFile');
        
        if (uploadBtn && fileInput) {
          uploadBtn.onclick = async () => {
            fileInput.click();
          };
          
          fileInput.addEventListener('change', async (e) => {
            if (fileInput.files && fileInput.files.length) {
              addToStage(fileInput.files);
              if (stage.length > 0) {
                await runUploads(stage);
                stage.length = 0;
                renderStage();
              }
              fileInput.value = '';
            }
          });
        }

        // Drag & Drop support
        const dropZone = form.querySelector('#agentDocDrop');
        const docBlock = form.querySelector('#agentDocBlock');
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

        // Link add button handler
        form.querySelector('#agentLinkAdd').onclick = async () => {
          const input = form.querySelector('#agentLinkUrl');
          const url = (input.value || '').trim();
          if (!url) return;
          const btn = form.querySelector('#agentLinkAdd');
          const prev = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
          try { await api.addLink(agent.name, url, true); input.value=''; await loadLinks(); }
          catch { alert('Failed to add link'); }
          finally { btn.innerHTML = prev; btn.disabled = false; }
        };
        form.querySelector('#agentDbAdd').onclick = async () => {
          const nameEl = form.querySelector('#agentDbName');
          const pathEl = form.querySelector('#agentDbPath');
          const qEl = form.querySelector('#agentDbQuery');
          const payload = { name: nameEl.value.trim(), path: pathEl.value.trim(), queries: qEl.value.trim() ? [qEl.value.trim()] : [] };
          if (!payload.name || !payload.path) { alert('Name and path required'); return; }
          const btn = form.querySelector('#agentDbAdd'); const prev = btn.innerHTML; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
          try { await api.addDatabase(agent.name, payload); nameEl.value=''; pathEl.value=''; qEl.value=''; await loadDbs(); }
          catch { alert('Failed to add database'); }
          finally { btn.innerHTML = prev; btn.disabled = false; }
        };
      }
    }

    async function mountAgentsTab() {
      const section = document.getElementById('agentsSection');
      if (!section) return;

      // Show grid view by default
      renderAgentsGrid();
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
        // Open settings modal to agents tab
        if (window.settingsModal && typeof window.settingsModal.open === 'function') {
          window.settingsModal.open('agents');
        }
      },
      openEditModal,
      openRunModal,
      openRunModalByName,
      renderAgentDetails,
      renderAgentsGrid,
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
      
      const pill = createTagPill(tag);
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

  function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
      const start = () => {
        mountAgentsTab();
        resolve(window.agents);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    });
    return initPromise;
  }

  function bootstrap() {
    if (!window.__USE_AGENTS_MODULES__) return;
    init().catch((error) => console.error('[agents] initialization failed', error));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  exports.init = init;

  return exports;

})({});
//# sourceMappingURL=agents.js.map
