/**
 * Task Sidebar Component
 * Handles sidebar navigation with built-in views and tag-based lists
 */

import { TasksAPI, TagsAPI } from './api.js';
import { notify } from './notifications.js';

export class TaskSidebar {
  constructor(controller) {
    this.ctrl = controller;
    this.counts = {};
    this.tagCounts = {};
    this.tagsMetaByName = {};
    
    this.init();
  }

  init() {
    this.createSidebarHTML();
    this.bindEvents();
    this.loadCounts();
    
    // Refresh counts every 30 seconds
    setInterval(() => this.loadCounts(), 30000);
  }

  createSidebarHTML() {
    // Find the designated sidebar container
    const sidebarContainer = document.getElementById('task-sidebar-container');
    if (!sidebarContainer) {
      console.warn('Task sidebar container not found');
      return;
    }

    // Insert sidebar HTML into the container
    sidebarContainer.innerHTML = this.getSidebarHTML();
    
    // Set up toggle functionality
    this.setupToggleBehavior();
  }

  getSidebarHTML() {
    return `
      <nav class="task-sidebar" id="taskSidebar">
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span class="sidebar-section-title">Views</span>
          </div>
          <ul class="sidebar-nav-list">
            <li class="sidebar-nav-item" data-view="today">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-calendar-day sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Today</span>
                <span class="sidebar-nav-count" id="sidebarTodayCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="next7days">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-calendar-week sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Next 7 Days</span>
                <span class="sidebar-nav-count" id="sidebarNext7DaysCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="inbox">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-inbox sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Inbox</span>
                <span class="sidebar-nav-count" id="sidebarInboxCount">0</span>
              </a>
            </li>
            <li class="sidebar-nav-item" data-view="eisenhower">
              <a href="#" class="sidebar-nav-link">
                <i class="fas fa-th sidebar-nav-icon"></i>
                <span class="sidebar-nav-text">Eisenhower Matrix</span>
                <span class="sidebar-nav-count" id="sidebarEisenhowerCount">0</span>
              </a>
            </li>
          </ul>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span class="sidebar-section-title">Lists</span>
            <button class="sidebar-section-action" id="refreshTagsBtn" title="Refresh lists">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
          <ul class="sidebar-nav-list" id="sidebarTagsList">
            <!-- Tag-based lists will be populated here -->
          </ul>
          <div class="sidebar-empty-state" id="sidebarTagsEmpty" style="display: none;">
            <p class="empty-text">No lists yet</p>
            <p class="empty-hint">Add tags to tasks to create lists</p>
          </div>
        </div>
      </nav>
    `;
  }

  setupToggleBehavior() {
    const toggleButton = document.getElementById('openTasksQuick');
    const sidebarContainer = document.getElementById('task-sidebar-container');
    const toggleArrow = toggleButton?.querySelector('.toggle-arrow');
    
    if (!toggleButton || !sidebarContainer) {
      console.warn('Toggle elements not found');
      return;
    }

    // Set up click handler for toggle
    toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleSidebar();
    });

    // Initialize collapsed state
    this.isCollapsed = true;
    this.updateToggleState();
  }

  toggleSidebar() {
    const sidebarContainer = document.getElementById('task-sidebar-container');
    if (!sidebarContainer) return;

    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      sidebarContainer.classList.add('is-hidden');
    } else {
      sidebarContainer.classList.remove('is-hidden');
    }
    
    this.updateToggleState();
  }

  updateToggleState() {
    const toggleArrow = document.querySelector('#openTasksQuick .toggle-arrow');
    if (!toggleArrow) return;

    if (this.isCollapsed) {
      toggleArrow.style.transform = 'rotate(-90deg)';
    } else {
      toggleArrow.style.transform = 'rotate(0deg)';
    }
  }

  bindEvents() {
    const sidebar = document.getElementById('taskSidebar');
    if (!sidebar) return;

    // Handle navigation clicks
    sidebar.addEventListener('click', (e) => {
      const navItem = e.target.closest('.sidebar-nav-item');
      if (!navItem) return;

      e.preventDefault();
      
      // Ensure the main Tasks section is visible in the current tab
      console.debug('Before ensureTasksMainVisible, sidebar exists:', !!document.getElementById('taskSidebar'));
      this.ensureTasksMainVisible();
      console.debug('After ensureTasksMainVisible, sidebar exists:', !!document.getElementById('taskSidebar'));

      const viewId = navItem.dataset.view;
      const tagName = navItem.dataset.tag;
      
      if (viewId) {
        // Built-in view
        if (this.ctrl.viewsRouter) {
          this.ctrl.viewsRouter.switchToView(viewId);
        }
      } else if (tagName) {
        // Tag-based list view
        if (this.ctrl.viewsRouter) {
          this.ctrl.viewsRouter.switchToView(`list:${tagName}`);
        }
      }
    });

    // Refresh tags button
    const refreshBtn = document.getElementById('refreshTagsBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.loadCounts();
      });
    }
  }

  async loadCounts() {
    try {
      const [countsRes, tagsRes] = await Promise.all([
        TasksAPI.counts(),
        TagsAPI.list({ limit: 1000 })
      ]);
      this.counts = countsRes.counts || {};
      const tags = tagsRes.tags || [];
      this.tagsMetaByName = {};
      tags.forEach(t => {
        if (t && t.name) {
          this.tagsMetaByName[t.name] = { id: t.id, icon: t.icon };
        }
      });
      this.updateCountDisplays();
      this.updateTagsList();
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  }

  updateCountDisplays() {
    // Debug: Check if sidebar still exists
    const sidebar = document.getElementById('taskSidebar');
    console.debug('updateCountDisplays - sidebar exists:', !!sidebar);
    
    if (!sidebar) {
      console.warn('Sidebar not found during count update, recreating...');
      this.createSidebarHTML();
      return;
    }
    
    // Update built-in view counts
    const countMap = {
      'sidebarTodayCount': this.counts.today || 0,
      'sidebarNext7DaysCount': this.counts.next_7_days || 0,
      'sidebarInboxCount': this.counts.inbox || 0,
      'sidebarEisenhowerCount': (this.counts.eisenhower?.total) || 0
    };

    Object.entries(countMap).forEach(([elementId, count]) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = count;
        element.style.display = count > 0 ? 'inline' : 'none';
      } else {
        console.warn('Count element not found:', elementId);
      }
    });
  }

  updateTagsList() {
    const tagsList = document.getElementById('sidebarTagsList');
    const tagsEmpty = document.getElementById('sidebarTagsEmpty');
    
    if (!tagsList) return;

    const tags = this.counts.tags || {};
    const tagEntries = Object.entries(tags)
      .filter(([name, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    if (tagEntries.length === 0) {
      tagsList.style.display = 'none';
      if (tagsEmpty) tagsEmpty.style.display = 'block';
      return;
    }

    tagsList.style.display = 'block';
    if (tagsEmpty) tagsEmpty.style.display = 'none';

    tagsList.innerHTML = tagEntries.map(([tagName, count]) => {
      const meta = this.tagsMetaByName[tagName] || {};
  const icon = meta.icon;
  const iconHtml = icon ? `<span class="sidebar-emoji">${icon}</span>` : `<i class="fas fa-tag sidebar-nav-icon"></i>`;
      return `
        <li class="sidebar-nav-item" data-tag="${tagName}">
          <a href="#" class="sidebar-nav-link">
            ${iconHtml}
            <span class="sidebar-nav-text">${tagName}</span>
            <span class="sidebar-nav-count">${count}</span>
          </a>
        </li>
      `;
    }).join('');
  }

  updateActiveView(viewId) {
    // Remove active class from all items
    const sidebar = document.getElementById('taskSidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });

    // Add active class to current view
    let activeItem = null;
    
    if (viewId.startsWith('list:')) {
      const tagName = viewId.substring(5);
      activeItem = sidebar.querySelector(`[data-tag="${tagName}"]`);
    } else {
      activeItem = sidebar.querySelector(`[data-view="${viewId}"]`);
    }

    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  refresh() {
    this.loadCounts();
  }

  // Get sidebar DOM element for external styling/manipulation
  getElement() {
    return document.getElementById('taskSidebar');
  }

  // Show/hide sidebar (for mobile responsive behavior)
  show() {
    const sidebar = this.getElement();
    if (sidebar) sidebar.classList.remove('collapsed');
  }

  hide() {
    const sidebar = this.getElement();
    if (sidebar) sidebar.classList.add('collapsed');
  }

  toggle() {
    const sidebar = this.getElement();
    if (sidebar) {
      if (sidebar.classList.contains('collapsed')) {
        this.show();
      } else {
        this.hide();
      }
    }
  }

  // Make sure Tasks content area is shown (and others hidden)
  ensureTasksMainVisible() {
    try {
      // Don't hide sidebar containers - only main content sections
      const idsToHide = ['notesSection', 'chatSection', 'jobsSection', 'agentsSection', 'tagsSection'];
      const tasksSection = document.getElementById('tasksSection');
      
      if (tasksSection) {
        tasksSection.classList.remove('is-hidden');
      }
      
      idsToHide.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('is-hidden');
      });
      
      // DON'T dispatch tabChanged event as it hides the noteTreeContainer which contains our sidebar
      // Instead, manually update tab UI without hiding our sidebar
      const tasksTabBtn = document.getElementById('tasksTabBtn');
      if (tasksTabBtn) {
        // Remove active from other tabs
        ['notesTabBtn', 'chatTabBtn'].forEach(btnId => {
          const btn = document.getElementById(btnId);
          if (btn) btn.classList.remove('active');
        });
        // Add active to tasks tab
        tasksTabBtn.classList.add('active');
      }
      
      // Debug: check if sidebar is still there
      console.debug('Sidebar after manual tab switch:', document.getElementById('taskSidebar'));
      
    } catch (error) {
      console.warn('Error in ensureTasksMainVisible:', error);
    }
  }
}

export function bootstrapTaskSidebar(controller) {
  if (!controller) return null;
  
  const sidebar = new TaskSidebar(controller);
  controller.sidebar = sidebar;
  
  return sidebar;
}