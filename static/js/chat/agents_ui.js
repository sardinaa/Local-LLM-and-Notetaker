// Agents UI module: adds agent selector to the chat plus menu
import { listAgents } from './api.js';
import { setSelectedAgent, getSelectedAgentLocal, clearSelectedAgent, EVENTS as STATE_EVENTS } from './state.js';
import { emit, EVENTS } from './events.js';

function ensureModalManager() {
  if (!window.modalManager) {
    try { window.modalManager = new ModalManager(); } catch (_) {}
  }
}

function currentIconFor(agent) {
  const overrides = (window.agentIconOverrides || {});
  return (overrides[agent.name]) || agent.icon;
}

function renderAgentButtonSelected(agentBtn, agent) {
  const icon = currentIconFor(agent);
  const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
  agentBtn.innerHTML = `${iconHtml}<span class="btn-text">${agent.name}</span><i class="fas fa-times clear-agent" title="Clear agent selection"></i>`;
  agentBtn.title = `Selected agent: ${agent.name}${agent.description ? ' - ' + agent.description : ''}`;
  agentBtn.classList.add('selected');
  const clearIcon = agentBtn.querySelector('.clear-agent');
  if (clearIcon) {
    clearIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedAgent();
      renderAgentButtonCleared(agentBtn);
      emit(EVENTS.GENERATION_STATE, { chatId: (window.currentChatId || null), generating: false });
      ensureModalManager();
      if (window.modalManager) window.modalManager.showToast({ message: 'Agent selection cleared', type: 'info', duration: 2000 });
    });
  }
}

function renderAgentButtonCleared(agentBtn) {
  agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
  agentBtn.title = 'Select an agent to use in chat';
  agentBtn.classList.remove('selected');
}

function positionSubmenu(submenu, anchorEl) {
  submenu.classList.add('submenu-fixed', 'is-invisible');
  document.body.appendChild(submenu);
  const rect = anchorEl.getBoundingClientRect();
  const submenuHeight = submenu.offsetHeight;
  const submenuWidth = submenu.offsetWidth;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;
  let topPos;
  if (spaceAbove >= submenuHeight) {
    topPos = rect.top - submenuHeight - 5;
  } else if (spaceBelow >= submenuHeight) {
    topPos = rect.bottom + 5;
  } else {
    topPos = spaceAbove > spaceBelow ? Math.max(5, rect.top - submenuHeight) : Math.min(rect.bottom, viewportHeight - submenuHeight - 5);
  }
  const leftPos = Math.max(5, Math.min(rect.left, viewportWidth - submenuWidth - 5));
  submenu.style.top = `${topPos}px`;
  submenu.style.left = `${leftPos}px`;
  submenu.style.zIndex = '1300';
  submenu.classList.remove('is-invisible');
}

function showAgentSubmenu(anchorEl, agents, onSelect) {
  const submenu = document.createElement('div');
  submenu.className = 'agent-submenu note-submenu';
  submenu.innerHTML = `
    <div class="note-search-container">
      <input type="text" class="note-search-input" placeholder="Search agents...">
    </div>
    <div class="notes-list-container">
      <ul class="notes-list">
        ${agents.map(agent => {
          const icon = currentIconFor(agent);
          const iconHtml = icon ? `<span class=\"agent-emoji\">${icon}</span>` : '<i class=\"fas fa-robot\"></i>';
          return `<li class=\"note-item agent-item\" data-agent-name=\"${agent.name}\">${iconHtml}<span title=\"${agent.description || agent.name}\">${agent.name}</span></li>`;
        }).join('')}
      </ul>
      ${agents.length === 0 ? '<div class="no-notes-message">No agents available</div>' : ''}
    </div>
  `;
  positionSubmenu(submenu, anchorEl);

  const searchInput = submenu.querySelector('.note-search-input');
  setTimeout(() => searchInput && searchInput.focus(), 10);
  searchInput && searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    submenu.querySelectorAll('.agent-item').forEach(item => {
      const name = item.querySelector('span').textContent.toLowerCase();
      if (name.includes(term)) {
        item.classList.remove('is-hidden');
      } else {
        item.classList.add('is-hidden');
      }
    });
  });

  const listEl = submenu.querySelector('.notes-list');
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.agent-item');
    if (!li) return;
    const agentName = li.dataset.agentName;
    const agent = agents.find(a => a.name === agentName);
    close();
    onSelect && onSelect(agent);
  });

  function onKey(e) {
    const items = Array.from(submenu.querySelectorAll('.agent-item')).filter(i => !i.classList.contains('is-hidden'));
    const selected = submenu.querySelector('.agent-item.selected');
    let idx = selected ? items.indexOf(selected) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < items.length - 1) { selected && selected.classList.remove('selected'); items[idx + 1].classList.add('selected'); items[idx + 1].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) { selected && selected.classList.remove('selected'); items[idx - 1].classList.add('selected'); items[idx - 1].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = selected || items[0];
      if (target) {
        const agent = agents.find(a => a.name === target.dataset.agentName);
        close();
        onSelect && onSelect(agent);
      }
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  searchInput && searchInput.addEventListener('keydown', onKey);

  function clickOutside(e) { if (!submenu.contains(e.target) && e.target !== anchorEl) close(); }
  function close() {
    document.removeEventListener('mousedown', clickOutside);
    submenu.remove();
  }
  document.addEventListener('mousedown', clickOutside);
  return submenu;
}

function renderOrUpdateAgentPill(container, agent) {
  if (!container) return;
  let pill = container.querySelector('.agent-pill');
  if (!agent) {
    if (pill) pill.remove();
    return;
  }
  const icon = currentIconFor(agent);
  const iconHtml = icon ? `<span class="agent-emoji">${icon}</span>` : '<i class="fas fa-robot"></i>';
  if (!pill) {
    pill = document.createElement('button');
    pill.className = 'agent-pill';
    pill.title = `Selected agent: ${agent.name}`;
    pill.innerHTML = `${iconHtml}<span class="text">${agent.name}</span><span class="x" title="Clear">×</span>`;
    container.appendChild(pill);
  } else {
    pill.title = `Selected agent: ${agent.name}`;
    pill.innerHTML = `${iconHtml}<span class="text">${agent.name}</span><span class="x" title="Clear">×</span>`;
  }
  // Open submenu when clicking the main area of the pill (not the X)
  pill.addEventListener('click', async (e) => {
    if (e.target && (e.target.closest('.x'))) return; // ignore clear click here
    e.stopPropagation();
    try {
      const data = await listAgents();
      const agents = data.agents || [];
      showAgentSubmenu(pill, agents, (next) => {
        if (!next) return;
        setSelectedAgent(next);
        renderOrUpdateAgentPill(container, next);
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: `Agent "${next.name}" selected`, type: 'success', duration: 2000 });
      });
    } catch (err) {
      console.error('Error loading agents:', err);
      ensureModalManager();
      if (window.modalManager) window.modalManager.showToast({ message: 'Failed to load agents. Please try again.', type: 'error', duration: 3000 });
    }
  }, { once: true });
  // Clear selection when clicking X
  const x = pill.querySelector('.x');
  if (x) {
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedAgent();
      renderOrUpdateAgentPill(container, null);
      ensureModalManager();
      if (window.modalManager) window.modalManager.showToast({ message: 'Agent selection cleared', type: 'info', duration: 2000 });
    }, { once: true });
  }
}

export function addAgentSelectorToPlusMenu() {
  const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
  if (!plusMenuContent || document.getElementById('agentSelectorBtn')) return;
  const agentBtn = document.createElement('button');
  agentBtn.id = 'agentSelectorBtn';
  agentBtn.className = 'input-btn agent-selector-btn chat-plus-menu-btn';
  agentBtn.innerHTML = '<i class="fas fa-robot"></i><span class="btn-text">Select Agent</span>';
  agentBtn.title = 'Select an agent to use in chat';
  agentBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      const data = await listAgents();
      const agents = data.agents || [];
      ensureModalManager();
      showAgentSubmenu(agentBtn, agents, (agent) => {
        if (!agent) return;
        setSelectedAgent(agent);
        renderAgentButtonSelected(agentBtn, agent);
        ensureModalManager();
        if (window.modalManager) window.modalManager.showToast({ message: `Agent "${agent.name}" selected`, type: 'success', duration: 2000 });
      });
    } catch (err) {
      console.error('Error loading agents:', err);
      ensureModalManager();
      if (window.modalManager) window.modalManager.showToast({ message: 'Failed to load agents. Please try again.', type: 'error', duration: 3000 });
    }
  };
  plusMenuContent.appendChild(agentBtn);

  // Also render an inline agent pill to the left of the textarea
  const leftBtns = document.querySelector('.input-buttons-left');
  renderOrUpdateAgentPill(leftBtns, (getSelectedAgentLocal && getSelectedAgentLocal()) || null);

  // Live-update icon when agent icon changes in Agents tab
  window.agentIconOverrides = window.agentIconOverrides || {};
  document.addEventListener('agent:icon-updated', (e) => {
    try {
      const detail = e.detail || {};
      if (!detail.name) return;
      window.agentIconOverrides[detail.name] = detail.icon;
      const sel = getSelectedAgentLocal && getSelectedAgentLocal();
      if (sel && sel.name === detail.name) {
        renderAgentButtonSelected(agentBtn, sel);
        const leftBtns = document.querySelector('.input-buttons-left');
        renderOrUpdateAgentPill(leftBtns, sel);
      }
    } catch {}
  });

  // Keep pill in sync when selection changes elsewhere (optional future event)
  document.addEventListener('chat:state-changed', () => {
    const sel = getSelectedAgentLocal && getSelectedAgentLocal();
    const leftBtns = document.querySelector('.input-buttons-left');
    renderOrUpdateAgentPill(leftBtns, sel || null);
  });
}

export default { addAgentSelectorToPlusMenu };
