document.addEventListener('DOMContentLoaded', () => {
    console.log('App script loaded');

    // Small helpers for class-based show/hide
    window.ui = window.ui || {};
    window.ui.show = (el) => { if (!el) return; el.classList.remove('is-hidden'); el.style.removeProperty('display'); };
    window.ui.hide = (el) => { if (!el) return; el.classList.add('is-hidden'); };

    window.__initialHomeNavigated = false;
    window.__homeNoteRequestedExplicit = false;
    window.__noteSyncExtras = null;

    let routerInstance = null;
    let routerReady = false;

    function dispatchTabChanged(tabType, route, meta) {
        const detail = { tabType };
        if (route && route.params) detail.params = route.params;
        if (route) detail.route = route;
        if (meta && meta.source) detail.source = meta.source;
        if (meta && meta.state) detail.state = meta.state;
        document.dispatchEvent(new CustomEvent('tabChanged', { detail }));
    }

    window.dispatchTabChanged = dispatchTabChanged;

    function navigateToSection(section, options = {}) {
        const params = options.params || {};
        const route = { section, params };
        const meta = { source: options.source || 'ui' };
        if (options.state) meta.state = options.state;
        if (routerReady && routerInstance) {
            const navOptions = {
                pushHistory: options.pushHistory !== false,
                replace: Boolean(options.replace),
                state: options.state || {},
                source: options.source || 'ui'
            };
            routerInstance.navigateTo(route, navOptions);
            return;
        }
        setActiveTabUI(section, route, meta);
        dispatchTabChanged(section, route, meta);
    }

    window.navigateToSection = navigateToSection;

    function syncRoute(section, params = {}, options = {}) {
        const source = options.source || 'ui';
        const state = options.state;
        const normalizedParams = {};
        Object.keys(params || {}).forEach((key) => {
            const value = params[key];
            if (value !== undefined && value !== null && value !== '') {
                normalizedParams[key] = String(value);
            }
        });
        const router = (window.appRouter instanceof window.AppRouter) ? window.appRouter : null;
        if (router && typeof router.getCurrentRoute === 'function') {
            const current = router.getCurrentRoute();
            if (current && current.section === section) {
                const currentParams = current.params || {};
                let matches = true;
                const keys = Object.keys(normalizedParams);
                for (const key of keys) {
                    if (currentParams[key] !== normalizedParams[key]) {
                        matches = false;
                        break;
                    }
                }
                if (matches && Object.keys(currentParams).length === Object.keys(normalizedParams).length) {
                    return;
                }
            }
        }
        const navOptions = { params: normalizedParams, source };
        if (state !== undefined) {
            navOptions.state = state;
        }
        window.navigateToSection(section, navOptions);
    }

    function setupRouterIntegration() {
        if (!window.AppRouter) {
            console.warn('AppRouter not available; falling back to UI-only navigation');
            return;
        }
        if (window.appRouter instanceof window.AppRouter) {
            routerInstance = window.appRouter;
        } else {
            routerInstance = new window.AppRouter({ defaultSection: 'notes' });
            window.appRouter = routerInstance;
        }

        const context = {
            setActiveTabUI,
            dispatchTabChanged
        };
        if (window.routeConfig && typeof window.routeConfig.configureRoutes === 'function') {
            window.routeConfig.configureRoutes(routerInstance, context);
        } else {
            console.warn('Route configuration not available; router will operate with defaults');
        }
        routerReady = true;
        if (window.TasksController && window.TasksController.viewsRouter && typeof window.TasksController.viewsRouter.attachRouter === 'function') {
            window.TasksController.viewsRouter.attachRouter(routerInstance);
        }
        routerInstance.start();
    }

    // Centralized UI switcher responding to tab changes
    function setActiveTabUI(tabType, route = null, meta = {}) {
        const notesTabBtn = document.getElementById('notesTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        const notesSection = document.getElementById('notesSection');
        const chatSection = document.getElementById('chatSection');
        const jobsSection = document.getElementById('jobsSection');
        const calendarSection = document.getElementById('calendarSection');
        const shoppingSection = document.getElementById('shoppingSection');
        const timeSection = null; // Time view removed
        const tasksSection = document.getElementById('tasksSection');
        const noteTreeContainer = document.getElementById('noteTreeContainer');
        const chatTreeContainer = document.getElementById('chatTreeContainer');
        const notesButtons = document.getElementById('notesButtons');
        const chatButtons = document.getElementById('chatButtons');
        const quickAccessButtons = document.getElementById('quickAccessButtons');

        const origin = (meta && meta.source) || (route && route.params && route.params.via) || null;
        const keepSidebar = origin === 'quick-access' || (meta && meta.state && meta.state.keepSidebar) || (route && route.params && route.params.keepSidebar === '1');

        // Always hide jobs/time sections unless explicitly selected
        window.ui.hide(jobsSection);
        // timeSection removed
        window.ui.hide(tasksSection);
        if (calendarSection) window.ui.hide(calendarSection);
        if (shoppingSection) window.ui.hide(shoppingSection);

        if (tabType === 'notes') {
            notesTabBtn && notesTabBtn.classList.add('active');
            chatTabBtn && chatTabBtn.classList.remove('active');
            window.ui.show(notesSection);
            window.ui.hide(chatSection);
            window.ui.hide(tasksSection);
            if (calendarSection) window.ui.hide(calendarSection);
            if (shoppingSection) window.ui.hide(shoppingSection);
            window.ui.show(noteTreeContainer);
            window.ui.hide(chatTreeContainer);
            notesButtons && notesButtons.classList.remove('is-hidden');
            quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');
            chatButtons && chatButtons.classList.add('is-hidden');
            document.body.classList.remove('chat-mode');
            document.body.classList.add('notes-mode');
        }

        if (tabType === 'chat') {
            chatTabBtn && chatTabBtn.classList.add('active');
            notesTabBtn && notesTabBtn.classList.remove('active');
            window.ui.hide(notesSection);
            window.ui.show(chatSection);
            window.ui.hide(tasksSection);
            if (calendarSection) window.ui.hide(calendarSection);
            if (shoppingSection) window.ui.hide(shoppingSection);
            window.ui.hide(noteTreeContainer);
            window.ui.show(chatTreeContainer);
            notesButtons && notesButtons.classList.add('is-hidden');
            quickAccessButtons && quickAccessButtons.classList.add('is-hidden');
            chatButtons && chatButtons.classList.remove('is-hidden');
            document.body.classList.remove('notes-mode');
            document.body.classList.add('chat-mode');
        }

        if (tabType === 'jobs') {
            if (keepSidebar) {
                window.ui.hide(notesSection);
                window.ui.hide(chatSection);
                window.ui.hide(agentsSection);
                window.ui.show(jobsSection);
                window.ui.hide(tagsSection);
                window.ui.hide(tasksSection);
                if (calendarSection) window.ui.hide(calendarSection);
                if (shoppingSection) window.ui.hide(shoppingSection);
                window.ui.show(noteTreeContainer);
                window.ui.hide(chatTreeContainer);
                window.ui.hide(agentsTreeContainer);
                notesButtons && notesButtons.classList.remove('is-hidden');
                quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');
                chatButtons && chatButtons.classList.add('is-hidden');
                agentsButtons && agentsButtons.classList.add('is-hidden');
                tagsButtons && tagsButtons.classList.add('is-hidden');
                if (window.jobsView && typeof window.jobsView.onShown === 'function') {
                    window.jobsView.onShown();
                }
                document.body.classList.remove('chat-mode', 'jobs-mode', 'tasks-mode');
                document.body.classList.add('notes-mode');
            } else {
                // Hide other main sections, show jobs
                window.ui.hide(notesSection);
                window.ui.hide(chatSection);
                window.ui.hide(agentsSection);
                window.ui.show(jobsSection);
                window.ui.hide(tagsSection);
                window.ui.hide(tasksSection);
                if (calendarSection) window.ui.hide(calendarSection);
                if (shoppingSection) window.ui.hide(shoppingSection);
                window.ui.hide(noteTreeContainer);
                window.ui.hide(chatTreeContainer);
                window.ui.hide(agentsTreeContainer);
                notesButtons && notesButtons.classList.add('is-hidden');
                quickAccessButtons && quickAccessButtons.classList.add('is-hidden');
                chatButtons && chatButtons.classList.add('is-hidden');
                agentsButtons && agentsButtons.classList.add('is-hidden');
                tagsButtons && tagsButtons.classList.add('is-hidden');
                if (window.jobsView && typeof window.jobsView.onShown === 'function') {
                    window.jobsView.onShown();
                }
                // Update body mode classes
                document.body.classList.remove('notes-mode', 'chat-mode', 'tasks-mode');
                document.body.classList.add('jobs-mode');
            }
        }

    // time tab removed

        if (tabType === 'tasks') {
            // Hide other main sections, show tasks
            window.ui.hide(notesSection);
            window.ui.hide(chatSection);
            window.ui.hide(agentsSection);
            window.ui.hide(tagsSection);
            window.ui.hide(jobsSection);
            // timeSection removed
            if (calendarSection) window.ui.hide(calendarSection);
            if (shoppingSection) window.ui.hide(shoppingSection);
            window.ui.show(tasksSection);
            window.ui.show(noteTreeContainer);
            window.ui.hide(chatTreeContainer);
            window.ui.hide(agentsTreeContainer);
            notesButtons && notesButtons.classList.remove('is-hidden');
            quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');
            chatButtons && chatButtons.classList.add('is-hidden');
            agentsButtons && agentsButtons.classList.add('is-hidden');
            tagsButtons && tagsButtons.classList.add('is-hidden');
            // Only reload tasks if not coming from the tasks router itself (avoid circular loop)
            const isFromTasksRouter = origin === 'tasks' || origin === 'tasks-view';
            if (!isFromTasksRouter && window.TasksController && typeof window.TasksController.reloadTasks === 'function') {
                window.TasksController.reloadTasks();
            } else if (!isFromTasksRouter && window.taskManager && typeof window.taskManager.loadTasks === 'function') {
                window.taskManager.loadTasks();
                if (typeof window.taskManager.loadTaskStats === 'function') window.taskManager.loadTaskStats();
            }
            // Ensure any jobs overlays are closed
            try { document.querySelectorAll('.jobs-popover').forEach(p => p.remove()); } catch (_) {}
            if (window.jobsView && window.jobsView.$bulkMenu) {
                window.jobsView.$bulkMenu.classList.add('is-hidden');
            }
            // Update body mode classes
            document.body.classList.remove('notes-mode', 'chat-mode', 'jobs-mode');
            document.body.classList.add('tasks-mode');
        }

        if (tabType === 'calendar') {
            if (keepSidebar) {
                window.ui.hide(notesSection);
                window.ui.hide(chatSection);
                window.ui.hide(agentsSection);
                window.ui.hide(tagsSection);
                window.ui.hide(jobsSection);
                window.ui.hide(tasksSection);
                window.ui.show(calendarSection);
                window.ui.show(noteTreeContainer);
                window.ui.hide(chatTreeContainer);
                window.ui.hide(agentsTreeContainer);
                notesButtons && notesButtons.classList.remove('is-hidden');
                quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');
                chatButtons && chatButtons.classList.add('is-hidden');
                agentsButtons && agentsButtons.classList.add('is-hidden');
                tagsButtons && tagsButtons.classList.add('is-hidden');
                document.body.classList.remove('chat-mode', 'jobs-mode', 'tasks-mode', 'calendar-mode');
                document.body.classList.add('notes-mode');
                if (!window.calendarApp && window.CalendarApp) {
                    window.calendarApp = new window.CalendarApp('calendarRoot');
                }
            } else {
                // Hide other main sections, show calendar
                window.ui.hide(notesSection);
                window.ui.hide(chatSection);
                window.ui.hide(agentsSection);
                window.ui.hide(tagsSection);
                window.ui.hide(jobsSection);
                window.ui.hide(tasksSection);
                window.ui.show(calendarSection);
                window.ui.hide(noteTreeContainer);
                window.ui.hide(chatTreeContainer);
                window.ui.hide(agentsTreeContainer);
                notesButtons && notesButtons.classList.add('is-hidden');
                quickAccessButtons && quickAccessButtons.classList.add('is-hidden');
                chatButtons && chatButtons.classList.add('is-hidden');
                agentsButtons && agentsButtons.classList.add('is-hidden');
                tagsButtons && tagsButtons.classList.add('is-hidden');
                document.body.classList.remove('notes-mode', 'chat-mode', 'jobs-mode', 'tasks-mode');
                document.body.classList.add('calendar-mode');
                if (!window.calendarApp && window.CalendarApp) {
                    window.calendarApp = new window.CalendarApp('calendarRoot');
                }
            }
        }

        if (tabType === 'shopping') {
            window.ui.hide(notesSection);
            window.ui.hide(chatSection);
            window.ui.hide(agentsSection);
            window.ui.hide(tagsSection);
            window.ui.hide(jobsSection);
            window.ui.hide(tasksSection);
            if (calendarSection) window.ui.hide(calendarSection);
            if (shoppingSection) {
                window.ui.show(shoppingSection);
                if (window.shoppingListManager && typeof window.shoppingListManager.show === 'function') {
                    window.shoppingListManager.show();
                }
            }
            window.ui.show(noteTreeContainer);
            window.ui.hide(chatTreeContainer);
            window.ui.hide(agentsTreeContainer);
            notesButtons && notesButtons.classList.remove('is-hidden');
            quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');
            chatButtons && chatButtons.classList.add('is-hidden');
            agentsButtons && agentsButtons.classList.add('is-hidden');
            tagsButtons && tagsButtons.classList.add('is-hidden');
            document.body.classList.remove('chat-mode', 'jobs-mode', 'tasks-mode');
            document.body.classList.add('notes-mode');
        }

        // tags tab removed
    }
    
    window.setActiveTabUI = setActiveTabUI;

    // Set initial body class based on which tab is active by default
    // Notes tab is active by default in HTML
    document.body.classList.add('notes-mode');
    
    // Initialize global modal manager if not already available
    if (!window.modalManager) {
        window.modalManager = new ModalManager();
        console.log('Global modal manager initialized');
    }
    
    try {
    // Get separate tree container elements for notes, chat
        const noteTreeRoot = document.getElementById('note-tree');
        const chatTreeRoot = document.getElementById('chat-tree');
        const agentsTreeRoot = document.getElementById('agents-tree');
        if (!noteTreeRoot || !chatTreeRoot) throw new Error('Tree elements not found');
        
        // Initialize separate TreeView instances
        const noteTreeView = new TreeView(noteTreeRoot);
        const chatTreeView = new TreeView(chatTreeRoot);
        // Agents tree is a simple list; reuse TreeView in generic mode
        const agentsTreeView = agentsTreeRoot ? new TreeView(agentsTreeRoot) : null;
        
        
        // Make tree views available globally for tab manager
        window.noteTreeView = noteTreeView;
        window.chatTreeView = chatTreeView;
        window.agentsTreeView = agentsTreeView;
        
        console.log('All TreeView instances initialized');
        
        // Initialize drag and drop functionality for all tree views
        const noteDragDrop = new DragDrop(noteTreeView);
        const chatDragDrop = new DragDrop(chatTreeView);
        
        
        console.log('Drag and drop functionality initialized for all tree views');
        
    // Initialize the editor for notes
        window.editorInstance = new NoteEditor('editorjs');
        console.log('Editor initialized');
        // Mount Tag UI: inline row + submenu popover
        if (window.tagSystem) {
            window.tagSystem.mountInline('noteTagsInline');
            window.tagSystem.mountMenu('noteTagsMenu');
        }
        
        // Wait for editor to be ready before loading data
        let editorWaitCount = 0;
        const waitForEditor = setInterval(() => {
            editorWaitCount++;
            if (window.editorInstance && window.editorInstance.isReady) {
                clearInterval(waitForEditor);
                console.log('Editor is ready, loading data from backend');
                loadFromBackend();
            } else if (editorWaitCount > 100) { // 10 seconds timeout
                clearInterval(waitForEditor);
                console.warn('Editor took too long to initialize, loading data anyway');
                loadFromBackend();
            }
        }, 100);
        
        // Initialize OCR and other features
        if (window.initializeOcr) {
            window.initializeOcr(noteTreeView, window.editorInstance);
            console.log('OCR functionality initialized for notes');
        }
        
        // Initialize location suggestions for input fields
        if (window.LocationSuggestions) {
            window.locationSuggestions = new window.LocationSuggestions();
            
            // Attach to dashboard location input
            const jobsLocationInput = document.getElementById('jobsLocation');
            if (jobsLocationInput) {
                window.locationSuggestions.attachToInput(jobsLocationInput);
            }
            
            // Attach to manual search location input  
            const manualSearchLocationInput = document.getElementById('manualSearchLocation');
            if (manualSearchLocationInput) {
                window.locationSuggestions.attachToInput(manualSearchLocationInput);
            }
            
            // Attach to job scraper location input
            const scraperLocationsInput = document.getElementById('scraperLocations');
            if (scraperLocationsInput) {
                window.locationSuggestions.attachToInput(scraperLocationsInput);
            }
            
            console.log('Location suggestions initialized for all input fields');
        }
        
        
        
        // Setup tab switching logic
    const notesTabBtn = document.getElementById('notesTabBtn');
    const chatTabBtn = document.getElementById('chatTabBtn');
    const tasksTabBtn = document.getElementById('tasksTabBtn');
    const calendarTabBtn = document.getElementById('calendarTabBtn');

    notesTabBtn.addEventListener('click', () => {
        window.navigateToSection('notes', { source: 'tab-bar' });
    });
    
    chatTabBtn.addEventListener('click', () => {
        window.navigateToSection('chat', { source: 'tab-bar' });
    });

    if (tasksTabBtn) {
            tasksTabBtn.addEventListener('click', () => {
                window.navigateToSection('tasks', { source: 'tab-bar' });
            });
        }

        if (calendarTabBtn) {
            calendarTabBtn.addEventListener('click', () => {
                window.navigateToSection('calendar', { source: 'tab-bar' });
            });
        }

    // Quick access: Home/Jobs/Calendar/Shopping in notes sidebar
    const quickHomeBtn = document.getElementById('openHomeQuick');
    const quickJobsBtn = document.getElementById('openJobsQuick');
    const quickTasksBtn = document.getElementById('openTasksQuick');
    const quickCalendarBtn = document.getElementById('openCalendarQuick');
    const quickShoppingBtn = document.getElementById('openShoppingQuick');

        function findHomeNoteNode() {
            const tree = window.noteTreeView;
            if (!tree || !Array.isArray(tree.nodes)) {
                return null;
            }

            const idFromGlobal = window.__homeNoteId ? String(window.__homeNoteId) : null;
            if (idFromGlobal) {
                try {
                    const existing = tree.findNodeById(tree.nodes || [], idFromGlobal);
                    if (existing) return existing;
                } catch (_) {}
            }

            const queue = Array.isArray(tree.nodes) ? [...tree.nodes] : [];
            let nameMatch = null;
            let fallback = null;

            while (queue.length) {
                const node = queue.shift();
                if (!node) continue;
                if (Array.isArray(node.children) && node.children.length) {
                    queue.push(...node.children);
                }
                if ((node.type || '').toLowerCase() !== 'note') continue;
                if (!fallback) fallback = node;
                const meta = node.metadata || node.customization || {};
                if (meta && (meta.isHome || meta.is_home || meta.isWelcome || meta.is_welcome)) {
                    return node;
                }
                const name = (node.name || '').toLowerCase();
                if (!nameMatch && name.includes('welcome')) {
                    nameMatch = node;
                }
            }

            return nameMatch || fallback;
        }

        function openNoteInCurrentView(noteId, noteTitle, options = {}) {
            if (!noteId) return;
            window.__initialHomeNavigated = true;
            const idStr = String(noteId);
            const title = noteTitle || 'Note';

            if (window.tabManager) {
                if (typeof window.tabManager.updateActiveTabContent === 'function') {
                    window.tabManager.updateActiveTabContent('note', idStr, title);
                } else if (typeof window.tabManager.getOrCreateTabForContent === 'function') {
                    window.tabManager.getOrCreateTabForContent('note', idStr, title);
                }
            }

            let selectedNode = null;
            if (window.noteTreeView && typeof window.noteTreeView.selectNode === 'function') {
                selectedNode = window.noteTreeView.selectNode(idStr);
            }

            if (typeof window.loadNoteContent === 'function') {
                window.__noteSyncExtras = {
                    source: options.source || 'ui'
                };
                if (options.keepSidebar) {
                    window.__noteSyncExtras.state = { keepSidebar: true };
                } else if (options.state) {
                    window.__noteSyncExtras.state = options.state;
                }
                const loadTitle = selectedNode && selectedNode.name ? selectedNode.name : title;
                window.loadNoteContent(idStr, loadTitle);
            } else {
                const routeOptions = {
                    source: options.source || 'ui'
                };
                if (options.keepSidebar) {
                    routeOptions.state = { keepSidebar: true };
                } else if (options.state) {
                    routeOptions.state = options.state;
                }
                syncRoute('notes', { note: idStr }, routeOptions);
                window.__noteSyncExtras = null;
            }

            if (!selectedNode) {
                window.__pendingNoteRoute = { id: idStr, title };
            } else if (window.__pendingNoteRoute && window.__pendingNoteRoute.id === idStr) {
                delete window.__pendingNoteRoute;
            }
        }

        function showQuickView(type) {
            // Keep sidebar visible, display jobs/time in the main content area
            const notesSection = document.getElementById('notesSection');
            const chatSection = document.getElementById('chatSection');
            const agentsSection = document.getElementById('agentsSection');
            const tagsSection = document.getElementById('tagsSection');
            const jobsSection = document.getElementById('jobsSection');
            const timeSection = null;
            const tasksSection = document.getElementById('tasksSection');
            const calendarSection = document.getElementById('calendarSection');
            const shoppingSection = document.getElementById('shoppingSection');
            const noteTreeContainer = document.getElementById('noteTreeContainer');
            const chatTreeContainer = document.getElementById('chatTreeContainer');
            const agentsTreeContainer = document.getElementById('agentsTreeContainer');
            const notesButtons = document.getElementById('notesButtons');
            const chatButtons = document.getElementById('chatButtons');
            const agentsButtons = document.getElementById('agentsButtons');
            const tagsButtons = document.getElementById('tagsButtons');
            const quickAccessButtons = document.getElementById('quickAccessButtons');

            // Hide other main sections to reset state
            window.ui.hide(chatSection);
            window.ui.hide(agentsSection);
            window.ui.hide(tagsSection);
            window.ui.hide(tasksSection);
            window.ui.hide(jobsSection);
            if (calendarSection) window.ui.hide(calendarSection);
            if (shoppingSection) window.ui.hide(shoppingSection);
            // timeSection removed

            // Hide notes editor area but keep sidebar; simplest is to hide the entire notesSection
            window.ui.hide(notesSection);

            // Show requested view
            if (type === 'jobs') {
                window.ui.show(jobsSection);
                // timeSection removed
                window.ui.hide(tasksSection);
                if (window.jobsView && typeof window.jobsView.onShown === 'function') {
                    window.jobsView.onShown();
                }
            } else if (type === 'tasks') {
                // Hide jobs aggressively before showing tasks
                window.ui.hide(jobsSection);
                window.ui.show(tasksSection);
                window.ui.hide(jobsSection);
                // timeSection removed
                if (window.TasksController && typeof window.TasksController.reloadTasks === 'function') {
                    window.TasksController.reloadTasks();
                } else if (window.taskManager && typeof window.taskManager.loadTasks === 'function') {
                    window.taskManager.loadTasks();
                    if (typeof window.taskManager.loadTaskStats === 'function') window.taskManager.loadTaskStats();
                }
                // Close any floating jobs UI
                try { document.querySelectorAll('.jobs-popover').forEach(p => p.remove()); } catch (_) {}
                if (window.jobsView && window.jobsView.$bulkMenu) {
                    window.jobsView.$bulkMenu.classList.add('is-hidden');
                }
            } else if (type === 'calendar') {
                window.ui.hide(jobsSection);
                window.ui.hide(tasksSection);
                if (calendarSection) window.ui.show(calendarSection);
                if (!window.calendarApp && window.CalendarApp) {
                    window.calendarApp = new window.CalendarApp('calendarRoot');
                }
            } else if (type === 'shopping') {
                window.ui.hide(jobsSection);
                window.ui.hide(tasksSection);
                if (calendarSection) window.ui.hide(calendarSection);
                if (shoppingSection) {
                    window.ui.show(shoppingSection);
                    if (window.shoppingListManager) {
                        window.shoppingListManager.show();
                    }
                }
            }

            // Ensure notes sidebar remains visible
            window.ui.show(noteTreeContainer);
            window.ui.hide(chatTreeContainer);
            window.ui.hide(agentsTreeContainer);
            notesButtons && notesButtons.classList.remove('is-hidden');
            chatButtons && chatButtons.classList.add('is-hidden');
            agentsButtons && agentsButtons.classList.add('is-hidden');
            tagsButtons && tagsButtons.classList.add('is-hidden');
            quickAccessButtons && quickAccessButtons.classList.remove('is-hidden');

            // Keep body mode coherent
            document.body.classList.remove('chat-mode', 'jobs-mode', 'tasks-mode');
            if (type === 'tasks') {
                document.body.classList.add('tasks-mode');
            } else {
                document.body.classList.add('notes-mode');
            }
        }

        function bindQuickAccess(btn, type, title) {
            if (!btn) return;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const openInNew = e.ctrlKey || e.metaKey; // Ctrl (Win/Linux) or Cmd (macOS)
                if (openInNew && window.tabManager) {
                    window.tabManager.createNewTab(type, title);
                } else if (routerReady && typeof window.navigateToSection === 'function') {
                    const navOptions = { source: 'quick-access' };
                    if (type === 'jobs' || type === 'calendar') {
                        navOptions.state = { keepSidebar: true };
                    }
                    window.navigateToSection(type, navOptions);
                } else {
                    // Router not ready; fall back to legacy quick view behavior
                    showQuickView(type);
                }
            });
        }
        if (quickHomeBtn) {
            quickHomeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const homeNode = findHomeNoteNode();
                if (homeNode) {
                    window.__homeNoteId = homeNode.id;
                    window.__initialHomeNavigated = true;
                    window.__homeNoteRequestedExplicit = false;
                    openNoteInCurrentView(homeNode.id, homeNode.name || 'Welcome Note', { source: 'quick-access', keepSidebar: true });
                } else {
                    window.__homeNoteRequestedExplicit = true;
                    if (typeof window.navigateToSection === 'function') {
                        window.navigateToSection('notes', { source: 'quick-access', state: { keepSidebar: true } });
                    } else {
                        setActiveTabUI('notes', null, { source: 'quick-access', state: { keepSidebar: true } });
                    }
                }
            });
        }

    bindQuickAccess(quickJobsBtn, 'jobs', 'Jobs');
    // Note: openTasksQuick is now handled as a toggle by TaskSidebar
    // bindQuickAccess(quickTasksBtn, 'tasks', 'Tasks');
    bindQuickAccess(quickCalendarBtn, 'calendar', 'Calendar');
    bindQuickAccess(quickShoppingBtn, 'shopping', 'Shopping List');

        // Respond to tab changes fired by tabs.js and others
        document.addEventListener('tabChanged', (e) => {
            const detail = (e && e.detail) ? e.detail : null;
            const tabType = detail && detail.tabType;
            if (!tabType) return;
            const route = detail && detail.route ? detail.route : null;
            const meta = { source: detail && detail.source ? detail.source : undefined };
            if (detail && detail.state) meta.state = detail.state;
            setActiveTabUI(tabType, route, meta);
        });
        
        // Helper: debounce function (unchanged)
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Set autosave for note editor (only for notes)
        window.editorInstance.setOnChangeCallback(debounce(async () => {
            const noteId = window.editorInstance.currentNoteId;
            if (!noteId) return;
            try {
                const noteContent = await window.editorInstance.getData();
                const noteNode = noteTreeView.findNodeById(noteTreeView.nodes, noteId);
                if (noteNode) {
                    // Don't update the node with content - save content separately
                    noteNode.content = noteContent; // Update local cache only
                    
                    // Save to backend using the notes API endpoint
                    saveToBackend(noteId, noteNode.name, noteContent);
                    console.log('Auto-saved note:', noteNode.name);
                }

            } catch (error) {
                console.error('Error auto-saving note:', error);
            }
        }, 1000)); // 1-second debounce
        
        // Form elements for creation - Notes form
        const createForm = document.getElementById('createForm');
        const createNameInput = document.getElementById('createNameInput');
        const createType = document.getElementById('createType');
        const confirmCreate = document.getElementById('confirmCreate');
        const cancelCreate = document.getElementById('cancelCreate');
        
        // Form elements for creation - Chat form
        const createFormChat = document.getElementById('createFormChat');
        const createNameInputChat = document.getElementById('createNameInputChat');
        const createTypeChat = document.getElementById('createTypeChat');
        const confirmCreateChat = document.getElementById('confirmCreateChat');
        const cancelCreateChat = document.getElementById('cancelCreateChat');
        
        // Check if at least one set of form elements exists
        const hasNotesForm = createForm && createNameInput && createType && confirmCreate && cancelCreate;
        const hasChatForm = createFormChat && createNameInputChat && createTypeChat && confirmCreateChat && cancelCreateChat;
        
        if (!hasNotesForm && !hasChatForm) {
            throw new Error('No form elements found');
        }
        
        // Set up event listeners for create buttons in notes tab
        const createFolder = document.getElementById('createFolder');
        const createNote = document.getElementById('createNote');
        if (!createFolder || !createNote) throw new Error('Note create buttons not found');
        
        createFolder.onclick = () => { showCreateForm('folder', 'note'); };
        createNote.onclick = () => { 
            // Show template selector directly with blank note option
            if (window.templateManager) {
                window.templateManager.showTemplateSelector((templateId, templateContent, noteName) => {
                    // Create note with template or blank
                    createNoteWithTemplateAndName(templateId, templateContent, noteName);
                });
            } else {
                // Fallback to regular note creation
                showCreateForm('note', 'note'); 
            }
        };
        
        // Set up event listeners for create buttons in chat tab
        const createFolderChat = document.getElementById('createFolderChat');
        const createChat = document.getElementById('createChat');
        if (!createFolderChat || !createChat) throw new Error('Chat create buttons not found');
        
        createFolderChat.onclick = () => { showCreateForm('folder', 'chat'); };
        createChat.onclick = () => { createNewChatDirectly(); };
        
        

        // Agents: bind create button to open agent modal from agents.js if available
        const createAgentBtn = document.getElementById('createAgent');
        if (createAgentBtn) {
            createAgentBtn.onclick = () => {
                if (window.agents && typeof window.agents.openCreateModal === 'function') {
                    window.agents.openCreateModal();
                }
            };
        }

        // Tags: bind sidebar buttons
        const refreshTagsBtn = document.getElementById('refreshTags');
        const exportTagsBtn = document.getElementById('exportTags');
        const importTagsBtn = document.getElementById('importTags');
        
        if (refreshTagsBtn) {
            refreshTagsBtn.onclick = () => {
                if (window.tagsManager && typeof window.tagsManager.loadTags === 'function') {
                    window.tagsManager.loadTags().then(() => {
                        window.tagsManager.renderInterface();
                        if (window.tagsManager.showNotification) {
                            window.tagsManager.showNotification('Tags refreshed successfully', 'success');
                        }
                    }).catch(err => {
                        console.error('Error refreshing tags:', err);
                        if (window.tagsManager.showNotification) {
                            window.tagsManager.showNotification('Failed to refresh tags', 'error');
                        }
                    });
                }
            };
        }
        
        if (exportTagsBtn) {
            exportTagsBtn.onclick = () => {
                if (window.tagsManager && typeof window.tagsManager.exportTags === 'function') {
                    window.tagsManager.exportTags();
                }
            };
        }
        
        if (importTagsBtn) {
            importTagsBtn.onclick = () => {
                if (window.tagsManager && typeof window.tagsManager.importTags === 'function') {
                    window.tagsManager.importTags();
                }
            };
        }
        
        // Notes form event listeners
        if (hasNotesForm) {
            confirmCreate.onclick = () => { handleCreateSubmission('note'); };
            cancelCreate.onclick = () => {
                createNameInput.value = '';
                if (window.ui && typeof window.ui.hide === 'function') {
                    window.ui.hide(createForm);
                } else {
                    createForm.classList.add('is-hidden');
                    createForm.style.removeProperty('display');
                }
            };
            createNameInput.onkeypress = (e) => { if (e.key === 'Enter') handleCreateSubmission('note'); };
        }
        
        // Chat form event listeners
        if (hasChatForm) {
            confirmCreateChat.onclick = () => { handleCreateSubmission('chat'); };
            cancelCreateChat.onclick = () => {
                createNameInputChat.value = '';
                if (window.ui && typeof window.ui.hide === 'function') {
                    window.ui.hide(createFormChat);
                } else {
                    createFormChat.classList.add('is-hidden');
                    createFormChat.style.removeProperty('display');
                }
            };
            createNameInputChat.onkeypress = (e) => { if (e.key === 'Enter') handleCreateSubmission('chat'); };
        }
        
        // showCreateForm accepts a mode parameter to determine which tab we're in
        function showCreateForm(type, mode = 'note') {
            let formToShow, inputToFocus, typeField;
            
            if (mode === 'chat' && hasChatForm) {
                formToShow = createFormChat;
                inputToFocus = createNameInputChat;
                typeField = createTypeChat;
            } else if (mode === 'note' && hasNotesForm) {
                formToShow = createForm;
                inputToFocus = createNameInput;
                typeField = createType;
            } else {
                console.error(`No form available for mode: ${mode}`);
                return;
            }
            
            typeField.value = type;
            // Use unified UI helpers so .is-hidden is respected
            if (window.ui && typeof window.ui.show === 'function') {
                window.ui.show(formToShow);
            } else {
                formToShow.classList.remove('is-hidden');
                formToShow.style.display = 'block';
            }
            inputToFocus.placeholder = `Enter ${type} name...`;
            // Store the current mode as a data attribute
            formToShow.dataset.mode = mode;
            setTimeout(() => { inputToFocus.focus(); }, 100);

            // Ensure search is closed when form opens (notes only)
            try {
                if (mode === 'note' && window.noteTreeView && window.noteTreeView.isSearchActive) {
                    window.noteTreeView.toggleSearch();
                }
                // Ensure edit mode is turned off when form opens (notes only)
                if (mode === 'note' && window.noteTreeView && window.noteTreeView.isEditMode) {
                    window.noteTreeView.toggleEditMode();
                }
            } catch (_) {}
        }
        
    // handleCreateSubmission for notes and chat
        async function handleCreateSubmission(formMode) {
            let name, type, mode, formToHide, inputToClear;
            
            if (formMode === 'chat' && hasChatForm) {
                name = createNameInputChat.value.trim();
                type = createTypeChat.value;
                mode = createFormChat.dataset.mode || 'chat';
                formToHide = createFormChat;
                inputToClear = createNameInputChat;
            } else if (formMode === 'note' && hasNotesForm) {
                name = createNameInput.value.trim();
                type = createType.value;
                mode = createForm.dataset.mode || 'note';
                formToHide = createForm;
                inputToClear = createNameInput;
            } else {
                console.error(`Invalid form mode: ${formMode}`);
                return;
            }
            
            if (name) {
                // Determine current tree based on mode
                let currentTree;
                if (mode === 'note') currentTree = noteTreeView;
                else if (mode === 'chat') currentTree = chatTreeView;
                else currentTree = noteTreeView; // Default fallback
                
                // For hierarchical creation, use selected node if it is a folder
                const selectedId = currentTree.selectedNode;
                const parentNode = selectedId ? currentTree.findNodeById(currentTree.nodes, selectedId) : null;
                const parentId = parentNode && parentNode.type === 'folder' ? selectedId : null;
                
                try {
                    const nodeData = {
                        name: name,
                        type: type
                    };
                    
                    // Set appropriate content based on type
                    if (type === 'note') {
                        nodeData.content = { blocks: [] };
                    } else if (type === 'chat') {
                        nodeData.content = { messages: [] };
                    
                    }
                    
                    const newNodeId = await currentTree.addNode(nodeData, parentId);
                    console.log(`New ${type} created with ID:`, newNodeId);
                    
                    // Handle specific behavior based on mode
                    if (mode === 'note' && type === 'note') {
                        // Handle note creation - use the nodeData instead of trying to find the node
                        const titleDisplay = document.getElementById('note-title-display');
                        if (titleDisplay) {
                            titleDisplay.textContent = name;
                        }
                        
                        // Check if we have template content to apply
                        const templateContentData = formToHide.dataset.templateContent;
                        let templateContent = null;
                        if (templateContentData) {
                            try {
                                templateContent = JSON.parse(templateContentData);
                                // Clear the stored template content
                                delete formToHide.dataset.templateContent;
                            } catch (error) {
                                console.error('Error parsing template content:', error);
                            }
                        }
                        
                        // Update the active tab if available
                        if (window.tabManager) {
                            window.tabManager.updateActiveTabContent('note', newNodeId, name);
                            // Apply template content after tab is active
                            if (templateContent && window.editorInstance) {
                                setTimeout(async () => {
                                    try {
                                        await window.editorInstance.render(templateContent);
                                        window.editorInstance.setCurrentNote(newNodeId);
                                    } catch (error) {
                                        console.error('Error applying template content:', error);
                                    }
                                }, 100);
                            }
                        } else if (window.editorInstance) {
                            // Fall back to old behavior - initialize with template content or empty
                            try {
                                const contentToRender = templateContent || { blocks: [] };
                                await window.editorInstance.render(contentToRender);
                                window.editorInstance.setCurrentNote(newNodeId);
                                if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                                    window.tagSystem.loadForNote(newNodeId);
                                }
                            } catch (error) {
                                console.error('Error initializing new note editor:', error);
                            }
                        }
                    } else if (mode === 'chat' && type === 'chat') {
                        // Handle chat creation - use name from form instead of trying to find node
                        
                        // Update the active tab if available
                        if (window.tabManager) {
                            window.tabManager.updateActiveTabContent('chat', newNodeId, name);
                        } else if (window.loadChatMessages) {
                            window.loadChatMessages(newNodeId);
                        }
                    }
                    
                    // No need to save to backend here since addNode already handles it
                    
                } catch (error) {
                    console.error('Error creating new node:', error);
                }
            }
            inputToClear.value = '';
            if (window.ui && typeof window.ui.hide === 'function') {
                window.ui.hide(formToHide);
            } else {
                formToHide.classList.add('is-hidden');
                formToHide.style.removeProperty('display');
            }
        }
        
        // Function to create a new chat directly without name input
        async function createNewChatDirectly() {
            try {
                // Generate a unique ID for the new chat (same format as controller.js)
                const newChatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const defaultName = 'New Chat';
                
                // Create the chat node with explicit ID
                const nodeData = {
                    id: newChatId,  // Pass the generated ID
                    name: defaultName,
                    type: 'chat',
                    content: { messages: [] }
                };
                
                // Add the chat to the tree (it will use the provided ID)
                const newNodeId = await chatTreeView.addNode(nodeData, null);
                console.log('New chat created with ID:', newNodeId);
                
                // Switch to chat tab and open the new chat
                if (window.tabManager) {
                    window.tabManager.getOrCreateTabForContent('chat', newNodeId, defaultName);
                } else if (window.loadChatMessages) {
                    window.loadChatMessages(newNodeId);
                }
                
                // Switch to chat tab
                const chatTabBtn = document.getElementById('chatTabBtn');
                if (chatTabBtn && !chatTabBtn.classList.contains('active')) {
                    chatTabBtn.click();
                }
                
                // Focus the chat input
                setTimeout(() => {
                    const chatInput = document.getElementById('chatInput');
                    if (chatInput) {
                        chatInput.focus();
                    }
                }, 100);
                
            } catch (error) {
                console.error('Error creating new chat:', error);
                alert('Failed to create new chat. Please try again.');
            }
        }
        
        // Function to create a new note with a template and custom name
        async function createNoteWithTemplateAndName(templateId, templateContent, noteName) {
            try {
                // Use the provided name or fall back to template name
                let finalNoteName = noteName;
                if (!finalNoteName && templateId && window.templateManager && window.templateManager.templates) {
                    const template = window.templateManager.templates.find(t => t.id === templateId);
                    if (template) {
                        finalNoteName = template.name;
                    }
                }
                if (!finalNoteName) {
                    finalNoteName = 'New Note';
                }
                
                // Determine current tree based on mode
                const mode = 'note';
                const type = 'note';
                let currentTree = noteTreeView;
                
                // For hierarchical creation, use selected node if it is a folder
                const selectedId = currentTree.selectedNode;
                const parentNode = selectedId ? currentTree.findNodeById(currentTree.nodes, selectedId) : null;
                const parentId = parentNode && parentNode.type === 'folder' ? selectedId : null;
                
                const nodeData = {
                    name: finalNoteName,
                    type: type,
                    content: templateContent || { blocks: [] }
                };
                
                const newNodeId = await currentTree.addNode(nodeData, parentId);
                console.log(`New ${type} created with ID:`, newNodeId);
                
                // Handle note display
                const titleDisplay = document.getElementById('note-title-display');
                if (titleDisplay) {
                    titleDisplay.textContent = finalNoteName;
                }
                
                // Update the active tab if available and render content
                if (window.tabManager) {
                    window.tabManager.updateActiveTabContent('note', newNodeId, finalNoteName);
                    // Apply template content after tab is active
                    if (templateContent && window.editorInstance) {
                        setTimeout(async () => {
                            try {
                                await window.editorInstance.render(templateContent);
                                window.editorInstance.setCurrentNote(newNodeId);
                            } catch (error) {
                                console.error('Error applying template content:', error);
                            }
                        }, 100);
                    }
                } else if (window.editorInstance) {
                    // Fall back to old behavior - initialize with template content or empty
                    try {
                        const contentToRender = templateContent || { blocks: [] };
                        await window.editorInstance.render(contentToRender);
                        window.editorInstance.setCurrentNote(newNodeId);
                        if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                            window.tagSystem.loadForNote(newNodeId);
                        }
                    } catch (error) {
                        console.error('Error initializing new note editor:', error);
                    }
                }
                
            } catch (error) {
                console.error('Error creating note with template:', error);
                alert('Failed to create note. Please try again.');
            }
        }
        
        // Function to create a new note with a template
        async function createNoteWithTemplate(templateId, templateContent) {
            try {
                // Get template name for the note title
                let templateName = 'New Note';
                if (window.templateManager && window.templateManager.templates) {
                    const template = window.templateManager.templates.find(t => t.id === templateId);
                    if (template) {
                        templateName = template.name;
                    }
                }
                
                // Show create form with template name as default
                showCreateForm('note', 'note');
                createNameInput.value = templateName;
                createNameInput.select(); // Select the text so user can easily change it
                
                // Store the template content to apply after note creation
                createForm.dataset.templateContent = JSON.stringify(templateContent);
                
            } catch (error) {
                console.error('Error preparing note with template:', error);
                alert('Failed to create note from template. Please try again.');
            }
        }
        
        // Enhanced saveTreeToBackend with better error logging
        async function saveTreeToBackend(treeData, endpoint) {
            try {
                console.log(`Saving to ${endpoint}:`, JSON.stringify(treeData));
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(treeData)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to save to ${endpoint}:`, response.status, errorText);
                } else {
                    console.log(`Successfully saved to ${endpoint}`);
                }
            } catch (error) {
                console.error(`Error saving to ${endpoint}:`, error);
            }
        }
        
        async function saveToBackend(noteId, title, content) {
            // Show saving notification
            if (window.modalManager && window.modalManager.showToast) {
                window.modalManager.showToast({
                    message: 'Saving note...',
                    type: 'progress',
                    icon: 'save',
                    duration: 2000
                });
            }

            try {
                const response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: noteId, title, content })
                });
                
                if (response.ok) {
                    console.log('Note saved successfully!');
                    // Show success notification
                    if (window.modalManager && window.modalManager.showToast) {
                        window.modalManager.showToast({
                            message: 'Note saved successfully',
                            type: 'success',
                            duration: 2000
                        });
                    }
                } else {
                    console.error('Failed to save note:', await response.text());
                    // Show error notification
                    if (window.modalManager && window.modalManager.showToast) {
                        window.modalManager.showToast({
                            message: 'Failed to save note',
                            type: 'error',
                            duration: 3000
                        });
                    }
                }
            } catch (error) {
                console.error('Error saving note:', error);
                // Show error notification
                if (window.modalManager && window.modalManager.showToast) {
                    window.modalManager.showToast({
                        message: 'Error saving note',
                        type: 'error',
                        duration: 3000
                    });
                }
            }
        }
        
        // Function to reload chat tree data (for refreshing after updates)
        async function loadChatTree() {
            try {
                console.log("Reloading chat tree data...");
                const chatRes = await fetch('/api/tree');
                if (chatRes.ok) {
                    const treeData = await chatRes.json();
                    
                    // Extract chat nodes and folders that contain chats (preserving folder structure)
                    const filterChatsAndFolders = (nodes) => {
                        const filtered = [];
                        for (const node of nodes) {
                            if (node.type === 'chat') {
                                // Include chat nodes directly
                                filtered.push({ ...node });
                            } else if (node.type === 'folder' && node.children && node.children.length > 0) {
                                // For folders, recursively check if they contain chats
                                const filteredChildren = filterChatsAndFolders(node.children);
                                if (filteredChildren.length > 0) {
                                    // Only include the folder if it contains chats
                                    const filteredNode = { ...node };
                                    filteredNode.children = filteredChildren;
                                    filtered.push(filteredNode);
                                }
                            }
                        }
                        return filtered;
                    };
                    
                    let chatNodes = [];
                    if (treeData && Array.isArray(treeData)) {
                        chatNodes = filterChatsAndFolders(treeData);
                    }
                    
                    console.log("Reloaded chat nodes:", chatNodes);
                    if (chatTreeView) {
                        chatTreeView.load(chatNodes);
                        console.log("Chat tree reloaded with nodes:", chatTreeView.nodes.length);
                    }
                } else {
                    console.error("Failed to reload chats data:", chatRes.status);
                }
            } catch (error) {
                console.error("Error reloading chats data:", error);
            }
        }
        
        // Make loadChatTree available globally for use by chat.js
        window.loadChatTree = loadChatTree;
        
        // Load trees from backend
    async function loadFromBackend() {
            try {
                // Load notes tree
                const noteRes = await fetch('/api/tree');
                if (noteRes.ok) {
                    const treeData = await noteRes.json(); // Parse as JSON instead of text
                    console.log("Loaded tree data for notes:", treeData);
                    
                    // Extract only note and folder nodes from the tree (exclude chats)
                    const filterNotesAndFolders = (nodes) => {
                        const filtered = [];
                        for (const node of nodes) {
                            // Only include notes and folders, exclude chats
                            if (node.type === 'note' || node.type === 'folder') {
                                const filteredNode = { ...node };
                                if (node.children && node.children.length > 0) {
                                    filteredNode.children = filterNotesAndFolders(node.children);
                                }
                                filtered.push(filteredNode);
                            }
                        }
                        return filtered;
                    };
                    
                    let notesData = [];
                    if (treeData && Array.isArray(treeData)) {
                        notesData = filterNotesAndFolders(treeData);
                    }
                    
                    console.log("Filtered notes data:", notesData);
                    if (notesData.length > 0) {
                        noteTreeView.load(notesData);
                        if (window.__pendingNoteRoute && window.__pendingNoteRoute.id) {
                            const pendingId = window.__pendingNoteRoute.id;
                            const pendingTitle = window.__pendingNoteRoute.title || 'Note';
                            try {
                                const pendingNode = noteTreeView.findNodeById(noteTreeView.nodes || [], pendingId);
                                if (pendingNode) {
                                    noteTreeView.selectNode(pendingId);
                                    if (typeof window.loadNoteContent === 'function') {
                                        window.loadNoteContent(pendingId, pendingNode.name || pendingTitle);
                                    }
                                    delete window.__pendingNoteRoute;
                                }
                            } catch (err) {
                                console.warn('Failed to resolve pending note route:', err);
                            }
                        }
                        const homeNodeLoaded = findHomeNoteNode();
                        if (homeNodeLoaded) {
                            window.__homeNoteId = homeNodeLoaded.id;
                            if (!window.__initialHomeNavigated) {
                                window.__initialHomeNavigated = true;
                                openNoteInCurrentView(homeNodeLoaded.id, homeNodeLoaded.name || 'Welcome Note', { source: 'initial-load', keepSidebar: true });
                            } else if (window.__homeNoteRequestedExplicit) {
                                window.__homeNoteRequestedExplicit = false;
                                openNoteInCurrentView(homeNodeLoaded.id, homeNodeLoaded.name || 'Welcome Note', { source: 'quick-access', keepSidebar: true });
                            }
                        } else if (!window.__initialHomeNavigated) {
                            window.__homeNoteRequestedExplicit = true;
                        }
                        // After loading notes, handle deep link if present
                        handleDeepLink();
                    } else {
                        console.log("Empty notes data, creating sample tree");
                        createSampleNoteTree();
                    }
                } else {
                    console.error("Failed to load notes data:", noteRes.status);
                    if (window.modalManager && window.modalManager.showToast) {
                        window.modalManager.showToast({
                            message: 'Failed to load notes data',
                            type: 'error',
                            duration: 3000
                        });
                    }
                    createSampleNoteTree();
                }
            } catch (error) {
                console.error("Error loading notes data:", error);
                if (window.modalManager && window.modalManager.showToast) {
                    window.modalManager.showToast({
                        message: 'Error loading notes data',
                        type: 'error',
                        duration: 3000
                    });
                }
                createSampleNoteTree();
            }
            
            // Use the new loadChatTree function
            await window.loadChatTree();
            // Load agents into agents tree
            await loadAgentsTree();
            

        // Load agents list into the agents tree and bind selection behavior
        async function loadAgentsTree() {
            try {
                if (agentsTreeView && window.fetch) {
                    const res = await fetch('/api/agents');
                    if (res.ok) {
                        const data = await res.json();
                        const agents = (data && data.agents) || [];
                        const nodes = agents.map(a => ({
                            id: `agent:${a.name}`,
                            name: a.name,
                            type: 'note',
                            children: [],
                            customIcon: a.icon || null
                        }));
                        agentsTreeView.load(nodes);
                        // Set up selection to render details panel
                        const root = document.getElementById('agents-tree');
                        if (root && !root.dataset.handlersBound) {
                            root.addEventListener('nodeSelected', async (e) => {
                                const nodeName = (e.detail && e.detail.nodeName) || '';
                                try {
                                    const all = await (await fetch('/api/agents')).json();
                                    const ag = (all.agents || []).find(x => x.name === nodeName);
                                    if (ag && window.agents && typeof window.agents.renderAgentDetails === 'function') {
                                        // Open settings modal to agents tab
                                        if (window.settingsModal && typeof window.settingsModal.open === 'function') {
                                            window.settingsModal.open('agents');
                                        }
                                        window.agents.renderAgentDetails(ag);
                                    }
                                } catch (err) {
                                    console.warn('Failed to render agent details:', err);
                                }
                            });
                            root.dataset.handlersBound = '1';
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to load agents tree:', e);
            }
        }
        // Expose for other modules
        window.loadAgentsTree = loadAgentsTree;

        // Refresh agents tree on custom event
        document.addEventListener('agents:refresh-tree', () => {
            loadAgentsTree();
        });
            
        }

        // Deep-link handling for opening notes via URL hash (e.g., #note:note-id)
        function handleDeepLink() {
            try {
                const hash = (window.location.hash || '').trim();
                if (!hash) return;
                const m = hash.match(/^#note[:=](.+)$/i);
                if (!m) return;
                const noteId = decodeURIComponent(m[1]);
                if (!window.noteTreeView) return;
                const nodeData = window.noteTreeView.findNodeById(window.noteTreeView.nodes, noteId);
                if (!nodeData || nodeData.type !== 'note') return;
                // Select and dispatch so app loads content
                window.noteTreeView.selectNode(noteId);
                const evt = new CustomEvent('nodeSelected', {
                    detail: { nodeId: noteId, nodeType: nodeData.type, nodeName: nodeData.name }
                });
                document.getElementById('note-tree')?.dispatchEvent(evt);
                // Switch to notes tab if available
                if (window.tabManager && typeof window.tabManager.showNotesTab === 'function') {
                    window.tabManager.showNotesTab();
                }
            } catch (e) {
                console.warn('Deep link handling failed:', e);
            }
        }
        window.addEventListener('hashchange', handleDeepLink);
        
        function createSampleNoteTree() {
            const rootFolderId = noteTreeView.addNode({ name: 'My Notes', type: 'folder' });
            const welcomeId = noteTreeView.addNode({ 
                name: 'Welcome Note', 
                type: 'note',
                content: { blocks: [
                    { type: 'header', data: { text: 'Welcome to Notes Web App', level: 2 } },
                    { type: 'paragraph', data: { text: 'This is a simple web app for taking notes.' } }
                ] }
            }, rootFolderId);
            window.__homeNoteId = welcomeId;
            window.__homeNoteRequestedExplicit = false;
            if (!window.__initialHomeNavigated) {
                window.__initialHomeNavigated = true;
                openNoteInCurrentView(welcomeId, 'Welcome Note', { source: 'initial-load', keepSidebar: true });
            }
        }
        
        // loadFromBackend() is now called after editor is ready (see above)
        
        // Note header customization remains unchanged
        function setupNoteCustomizer() {
            const noteCustomizer = document.getElementById('noteCustomizer');
            if (!noteCustomizer) return;
            noteCustomizer.addEventListener('click', () => {
                const noteHeader = document.querySelector('.note-header');
                const currentColor = window.getComputedStyle(noteHeader).backgroundColor || '#ecf0f1';
                const bgImage = noteHeader.style.backgroundImage;
                let imageUrl = null;
                if (bgImage && bgImage !== 'none') {
                    imageUrl = bgImage.replace(/url\((['"])?(.*?)\1\)/, '$2');
                }
                const modalManager = new ModalManager();
                modalManager.openBackgroundEditor(
                    { currentColor, imageUrl },
                    (result) => {
                        if (result.color) noteHeader.style.backgroundColor = result.color;
                        if (result.gridSelection && imageUrl) {
                            noteHeader.style.backgroundImage = `url(${imageUrl})`;
                        } else if (!result.gridSelection) {
                            noteHeader.style.backgroundImage = '';
                        }
                        const noteId = window.editorInstance.currentNoteId;
                        if (noteId) {
                            // Persist to backend via node update API
                            const tree = window.noteTreeView;
                            const base = (tree && tree.findNodeById(tree.nodes, noteId) && tree.findNodeById(tree.nodes, noteId).customization) || {};
                            const customization = { ...base };
                            if (Object.prototype.hasOwnProperty.call(result, 'color')) {
                                customization.backgroundColor = result.color || null;
                            }
                            if (Object.prototype.hasOwnProperty.call(result, 'gridSelection')) {
                                customization.backgroundImage = result.gridSelection ? (imageUrl || null) : null;
                            }
                            if (tree && typeof tree.updateNodeInBackend === 'function') {
                                tree.updateNodeInBackend(noteId, { customization })
                                  .then(() => {
                                      const node = tree.findNodeById(tree.nodes, noteId);
                                      if (node) {
                                          node.customization = { ...(node.customization || {}), ...customization };
                                          tree.render();
                                      }
                                  })
                                  .catch(() => {});
                            }
                        }
                    },
                    () => {}
                );
            });
        }
        setupNoteCustomizer();

        // Add icon picker to Notes header and sync with sidebar tree
        function setupNoteIconPicker() {
            try {
                const headerMain = document.querySelector('#notesSection .note-header .note-header-main');
                const titleEl = document.getElementById('note-title-display');
                if (!headerMain || !titleEl) return;
                // Create a horizontal row for icon + title if not present
                let titleRow = headerMain.querySelector('.note-title-row');
                if (!titleRow) {
                    titleRow = document.createElement('div');
                    titleRow.className = 'note-title-row';
                    // Insert as first child and move title into it
                    headerMain.insertBefore(titleRow, headerMain.firstChild);
                    if (titleEl.parentElement !== titleRow) {
                        titleRow.appendChild(titleEl);
                    }
                }
                // Avoid duplicate button
                if (document.getElementById('noteIconBtn')) return;

                const btn = document.createElement('button');
                btn.id = 'noteIconBtn';
                btn.className = 'list-icon-btn';
                btn.title = 'Change note icon';
                btn.setAttribute('aria-label', 'Change note icon');
                btn.style.marginRight = '8px';
                btn.innerHTML = '<i class="fas fa-file-alt"></i>';

                // Place button before title inside the title row
                titleRow.insertBefore(btn, titleEl);

                // Hidden input for icon picker hook
                const hidden = document.createElement('input');
                hidden.type = 'text';
                hidden.id = 'noteIconHiddenInput';
                hidden.style.position = 'absolute';
                hidden.style.left = '-20000px';
                hidden.style.opacity = '0';
                hidden.setAttribute('aria-hidden', 'true');
                headerMain.appendChild(hidden);

                // Attach icon picker
                if (window.attachIconPicker) {
                    window.attachIconPicker(hidden, {
                        anchorEl: btn,
                        onSelect: async (emoji) => {
                            try {
                                const tree = window.noteTreeView;
                                const noteId = window.editorInstance && window.editorInstance.currentNoteId;
                                if (!tree || !noteId) return;
                                // Update backend node
                                await tree.updateNodeInBackend(noteId, { customization: { customIcon: emoji || null } });
                                // Update local tree node and UI
                                const node = tree.findNodeById(tree.nodes, noteId);
                                if (node) {
                                    node.customIcon = emoji || null;
                                    node.customization = { ...(node.customization || {}), customIcon: emoji || null };
                                    tree.render();
                                }
                                // Update header button icon
                                if (emoji === null) btn.innerHTML = '<i class="fas fa-file-alt"></i>';
                                else btn.textContent = emoji;
                            } catch (err) {
                                console.warn('Failed to update note icon', err);
                            }
                        }
                    });
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const picker = hidden._iconPicker;
                        if (picker) {
                            if (picker.isOpen()) picker.hide(); else picker.show();
                        }
                    });
                }

                // Reflect current icon when note changes
                document.getElementById('note-tree')?.addEventListener('nodeSelected', (e) => {
                    const { nodeId, nodeType } = e.detail || {};
                    if (nodeType !== 'note') return;
                    try {
                        const tree = window.noteTreeView;
                        const node = tree ? tree.findNodeById(tree.nodes, nodeId) : null;
                        const ico = (node && node.customIcon) ? node.customIcon : null;
                        if (ico) btn.textContent = ico; else btn.innerHTML = '<i class="fas fa-file-alt"></i>';
                    } catch (_) {}
                });
            } catch (e) {
                console.warn('Note icon picker setup failed', e);
            }
        }
        setupNoteIconPicker();
        
        
        
        // Setup note selection handler
        if (noteTreeRoot) {
            noteTreeRoot.addEventListener('nodeSelected', async (e) => {
                const { nodeId, nodeType, nodeName } = e.detail;
                
                if (nodeType === 'note') {
                    // Load note content from backend
                    await loadNoteContent(nodeId, nodeName);
                    
                    // Update the active tab content instead of creating a new tab
                    if (window.tabManager) {
                        window.tabManager.updateActiveTabContent('note', nodeId, nodeName);
                    }
                }
            });
        }
        
        // Setup chat selection handler
        if (chatTreeRoot) {
            chatTreeRoot.addEventListener('nodeSelected', async (e) => {
                const { nodeId, nodeType, nodeName } = e.detail;
                
                if (nodeType === 'chat') {
                    // Load chat content from backend - this will call syncRoute which triggers
                    // the route handler, which then calls tabManager.getOrCreateTabForContent.
                    // DO NOT call updateActiveTabContent here as it would cause a duplicate load.
                    await loadChatContent(nodeId, nodeName);
                }
            });
        }
        
        // Load note content from backend
        async function loadNoteContent(nodeId, title) {
            try {
                // Set loading flag to prevent OCR tools from triggering during load
                window.isLoadingNote = true;
                
                // Check if editor is available
                if (!window.editorInstance) {
                    console.warn('Editor instance not available, skipping content load');
                    return;
                }
                
                const response = await fetch(`/api/notes/${nodeId}`);
                if (response.ok) {
                    const noteData = await response.json();
                    console.log('Loaded note data:', noteData);
                    
                    // Update editor with note content using the new async render method
                    await window.editorInstance.render(noteData.content);
                    
                    // Set current note ID for saving
                    window.editorInstance.setCurrentNote(nodeId);
                    // Load tags for this note
                    if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                        window.tagSystem.loadForNote(nodeId);
                    }
                    
                    // Update note title in the UI
                    const noteTitle = document.querySelector('.note-title');
                    if (noteTitle) {
                        noteTitle.textContent = title;
                    }

                    // Apply header customization (background + icon) from tree node
                    try {
                        const tree = window.noteTreeView;
                        const node = tree ? tree.findNodeById(tree.nodes, nodeId) : null;
                        const headerEl = document.querySelector('#notesSection .note-header');
                        const iconBtn = document.getElementById('noteIconBtn');
                        if (headerEl) {
                            // Reset first so styles from previous note don't persist
                            headerEl.style.backgroundColor = '';
                            headerEl.style.backgroundImage = '';
                        }
                        if (node && headerEl) {
                            const bg = node.customization || {};
                            if (Object.prototype.hasOwnProperty.call(bg, 'backgroundColor') && bg.backgroundColor) {
                                headerEl.style.backgroundColor = bg.backgroundColor;
                            }
                            if (Object.prototype.hasOwnProperty.call(bg, 'backgroundImage')) {
                                headerEl.style.backgroundImage = bg.backgroundImage ? `url(${bg.backgroundImage})` : '';
                            }
                        }
                        const ico = (node && (node.customIcon || (node.customization && node.customization.customIcon))) || null;
                        if (iconBtn) {
                            if (ico) iconBtn.textContent = ico; else iconBtn.innerHTML = '<i class="fas fa-file-alt"></i>';
                        }
                    } catch (_) {}
                    
                } else {
                    console.error('Failed to load note:', await response.text());
                    // If note doesn't exist, create a new empty note
                    try {
                        await window.editorInstance.render({ blocks: [] });
                        window.editorInstance.setCurrentNote(nodeId);
                        if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                            window.tagSystem.loadForNote(nodeId);
                        }
                    } catch (renderError) {
                        console.error('Error rendering empty note:', renderError);
                    }
                }

                if (nodeId) {
                    const routeOptions = window.__noteSyncExtras ? { ...window.__noteSyncExtras } : {};
                    routeOptions.source = routeOptions.source || 'note-load';
                    syncRoute('notes', { note: nodeId }, routeOptions);
                }

            } catch (error) {
                console.error('Error loading note:', error);
                // Fallback to empty note
                try {
                    await window.editorInstance.render({ blocks: [] });
                    window.editorInstance.setCurrentNote(nodeId);
                    if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                        window.tagSystem.loadForNote(nodeId);
                    }
                } catch (renderError) {
                    console.error('Error rendering fallback note:', renderError);
                }
            } finally {
                window.__noteSyncExtras = null;
                // Clear loading flag after a short delay to ensure all blocks are rendered
                setTimeout(() => {
                    window.isLoadingNote = false;
                }, 500);
            }
        }
        // Expose for external callers (e.g., editor note-link navigation)
        window.loadNoteContent = loadNoteContent;
        
        // Load chat content from backend
        async function loadChatContent(nodeId, title) {
            try {
                const response = await fetch(`/api/chats/${nodeId}`);
                if (response.ok) {
                    const chatData = await response.json();
                    console.log('Loaded chat data:', chatData);
                    
                    // DO NOT call loadChatMessages here - the tab manager's restoreChatState
                    // will handle loading messages when the tab is activated.
                    // Calling it here causes duplicate loads.
                    
                } else {
                    console.error('Failed to load chat:', await response.text());
                }

                if (nodeId) {
                    syncRoute('chat', { chat: nodeId }, { source: 'chat-load' });
                }
            } catch (error) {
                console.error('Error loading chat:', error);
            }
        }
        
        // Initialize Tasks controller is handled by bundled script when flag is set.
        // Fallback to legacy TaskManager only if present and controller is not used.
        if (!window.TasksController) {
            if (typeof TaskManager !== 'undefined') {
                console.log('Initializing legacy TaskManager...');
                window.taskManager = new TaskManager();
            } else {
                console.log('TasksController active or legacy TaskManager not present.');
            }
        }
        
    } catch (error) {
        console.error('Error initializing app:', error);
    } finally {
        setupRouterIntegration();
    }
});
