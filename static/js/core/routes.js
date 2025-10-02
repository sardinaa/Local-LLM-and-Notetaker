(function initRouterConfig(window) {
  if (!window) {
    return;
  }

  const noop = () => {};

  function configureRoutes(router, context = {}) {
    if (!router) {
      console.warn('configureRoutes called without a router instance');
      return;
    }

    const setActiveTabUI = context.setActiveTabUI || window.setActiveTabUI || noop;
    const dispatchTabChanged = context.dispatchTabChanged || function defaultDispatch(tabType, route, meta) {
      const detail = { tabType };
      if (route && route.params) detail.params = route.params;
      if (route) detail.route = route;
      if (meta && meta.source) detail.source = meta.source;
      if (meta && meta.state) detail.state = meta.state;
      document.dispatchEvent(new CustomEvent('tabChanged', { detail }));
    };

    function showSection(section, route, meta = {}) {
      try {
        setActiveTabUI(section, route, meta);
      } catch (error) {
        console.error(`Failed to update UI for section ${section}`, error);
      }
      dispatchTabChanged(section, route, meta);
    }

    function openNoteById(noteId) {
      if (!noteId) return;
      try {
        let noteTitle = 'Note';
        if (window.noteTreeView && typeof window.noteTreeView.findNodeById === 'function') {
          const node = window.noteTreeView.findNodeById(window.noteTreeView.nodes || [], String(noteId));
          if (node && node.name) noteTitle = node.name;
        }
        if (window.tabManager) {
          if (typeof window.tabManager.updateActiveTabContent === 'function') {
            window.tabManager.updateActiveTabContent('note', noteId, noteTitle);
          } else if (typeof window.tabManager.getOrCreateTabForContent === 'function') {
            window.tabManager.getOrCreateTabForContent('note', noteId, noteTitle);
          }
        }
        let selected = false;
        if (window.noteTreeView && typeof window.noteTreeView.selectNode === 'function') {
          selected = Boolean(window.noteTreeView.selectNode(String(noteId)));
        }
        if (!selected && typeof window.loadNoteContent === 'function') {
          window.loadNoteContent(noteId, noteTitle);
        }
        if (!selected) {
          window.__pendingNoteRoute = { id: String(noteId), title: noteTitle };
        } else if (window.__pendingNoteRoute && window.__pendingNoteRoute.id === String(noteId)) {
          delete window.__pendingNoteRoute;
        }
      } catch (error) {
        console.warn('Failed to open note from route', error);
      }
    }

    function openFolder(folderId) {
      if (!folderId) return;
      try {
        if (window.noteTreeView && typeof window.noteTreeView.selectNode === 'function') {
          window.noteTreeView.selectNode(String(folderId));
        }
      } catch (error) {
        console.warn('Failed to open folder from route', error);
      }
    }

    function openChatById(chatId) {
      if (!chatId) return;
      try {
        if (window.tabManager && typeof window.tabManager.getOrCreateTabForContent === 'function') {
          window.tabManager.getOrCreateTabForContent('chat', chatId, 'Chat');
        }
        if (window.chatTreeView && typeof window.chatTreeView.selectNode === 'function') {
          window.chatTreeView.selectNode(String(chatId));
        }
        if (typeof window.loadChatMessages === 'function') {
          window.loadChatMessages(chatId);
        }
      } catch (error) {
        console.warn('Failed to open chat from route', error);
      }
    }

    function showTasksView(route) {
      const params = (route && route.params) || {};
      const desiredView = params.view;
      const controller = window.TasksController;
      if (controller && controller.viewsRouter) {
        const targetView = desiredView || controller.viewsRouter.getCurrentView() || controller.viewsRouter.defaultView;
        controller.viewsRouter.switchToView(targetView || controller.viewsRouter.defaultView, false);
      } else if (window.taskManager && typeof window.taskManager.loadTasks === 'function') {
        window.taskManager.loadTasks();
        if (typeof window.taskManager.loadTaskStats === 'function') {
          window.taskManager.loadTaskStats();
        }
        if (desiredView) {
          window.__pendingTaskRoute = { view: desiredView };
        }
      } else if (desiredView) {
        window.__pendingTaskRoute = { view: desiredView };
      }
    }

    function ensureCalendarReady() {
      if (!window.calendarApp && window.CalendarApp) {
        window.calendarApp = new window.CalendarApp('calendarRoot');
      }
    }

    function ensureShoppingReady() {
      if (window.shoppingListManager && typeof window.shoppingListManager.show === 'function') {
        window.shoppingListManager.show();
      }
    }

    router.registerRoute('notes', (route, meta = {}) => {
      showSection('notes', route, meta);
      if (route.params.note) {
        openNoteById(route.params.note);
      } else if (route.params.folder) {
        openFolder(route.params.folder);
      }
    });

    router.registerRoute('chat', (route, meta = {}) => {
      showSection('chat', route, meta);
      if (route.params.chat) {
        openChatById(route.params.chat);
      }
    });

    router.registerRoute('agents', (route, meta = {}) => {
      showSection('agents', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('agents', null, 'Agents');
      }
    });

    router.registerRoute('tags', (route, meta = {}) => {
      showSection('tags', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('tags', null, 'Tags');
      }
    });

    router.registerRoute('jobs', (route, meta = {}) => {
      showSection('jobs', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('jobs', null, 'Jobs');
      }
      if (window.jobsView && typeof window.jobsView.onShown === 'function') {
        window.jobsView.onShown();
      }
    });

    router.registerRoute('tasks', (route, meta = {}) => {
      showSection('tasks', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('tasks', null, 'Tasks');
      }
      showTasksView(route);
    });

    router.registerRoute('calendar', (route, meta = {}) => {
      showSection('calendar', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('calendar', null, 'Calendar');
      }
      ensureCalendarReady();
    });

    router.registerRoute('shopping', (route, meta = {}) => {
      showSection('shopping', route, meta);
      // Update active tab title
      if (window.tabManager && typeof window.tabManager.updateActiveTabContent === 'function') {
        window.tabManager.updateActiveTabContent('shopping', null, 'Shopping List');
      }
      ensureShoppingReady();
    });

    router.registerRoute('*', (route, meta = {}) => {
      // Fallback to notes for unknown sections
      if (!route || route.section === 'notes') {
        showSection('notes', route, meta);
        return;
      }
      router.navigateTo({ section: 'notes' }, { replace: true, pushHistory: true, source: 'fallback' });
    });
  }

  window.routeConfig = window.routeConfig || {};
  window.routeConfig.configureRoutes = configureRoutes;
})(window);
