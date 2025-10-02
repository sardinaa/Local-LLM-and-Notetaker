/**
 * Task Views Router
 * Handles view switching between Today, Next 7 Days, Inbox, Eisenhower Matrix, and Lists
 */

import { TasksAPI, TagsAPI } from './api.js';
import { notify } from './notifications.js';

export class TaskViewsRouter {
  constructor(controller) {
    this.ctrl = controller;
    this.currentView = null;
    this.currentViewData = null;
    this.router = null;
    
    // Default view
    this.defaultView = 'next7days';
    
    // Available views configuration
    this.views = {
      today: {
        id: 'today',
        title: 'Today',
        icon: 'fas fa-calendar-day',
        fetchData: () => TasksAPI.today(),
        layout: 'grouped'
      },
      next7days: {
        id: 'next7days', 
        title: 'Next 7 Days',
        icon: 'fas fa-calendar-week',
        fetchData: () => TasksAPI.next7Days(),
        layout: 'standard'
      },
      inbox: {
        id: 'inbox',
        title: 'Inbox',
        icon: 'fas fa-inbox',
        fetchData: () => TasksAPI.inbox(),
        layout: 'standard'
      },
      eisenhower: {
        id: 'eisenhower',
        title: 'Eisenhower Matrix',
        icon: 'fas fa-th',
        fetchData: () => TasksAPI.eisenhower(),
        layout: 'matrix'
      }
    };
    
    this.init();
  }

  init() {
    // Load saved view or fetch from router state if available
    const savedView = localStorage.getItem('taskViewActive') || this.defaultView;

    if (window.appRouter instanceof window.AppRouter) {
      this.router = window.appRouter;
    }

    let initialView = savedView;

    if (this.router && typeof this.router.getCurrentRoute === 'function') {
      const currentRoute = this.router.getCurrentRoute();
      if (currentRoute && currentRoute.section === 'tasks') {
        const routeView = currentRoute.params && currentRoute.params.view;
        if (routeView) {
          initialView = routeView;
        } else if (currentRoute.params && !currentRoute.params.view) {
          initialView = this.defaultView;
        }
      }
    }

    if (window.__pendingTaskRoute && window.__pendingTaskRoute.view) {
      initialView = window.__pendingTaskRoute.view;
      delete window.__pendingTaskRoute;
    }

    this.switchToView(initialView, false);
  }

  async switchToView(viewId, pushHistory = true) {
    const targetView = viewId || this.defaultView;

    if (!this.views[targetView] && !targetView.startsWith('list:')) {
      console.warn(`Unknown view: ${targetView}`);
      return;
    }

    if (pushHistory) {
      if (this.router) {
        const params = {};
        if (targetView && targetView !== this.defaultView) {
          params.view = targetView;
        }
        this.router.navigateTo(
          { section: 'tasks', params },
          { state: { taskView: targetView }, source: 'tasks' }
        );
        return;
      }
      if (window.history && typeof window.history.pushState === 'function') {
        const url = new URL(window.location);
        if (targetView && targetView !== this.defaultView) {
          url.searchParams.set('view', targetView);
        } else {
          url.searchParams.delete('view');
        }
        window.history.pushState({ taskView: targetView }, '', url);
      }
    }

    if (targetView.startsWith('list:')) {
      const tagName = targetView.substring(5);
      await this.switchToListView(tagName, false);
      return;
    }

    const view = this.views[targetView];
    if (!view) return;

    try {
      this.showLoadingState();
      const response = await view.fetchData();
      this.currentViewData = response;
      this.currentView = targetView;
      localStorage.setItem('taskViewActive', targetView);

      if (view.layout === 'grouped') {
        this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'today-time' };
        this.ctrl.viewSettings.todayGroups = response.groups || {};
      } else {
        this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'date' };
        if (this.ctrl.viewSettings.todayGroups) delete this.ctrl.viewSettings.todayGroups;
      }

      this.renderView(view, response);
      this.hideLoadingState();
      this.updateSidebarActiveState(targetView);

      if (this.ctrl.sidebar) {
        this.ctrl.sidebar.refresh();
      }

    } catch (error) {
      console.error(`Error loading view ${targetView}:`, error);
      notify(`Error loading ${view.title} view`, 'error');
      this.hideLoadingState();
    }
  }

  async switchToListView(tagName, pushHistory = true) {
    if (pushHistory) {
      if (this.router) {
        const listId = `list:${tagName}`;
        this.router.navigateTo(
          { section: 'tasks', params: { view: listId } },
          { state: { taskView: listId }, source: 'tasks' }
        );
        return;
      }
      if (window.history && typeof window.history.pushState === 'function') {
        const url = new URL(window.location);
        url.searchParams.set('view', `list:${tagName}`);
        window.history.pushState({ taskView: `list:${tagName}` }, '', url);
      }
    }

    try {
      this.showLoadingState();

      // Find tag ID from tag name
      const allTasks = await TasksAPI.list();
      const allTagsMap = {};

      allTasks.tasks?.forEach(task => {
        task.tags?.forEach(tag => {
          const name = typeof tag === 'object' ? tag.name : tag;
          const id = typeof tag === 'object' ? tag.id : tag;
          allTagsMap[name] = id;
        });
      });

      const tagId = allTagsMap[tagName];
      if (!tagId) {
        throw new Error(`Tag "${tagName}" not found`);
      }

      // Fetch tasks for this tag
      const [response, tagMetaRes] = await Promise.all([
        TasksAPI.byTag(tagId),
        TagsAPI.get(tagId).catch(() => ({}))
      ]);
      this.currentViewData = { ...response, __tag: tagMetaRes || {} };

      const listView = {
        id: `list:${tagName}`,
        title: `${tagName}`,
        icon: 'fas fa-tag',
        layout: 'standard',
        isList: true,
        tagId,
        tagName
      };

      this.currentView = listView.id;
      localStorage.setItem('taskViewActive', listView.id);

      // Render the view with auto-tag behavior for quick add
      this.renderView(listView, this.currentViewData, { autoTag: tagName });

      this.hideLoadingState();
      this.updateSidebarActiveState(listView.id);

      if (this.ctrl.sidebar) {
        this.ctrl.sidebar.refresh();
      }

    } catch (error) {
      console.error(`Error loading list view for tag ${tagName}:`, error);
      notify(`Error loading list ${tagName}`, 'error');
      this.hideLoadingState();
    }
  }

  attachRouter(router) {
    if (!router || this.router === router) {
      return;
    }
    if (window.AppRouter && !(router instanceof window.AppRouter)) {
      return;
    }
    this.router = router;

    if (typeof router.getCurrentRoute === 'function') {
      const currentRoute = router.getCurrentRoute();
      if (currentRoute && currentRoute.section === 'tasks') {
        const routeView = currentRoute.params && currentRoute.params.view;
        if (routeView && routeView !== this.currentView) {
          this.switchToView(routeView, false);
        } else if (!routeView && this.currentView !== this.defaultView) {
          this.switchToView(this.defaultView, false);
        }
      }
    }
  }


  renderView(view, data, options = {}) {
    if (view.layout === 'matrix') {
      this.renderMatrixView(view, data);
    } else if (view.layout === 'grouped') {
      this.renderGroupedView(view, data, options);
    } else {
      this.renderStandardView(view, data, options);
    }
  }

  renderStandardView(view, data, options = {}) {
    // Hide Eisenhower matrix if it exists (in case switching from matrix view)
    const matrixContainer = document.getElementById('eisenhowerMatrix');
    if (matrixContainer) {
      matrixContainer.classList.add('is-hidden');
    }
    
    // Show standard task lists
    const dateBuckets = document.getElementById('dateBucketsContainer');
    const dynamicList = document.getElementById('dynamicTaskList');
    if (dateBuckets) dateBuckets.classList.remove('is-hidden');
    if (dynamicList) dynamicList.classList.remove('is-hidden');
    
    // Update tasks in controller for standard list view
    this.ctrl.tasks = data.tasks || [];
    // Reset grouping to date for standard views to prevent leakage from Today view
    this.ctrl.viewSettings = { ...(this.ctrl.viewSettings || {}), groupBy: 'date' };
    if (this.ctrl.viewSettings.todayGroups) delete this.ctrl.viewSettings.todayGroups;
    
    // Set up view-specific quick add behavior
    this.setupQuickAddBehavior(view, options);
    
    // If a tag list, render header + sections; else default render
    if (view.isList) {
      this.renderListHeaderAndSections(view, data, options);
    } else {
      this.ctrl.render();
    }
    
    // Update view title if needed
    this.updateViewTitle(view);
  }

  renderGroupedView(view, data, options = {}) {
    // Hide Eisenhower matrix if it exists
    const matrixContainer = document.getElementById('eisenhowerMatrix');
    if (matrixContainer) {
      matrixContainer.classList.add('is-hidden');
    }
    
    // Show standard task lists
    const dateBuckets = document.getElementById('dateBucketsContainer');
    const dynamicList = document.getElementById('dynamicTaskList');
    if (dateBuckets) dateBuckets.classList.remove('is-hidden');
    if (dynamicList) dynamicList.classList.remove('is-hidden');
    
    // Convert grouped data to flat array and set special grouping mode
    const groups = data.groups || {};
    const allTasks = [];
    
    // Flatten all groups into a single array
    Object.values(groups).forEach(groupTasks => {
      allTasks.push(...groupTasks);
    });
    
    // Update tasks in controller
    this.ctrl.tasks = allTasks;
    
    // Set special view settings for Today grouping
    this.ctrl.viewSettings = {
      groupBy: 'today-time',
      todayGroups: groups  // Pass the original grouped data
    };
    
    // Set up view-specific quick add behavior  
    this.setupQuickAddBehavior(view, options);
    
    // Use existing controller render method
    this.ctrl.render();
    
    // Update view title
    this.updateViewTitle(view);
  }

  renderMatrixView(view, data) {
    console.debug('renderMatrixView called with data:', data);
    
    // Hide standard task lists
    const dateBuckets = document.getElementById('dateBucketsContainer');
    const dynamicList = document.getElementById('dynamicTaskList');
    if (dateBuckets) dateBuckets.classList.add('is-hidden');
    if (dynamicList) dynamicList.classList.add('is-hidden');
    
    // Show/create Eisenhower matrix container
    let matrixContainer = document.getElementById('eisenhowerMatrix');
    if (!matrixContainer) {
      matrixContainer = this.createMatrixContainer();
    }
    
    matrixContainer.classList.remove('is-hidden');
    
    // Render matrix content
    this.renderEisenhowerMatrix(matrixContainer, data.quadrants || {});
    
    // Update view title
    this.updateViewTitle(view);
  }

  createMatrixContainer() {
    const taskCenter = document.querySelector('.task-center');
    if (!taskCenter) return null;
    
    const matrixContainer = document.createElement('div');
    matrixContainer.id = 'eisenhowerMatrix';
    matrixContainer.className = 'eisenhower-matrix';
    
    taskCenter.appendChild(matrixContainer);
    return matrixContainer;
  }

  renderEisenhowerMatrix(container, quadrants) {
    console.debug('renderEisenhowerMatrix called with quadrants:', quadrants);
    
    const quadrantConfig = [
      {
        key: 'urgent_important',
        title: 'Urgent & Important',
        subtitle: 'Do First',
        className: 'q1 urgent important'
      },
      {
        key: 'not_urgent_important', 
        title: 'Not Urgent & Important',
        subtitle: 'Schedule',
        className: 'q2 not-urgent important'
      },
      {
        key: 'urgent_not_important',
        title: 'Urgent & Not Important',
        subtitle: 'Delegate',
        className: 'q3 urgent not-important'
      },
      {
        key: 'not_urgent_not_important',
        title: 'Not Urgent & Not Important',
        subtitle: 'Eliminate',
        className: 'q4 not-urgent not-important'
      }
    ];

    container.innerHTML = `
      <div class="matrix-grid">
        ${quadrantConfig.map(config => {
          const tasks = quadrants[config.key] || [];
          return `
            <div class="matrix-quadrant ${config.className}" data-quadrant="${config.key}">
              <div class="quadrant-header">
                <h3 class="quadrant-title">${config.title}</h3>
                <p class="quadrant-subtitle">${config.subtitle}</p>
                <span class="quadrant-count">${tasks.length}</span>
              </div>
              <div class="quadrant-tasks" data-quadrant="${config.key}">
                ${tasks.map(task => this.renderMatrixTask(task)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Set up drag and drop for matrix
    this.setupMatrixDragDrop(container);
  }

  renderMatrixTask(task) {
    const isCompleted = task.status === 'completed';
    const dueDate = task.due_date ? new Date(task.due_date) : null;
    const timeStr = dueDate ? dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    const priorityClass = task.priority ? `priority-${task.priority.toLowerCase()}` : '';
    
    return `
      <div class="matrix-task-row ${isCompleted ? 'completed' : ''} ${priorityClass}" 
           data-task-id="${task.id}" 
           draggable="true">
        <div class="task-row-toggle-container">
          <input type="checkbox" class="task-row-toggle" ${isCompleted ? 'checked' : ''}>
        </div>
        <div class="task-row-content">
          <span class="task-row-title">${task.title || ''}</span>
          ${timeStr ? `<span class="task-row-time">${timeStr}</span>` : ''}
        </div>
      </div>
    `;
  }

  setupMatrixDragDrop(container) {
    // Handle drag start
    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('matrix-task-row')) {
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
        e.target.classList.add('dragging');
      }
    });

    // Handle drag end
    container.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('matrix-task-row')) {
        e.target.classList.remove('dragging');
      }
    });

    // Handle drop zones
    container.querySelectorAll('.quadrant-tasks').forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) {
          zone.classList.remove('drag-over');
        }
      });

      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        
        const taskId = e.dataTransfer.getData('text/plain');
        const newQuadrant = zone.dataset.quadrant;
        
        await this.moveTaskToQuadrant(taskId, newQuadrant);
      });
    });
  }

  async moveTaskToQuadrant(taskId, quadrant) {
    try {
      const task = this.findTaskById(taskId);
      if (!task) return;

      const updates = this.getUpdatesForQuadrant(quadrant);
      await TasksAPI.update(taskId, updates);
      
      // Refresh the matrix view
      await this.switchToView('eisenhower', false);
      
      notify('Task moved successfully', 'success');
    } catch (error) {
      console.error('Error moving task:', error);
      notify('Error moving task', 'error');
    }
  }

  getUpdatesForQuadrant(quadrant) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (quadrant) {
      case 'urgent_important':
        return {
          priority: 'alta',
          due_date: today.toISOString().split('T')[0]
        };
      case 'not_urgent_important':
        return {
          priority: 'alta',
          due_date: tomorrow.toISOString().split('T')[0]
        };
      case 'urgent_not_important':
        return {
          priority: 'media',
          due_date: today.toISOString().split('T')[0]
        };
      case 'not_urgent_not_important':
        return {
          priority: 'baja',
          due_date: null
        };
      default:
        return {};
    }
  }

  findTaskById(taskId) {
    if (this.currentViewData?.quadrants) {
      // Search in Eisenhower quadrants
      for (const quadrant of Object.values(this.currentViewData.quadrants)) {
        const task = quadrant.find(t => String(t.id) === String(taskId));
        if (task) return task;
      }
    } else if (this.currentViewData?.tasks) {
      // Search in standard task list
      return this.currentViewData.tasks.find(t => String(t.id) === String(taskId));
    }
    return null;
  }

  setupQuickAddBehavior(view, options = {}) {
    // Store current view context for quick add
    this.ctrl.currentViewContext = {
      view: view.id,
      autoTag: options.autoTag
    };
  }

  updateViewTitle(view) {
    // Could update a view title element if it exists
    const titleElement = document.querySelector('.view-title');
    if (titleElement) {
      titleElement.textContent = view.title;
    }
  }

  updateSidebarActiveState(viewId) {
    // Update sidebar if available
    if (this.ctrl.sidebar) {
      this.ctrl.sidebar.updateActiveView(viewId);
    }
  }

  showLoadingState() {
    // Show loading spinner or state
    const taskCenter = document.querySelector('.task-center');
    if (taskCenter) {
      taskCenter.classList.add('loading');
    }
  }

  hideLoadingState() {
    const taskCenter = document.querySelector('.task-center');
    if (taskCenter) {
      taskCenter.classList.remove('loading');
    }
  }

  getCurrentView() {
    return this.currentView;
  }

  getCurrentViewData() {
    return this.currentViewData;
  }

  renderListHeaderAndSections(view, data, options = {}) {
    const taskCenter = document.querySelector('.task-center');
    if (!taskCenter) return;

    // Ensure a dedicated container exists at the top
    let listHeader = document.getElementById('listViewHeader');
    if (!listHeader) {
      listHeader = document.createElement('div');
      listHeader.id = 'listViewHeader';
      listHeader.className = 'list-view-header';
      taskCenter.prepend(listHeader);
    }

    const tagMeta = data.__tag || {};
  const icon = tagMeta.icon || '';
  const title = view.tagName || '';
    const totalCount = (data.tasks || []).filter(t => t.status !== 'completed').length;

    // Header HTML
    listHeader.innerHTML = `
      <div class="list-header-row">
  <button id="listIconBtn" class="list-icon-btn" title="Change icon" aria-label="Change list icon">${icon ? icon : '<i class="fas fa-tag"></i>'}</button>
  <input id="listTitleInput" class="list-title-input" value="${title}" aria-label="List title" />
        <div class="spacer"></div>
        <button id="addSectionBtn" class="btn-secondary" title="Add section">+ Section</button>
        <span class="pill count-pill" id="listTotalCount">${totalCount}</span>
        <input id="iconHiddenInput" type="text" style="position:absolute;left:-20000px;opacity:0;" aria-hidden="true" />
      </div>
    `;

    // Wire icon picker
    const iconBtn = document.getElementById('listIconBtn');
    const hiddenInput = document.getElementById('iconHiddenInput');
    if (iconBtn && hiddenInput && window.attachIconPicker) {
      window.attachIconPicker(hiddenInput, {
        anchorEl: iconBtn,
        onSelect: async (emoji) => {
          try {
            if (emoji === null) {
              await TagsAPI.update(view.tagId, { icon: null });
              iconBtn.innerHTML = '<i class="fas fa-tag"></i>';
            } else {
              await TagsAPI.update(view.tagId, { icon: emoji });
              iconBtn.textContent = emoji;
            }
            if (this.ctrl.sidebar) this.ctrl.sidebar.refresh();
          } catch (e) {
            notify('Failed to update icon', 'error');
          }
        }
      });
      iconBtn.onclick = (e) => {
        e.preventDefault();
        if (hiddenInput._iconPicker?.isOpen()) hiddenInput._iconPicker.hide(); else hiddenInput._iconPicker?.show();
      };
    }

    // Title edit
    const titleInput = document.getElementById('listTitleInput');
    if (titleInput) {
      const commit = async () => {
        try {
          const newTitle = (titleInput.value || '').replace(/^#+\s*/, '').trim();
          if (!newTitle || newTitle === view.tagName) return;
          const res = await TagsAPI.update(view.tagId, { name: newTitle });
          if (res && res.name) {
            view.tagName = res.name;
            titleInput.value = `${res.name}`;
            // Update URL/history to new name
            const url = new URL(window.location);
            url.searchParams.set('view', `list:${res.name}`);
            history.replaceState({ taskView: `list:${res.name}` }, '', url);
            // Refresh sidebar to reflect new name
            if (this.ctrl.sidebar) this.ctrl.sidebar.refresh();
          }
        } catch (_) {
          notify('Failed to rename list', 'error');
          titleInput.value = `${view.tagName}`;
        }
      };
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); titleInput.value = `#${view.tagName}`; titleInput.blur(); }
      });
      titleInput.addEventListener('blur', commit);
    }

    // Render sections below header into dynamic list container
    const listEl = document.getElementById('dynamicTaskList');
    const bucketsEl = document.getElementById('dateBucketsContainer');
    if (!listEl || !bucketsEl) return;
    bucketsEl.classList.add('is-hidden');
    listEl.classList.remove('is-hidden');

  const tasks = (data.tasks || []).slice();
  const sections = Array.isArray(tagMeta.sections) ? tagMeta.sections.slice().sort((a,b) => (a.order ?? 0) - (b.order ?? 0)) : [];
    const openStateKey = `list_sections_open_${view.tagId}`;
    let openState = {};
    try { openState = JSON.parse(localStorage.getItem(openStateKey) || '{}'); } catch {}
  const secById = Object.fromEntries(sections.map(s => [String(s.id), s]));

    const unsectionedTasks = tasks.filter(t => !t.section_id);
    const sectionsHtml = sections.map(sec => {
      const secTasks = tasks.filter(t => t.section_id === sec.id);
      const isOpen = openState[sec.id] ?? sec.isOpen ?? true;
      return `
        <div class="task-bucket" data-section-id="${sec.id}" draggable="true">
          <div class="bucket-header" tabindex="0">
            <div class="bucket-toggle">
              <i class="fas fa-chevron-${isOpen ? 'down' : 'right'} bucket-arrow"></i>
              <span class="bucket-title">${escapeHtml(sec.name || '')}</span>
              <span class="bucket-count">${secTasks.length}</span>
            </div>
          </div>
          <div class="bucket-content ${isOpen ? '' : 'is-hidden'}" data-drop-zone="tasks" data-section-id="${sec.id}">
            ${secTasks.map(renderListTaskRow).join('')}
          </div>
        </div>`;
    }).join('');

    const unsectionedOpen = openState['__unsectioned__'] ?? true;
    const unSectionHtml = `
      <div class="task-bucket" data-section-id="" draggable="false">
        <div class="bucket-header" tabindex="0">
          <div class="bucket-toggle">
            <i class="fas fa-chevron-${unsectionedOpen ? 'down' : 'right'} bucket-arrow"></i>
            <span class="bucket-title">Unsectioned</span>
            <span class="bucket-count">${unsectionedTasks.length}</span>
          </div>
        </div>
        <div class="bucket-content ${unsectionedOpen ? '' : 'is-hidden'}" data-drop-zone="tasks" data-section-id="">
          ${unsectionedTasks.map(renderListTaskRow).join('')}
        </div>
      </div>`;

    listEl.innerHTML = sectionsHtml + unSectionHtml;

    // Helper: start inline rename for a section
    const startRenameSection = (sectionId) => {
      const bucket = listEl.querySelector(`.task-bucket[data-section-id="${CSS.escape(sectionId)}"]`);
      if (!bucket) return;
      const titleSpan = bucket.querySelector('.bucket-title');
      if (!titleSpan) return;
      const current = titleSpan.textContent || '';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'section-title-input';
      input.value = current;
      input.setAttribute('aria-label', 'Section name');
      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      const commit = async () => {
        const newName = (input.value || '').trim();
        const oldName = current.trim();
        if (!newName || newName === oldName) {
          // Restore view without changes
          await this.switchToListView(view.tagName, false);
          return;
        }
        const next = sections.map(s => s.id === sectionId ? { ...s, name: newName } : s);
        try {
          await TagsAPI.update(view.tagId, { sections: next });
          await this.switchToListView(view.tagName, false);
          notify('Section renamed', 'success');
        } catch (_) {
          notify('Failed to rename section', 'error');
          await this.switchToListView(view.tagName, false);
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); this.switchToListView(view.tagName, false); }
      });
      input.addEventListener('blur', commit);
    };

    // Toggle behavior + persist open state
    listEl.querySelectorAll('.task-bucket .bucket-header').forEach(h => {
      h.addEventListener('click', (e) => {
        const header = e.currentTarget;
        const bucket = header.parentElement;
        const content = bucket.querySelector('.bucket-content');
        const arrow = header.querySelector('.bucket-arrow');
        const hidden = content.classList.toggle('is-hidden');
        if (arrow) arrow.className = `fas fa-chevron-${hidden ? 'right' : 'down'} bucket-arrow`;
        const sid = bucket.getAttribute('data-section-id') || '__unsectioned__';
        openState[sid] = !hidden;
        localStorage.setItem(openStateKey, JSON.stringify(openState));
      });

      // Keyboard: F2 to rename
      h.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
          const sid = h.parentElement?.getAttribute('data-section-id');
          if (sid) {
            e.preventDefault();
            startRenameSection(sid);
          }
        }
      });
    });

    // Mouse: double-click title to rename
    listEl.querySelectorAll('.task-bucket[data-section-id] .bucket-title').forEach(el => {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const sid = el.closest('.task-bucket')?.getAttribute('data-section-id');
        if (sid) startRenameSection(sid);
      });
    });

    // Add section inline
    const addBtn = document.getElementById('addSectionBtn');
    if (addBtn) {
      addBtn.onclick = async (e) => {
        e.preventDefault();
        const newId = cryptoRandomId();
        const newSec = { id: newId, name: 'New Section', order: (sections.at(-1)?.order ?? sections.length) + 1, isOpen: true };
        const next = [...sections, newSec];
        try {
          await TagsAPI.update(view.tagId, { sections: next });
          // Mark for rename after re-render
          localStorage.setItem(`list_section_rename_${view.tagId}`, newId);
          await this.switchToListView(view.tagName, false);
          notify('Section added', 'success');
        } catch (_) { notify('Failed to add section', 'error'); }
      };
    }

    // DnD: reorder sections and move tasks between sections
    setupSectionDnD(listEl, sections, async (orderedIds) => {
      const next = orderedIds.map((id, idx) => ({ ...(sections.find(s => s.id === id) || {}), order: idx }));
      try {
        await TagsAPI.update(view.tagId, { sections: next });
        await this.switchToListView(view.tagName, false);
      } catch (_) { notify('Failed to reorder sections', 'error'); }
    });
    setupTaskDropZones(listEl, async (taskId, targetSectionId) => {
      try {
        await TasksAPI.update(taskId, { section_id: targetSectionId || null });
        await this.switchToListView(view.tagName, false);
      } catch (_) { notify('Failed to move task', 'error'); }
    });

    // If a section was just added, auto-open rename
    const pendingRename = localStorage.getItem(`list_section_rename_${view.tagId}`);
    if (pendingRename) {
      localStorage.removeItem(`list_section_rename_${view.tagId}`);
      startRenameSection(pendingRename);
    }
  }
}

function renderListTaskRow(task) {
  const isCompleted = task.status === 'completed';
  return `
    <div class="task-row ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}" draggable="true">
      <div class="task-row-checkbox">
        <input type="checkbox" class="task-row-toggle" ${isCompleted ? 'checked' : ''} aria-label="Mark complete">
      </div>
      <div class="task-row-main">
        <div class="task-row-content">
          <span class="task-row-title ${isCompleted ? 'completed' : ''}">${escapeHtml(task.title || '')}</span>
        </div>
      </div>
    </div>`;
}

function setupSectionDnD(container, sections, onReorder) {
  const getSectionBuckets = () => Array.from(container.querySelectorAll('.task-bucket[data-section-id]'));
  let dragEl = null;
  let dragId = null;

  // Clean up any existing markers first
  container.querySelectorAll('.section-insert-marker').forEach(m => m.remove());

  // Helper: build drop markers between sections (including before first and after last)
  const buildMarkers = () => {
    // Remove old markers in case of re-run
    container.querySelectorAll('.section-insert-marker').forEach(m => m.remove());

    const buckets = getSectionBuckets();
    const unsectioned = container.querySelector('.task-bucket[data-section-id=""]');

    const insertMarkerAt = (index) => {
      const marker = document.createElement('div');
      marker.className = 'section-insert-marker';
      marker.setAttribute('data-insert-index', String(index));

      // Drag events
      marker.addEventListener('dragover', (e) => {
        e.preventDefault();
        marker.classList.add('active');
      });
      marker.addEventListener('dragleave', (e) => {
        if (!marker.contains(e.relatedTarget)) marker.classList.remove('active');
      });
      marker.addEventListener('drop', (e) => {
        e.preventDefault();
        marker.classList.remove('active');
        if (!dragId) return;

        // Compute new order using indices
        const ids = getSectionBuckets().map(x => x.getAttribute('data-section-id')).filter(Boolean);
        const fromIdx = ids.indexOf(dragId);
        let toIdx = Number(marker.getAttribute('data-insert-index'));
        if (fromIdx === -1) return;

        // Adjust target index if removing earlier element affects later index
        if (fromIdx < toIdx) toIdx -= 1;

        // Reorder array
        const moved = ids.splice(fromIdx, 1)[0];
        ids.splice(toIdx, 0, moved);

        if (onReorder) onReorder(ids);
      });

      return marker;
    };

    // Insert marker before each bucket and one at the end
    const parent = container;
    buckets.forEach((b, i) => {
      const marker = insertMarkerAt(i);
      parent.insertBefore(marker, b);
    });

    // Final marker after last reorderable bucket but before unsectioned if present
    const endMarker = insertMarkerAt(buckets.length);
    if (unsectioned) parent.insertBefore(endMarker, unsectioned);
    else parent.appendChild(endMarker);
  };

  buildMarkers();

  // Enable dragging on section buckets
  getSectionBuckets().forEach(b => {
    b.addEventListener('dragstart', (e) => {
      if (e.target === b && b.getAttribute('data-section-id')) {
        dragEl = b;
        dragId = b.getAttribute('data-section-id');
        e.dataTransfer.effectAllowed = 'move';
        b.classList.add('dragging');
      }
    });
    b.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('dragging');
      dragEl = null;
      dragId = null;
      container.querySelectorAll('.section-insert-marker.active').forEach(m => m.classList.remove('active'));
    });

    // Also support dropping on a bucket by deciding before/after based on cursor position
    b.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = b.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      // Highlight nearest marker
      const buckets = getSectionBuckets();
      const idx = buckets.indexOf(b);
      const markerIdx = before ? idx : idx + 1;
      container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.toggle('active', m.getAttribute('data-insert-index') === String(markerIdx)));
    });
    b.addEventListener('dragleave', () => {
      container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.remove('active'));
    });
    b.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId) return;
      const rect = b.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const buckets = getSectionBuckets();
      const ids = buckets.map(x => x.getAttribute('data-section-id')).filter(Boolean);
      const fromIdx = ids.indexOf(dragId);
      let toIdx = buckets.indexOf(b) + (before ? 0 : 1);
      if (fromIdx < toIdx) toIdx -= 1;
      const moved = ids.splice(fromIdx, 1)[0];
      ids.splice(toIdx, 0, moved);
      container.querySelectorAll('.section-insert-marker').forEach((m) => m.classList.remove('active'));
      if (onReorder) onReorder(ids);
    });
  });
}

function setupTaskDropZones(container, onDrop) {
  container.querySelectorAll('.bucket-content[data-drop-zone="tasks"]').forEach(zone => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const taskRow = container.querySelector('.task-row[draggable="true"].dragging');
      let taskId = null;
      if (taskRow) taskId = taskRow.getAttribute('data-task-id');
      if (!taskId && e.dataTransfer) taskId = e.dataTransfer.getData('text/plain');
      const targetSectionId = zone.getAttribute('data-section-id');
      if (taskId && onDrop) await onDrop(taskId, targetSectionId);
    });
  });
  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.task-row[draggable="true"]');
    if (row) { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', row.getAttribute('data-task-id')); }
  });
  container.addEventListener('dragend', (e) => {
    const row = e.target.closest('.task-row[draggable="true"]');
    if (row) row.classList.remove('dragging');
  });
}

function cryptoRandomId() {
  try {
    const a = crypto.getRandomValues(new Uint32Array(4));
    return Array.from(a).map(x => x.toString(16).padStart(8, '0')).join('');
  } catch { return String(Date.now()); }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

export function bootstrapTaskViews(controller) {
  if (!controller) return null;
  
  const viewsRouter = new TaskViewsRouter(controller);
  controller.viewsRouter = viewsRouter;
  
  return viewsRouter;
}