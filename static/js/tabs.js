class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 0;
        this.tabsCollapsed = false;
        
        // Check if we're in mobile mode
        this.isMobile = window.innerWidth <= 1024;
        
        // DOM elements - use different elements for mobile vs desktop
        if (this.isMobile) {
            this.tabsList = document.getElementById('mobileTabsList');
            this.tabsWrapper = document.getElementById('mobileTabsWrapper');
        } else {
            this.tabsList = document.getElementById('tabsList');
            this.tabsWrapper = document.getElementById('tabsWrapper');
        }
        
        this.gooeyMenu = document.querySelector('.gooey-menu');
        this.menuOpen = document.getElementById('menu-open');
        this.menuItems = document.querySelectorAll('.gooey-menu .menu-item');
        this.dynamicTabs = document.querySelector('.dynamic-tabs');
        
        // Create the collapse toggle button
        this.createCollapseToggle();
        
        // Initialize events
        this.initEvents();
        
        // Listen for window resize to handle mobile/desktop switching
        window.addEventListener('resize', () => {
            const newIsMobile = window.innerWidth <= 1024;
            if (newIsMobile !== this.isMobile) {
                this.isMobile = newIsMobile;
                this.updateTabsContainer();
            }
        });
    }
    
    updateTabsContainer() {
        // Update references when switching between mobile and desktop
        if (this.isMobile) {
            this.tabsList = document.getElementById('mobileTabsList');
            this.tabsWrapper = document.getElementById('mobileTabsWrapper');
        } else {
            this.tabsList = document.getElementById('tabsList');
            this.tabsWrapper = document.getElementById('tabsWrapper');
        }
        
        // Re-render all tabs in the new container
        this.renderAllTabs();
    }
    
    renderAllTabs() {
        // Clear current container
        if (this.tabsList) {
            this.tabsList.innerHTML = '';
            
            // Re-add all tabs
            this.tabs.forEach(tabData => {
                const tab = this.createTabElement(tabData);
                this.tabsList.appendChild(tab);
            });
        }
    }
    
    createCollapseToggle() {
        // Check if we're in mobile mode - if mobile header exists, don't create duplicate toggle
        const mobileHeader = document.querySelector('.mobile-header');
        if (mobileHeader && this.isMobile) {
            // In mobile mode, the mobile.js handles the toggle functionality
            return; // Don't create duplicate toggle
        }
        
        // Create collapse toggle button only for desktop with consistent styling
        const collapseToggle = document.createElement('button');
        collapseToggle.id = 'tabsCollapseToggle';
        collapseToggle.title = 'Hide tabs';
        collapseToggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
        
        // Apply consistent styling matching mobile-tabs-toggle design
        collapseToggle.style.cssText = `
            width: 36px !important;
            height: 36px !important;
            padding: 8px !important;
            border: none !important;
            border-radius: 6px !important;
            background: rgba(0, 0, 0, 0.05) !important;
            color: #6c757d !important;
            cursor: pointer !important;
            font-size: 1.1rem !important;
            transition: all 0.3s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin-left: 8px !important;
            flex-shrink: 0 !important;
        `;
        
        // Add hover effects matching other toggle buttons
        collapseToggle.onmouseenter = () => {
            collapseToggle.style.background = 'rgba(0, 0, 0, 0.1) !important';
            collapseToggle.style.transform = 'scale(1.1) !important';
        };
        
        collapseToggle.onmouseleave = () => {
            collapseToggle.style.background = 'rgba(0, 0, 0, 0.05) !important';
            collapseToggle.style.transform = 'scale(1) !important';
        };
        
        // Insert at the end of the desktop tabs container (right side)
        const tabsContainer = this.dynamicTabs ? this.dynamicTabs.querySelector('.tabs-container') : null;
        if (tabsContainer) {
            tabsContainer.appendChild(collapseToggle);
        }
        
        // Event listener is handled by ToggleManager event delegation
        // No need to add direct event listener here to avoid double-triggering
    }
    
    toggleTabsVisibility() {
        // This method is kept for legacy compatibility but event handling
        // is now done through ToggleManager event delegation
        console.warn('toggleTabsVisibility called directly - should use ToggleManager event delegation instead');
        
        if (window.toggleManager) {
            if (this.isMobile) {
                window.toggleManager.toggleMobileHeader();
            } else {
                window.toggleManager.toggleDesktopTabs();
            }
        } else {
            console.warn('ToggleManager not available. Using legacy toggle logic.');
            this.legacyToggleTabsVisibility();
        }
    }
    
    // Legacy method kept for backwards compatibility
    legacyToggleTabsVisibility() {
        // Check if we're in mobile mode
        const mobileHeader = document.querySelector('.mobile-header');
        if (mobileHeader && this.isMobile) {
            // In mobile mode, delegate to mobile manager
            if (window.mobileManager) {
                window.mobileManager.toggleMobileTabs();
            }
            return;
        }
        
        // Store the current state before toggling
        this.tabsCollapsed = !this.tabsCollapsed;
        
        // Add or remove body class for CSS styling
        if (this.tabsCollapsed) {
            document.body.classList.add('tabs-collapsed');
        } else {
            document.body.classList.remove('tabs-collapsed');
        }
        
        // Hide/show the entire tabs container
        if (this.dynamicTabs) {
            if (this.tabsCollapsed) {
                // Hide the entire tabs container
                this.dynamicTabs.style.display = 'none';
                
                // NOTE: Floating toggle is now handled by ToggleManager
                // No need to create duplicate floating toggle here
            } else {
                // Show the entire tabs container
                this.dynamicTabs.style.display = 'block';
                
                // NOTE: Floating toggle removal is handled by ToggleManager
                // No need to remove floating toggle here
                
                // Update original toggle button icon
                const collapseToggle = document.getElementById('tabsCollapseToggle');
                if (collapseToggle) {
                    collapseToggle.querySelector('i').className = 'fas fa-chevron-up';
                }
            }
        }
        
        // Save state to localStorage
        localStorage.setItem('tabsCollapsed', this.tabsCollapsed);
    }
    
    // DEPRECATED: Floating toggle is now handled by ToggleManager
    // This method is kept for compatibility but should not be used
    createFloatingToggle() {
        console.warn('createFloatingToggle is deprecated. ToggleManager handles floating toggles.');
        // Remove existing floating toggle if any to prevent duplicates
        this.removeFloatingToggle();
        
        // No longer creates floating toggle - ToggleManager handles this
    }
    
    // DEPRECATED: Floating toggle removal is handled by ToggleManager
    removeFloatingToggle() {
        // Clean up any legacy floating toggles created by this class
        const existingToggle = document.getElementById('desktopFloatingToggle');
        if (existingToggle) {
            existingToggle.remove();
        }
    }
    
    loadCollapseState() {
        // Restore collapse state from localStorage
        const savedState = localStorage.getItem('tabsCollapsed');
        if (savedState === 'true') {
            this.tabsCollapsed = true;
            // Add the body class for styling
            document.body.classList.add('tabs-collapsed');
            
            if (this.dynamicTabs) {
                // Hide the entire tabs container
                this.dynamicTabs.style.display = 'none';
                
                // NOTE: Floating toggle is now handled by ToggleManager
                // No longer creates floating toggle here to prevent duplicates
            }
        }
    }
    
    initEvents() {
        // Gooey menu items click
        this.menuItems.forEach(menuItem => {
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                const tabType = menuItem.getAttribute('data-type');
                this.createNewTab(tabType);
                // Close the gooey menu
                this.menuOpen.checked = false;
            });
        });
        
        // Close gooey menu when clicking outside of it
        document.addEventListener('click', (e) => {
            // Check if the menu is currently open
            if (this.menuOpen.checked) {
                // Check if the click is outside the gooey menu
                if (!this.gooeyMenu.contains(e.target)) {
                    // Close the menu
                    this.menuOpen.checked = false;
                }
            }
        });
        
        // Handle scroll behavior for tabs
        if (this.tabsWrapper) {
            this.tabsWrapper.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.tabsWrapper.scrollLeft += e.deltaY;
            });
        }

        // Load saved collapse state
        this.loadCollapseState();
    }
    
    createTabElement(tabData) {
        // Create tab element
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.id = tabData.id;
        tab.setAttribute('data-type', tabData.type);
        tab.innerHTML = `
            <span class="tab-title">${tabData.title}</span>
            <span class="close-tab">&times;</span>
        `;
        
        // Add event listeners
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('close-tab')) {
                this.activateTab(tabData.id);
            }
        });
        
        const closeBtn = tab.querySelector('.close-tab');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabData.id);
        });
        
        return tab;
    }
    
    createNewTab(type, title = null, contentId = null) {
        this.tabCounter++;
        const tabId = `tab-${Date.now()}-${this.tabCounter}`;
        const defaultTitles = {
            'note': 'New Note',
            'chat': 'New Chat'
        };
        
        const tabTitle = title || defaultTitles[type] || 'New Tab';
        
        // Create tab data
        const tabData = {
            id: tabId,
            type: type,
            title: tabTitle,
            contentId: contentId, // Store the ID of the associated content (note ID or chat ID)
            state: {} // Additional state information if needed
        };
        
        // Add to tabs array
        this.tabs.push(tabData);
        
        // Create and add tab element to DOM
        if (this.tabsList) {
            const tab = this.createTabElement(tabData);
            this.tabsList.appendChild(tab);
            
            // Ensure the new tab is visible (scroll to it)
            // Ensure the new tab is visible (scroll to it)
            tab.scrollIntoView({ behavior: 'smooth', inline: 'end' });
        }
        
        // Activate the new tab
        this.activateTab(tabId);
        
        return tabId;
    }
    
    activateTab(tabId) {
        // First deactivate all tabs
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        // Hide all content sections
        document.getElementById('notesSection').style.display = 'none';
        document.getElementById('chatSection').style.display = 'none';
        
        // Then activate the selected tab
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.classList.add('active');
            this.activeTabId = tabId;
            
            // Find the tab data to access its state
            const tabData = this.tabs.find(t => t.id === tabId);
            if (!tabData) return;
            
            // Show corresponding content based on tab type
            const tabType = tab.getAttribute('data-type');
            if (tabType === 'note') {
                this.switchToNotesContext();
                
                // Restore the note content if we have a contentId
                if (tabData.contentId) {
                    this.restoreNoteState(tabData.contentId);
                }
            } else if (tabType === 'chat') {
                this.switchToChatContext();
                
                // Restore the chat content if we have a contentId
                if (tabData.contentId) {
                    this.restoreChatState(tabData.contentId);
                }
            }
        }
    }
    
    closeTab(tabId) {
        // Find tab in DOM and remove it
        const tab = document.getElementById(tabId);
        if (tab) {
            // Find tab index in array
            const tabIndex = this.tabs.findIndex(t => t.id === tabId);
            
            // Remove from DOM
            tab.remove();
            
            // Remove from array
            if (tabIndex !== -1) {
                this.tabs.splice(tabIndex, 1);
            }
            
            // If we closed the active tab, activate the next one
            if (tabId === this.activeTabId) {
                if (this.tabs.length > 0) {
                    // Priority: activate the tab to the left of the closed tab
                    let nextTabIndex = Math.max(0, tabIndex - 1);
                    this.activateTab(this.tabs[nextTabIndex].id);
                } else {
                    // If no tabs remain, create a default note tab
                    this.createNewTab('note');
                }
            }
        }
    }
    
    // Set tab title (useful for when note/chat name changes)
    setTabTitle(tabId, newTitle) {
        const tab = document.getElementById(tabId);
        if (tab) {
            const titleElem = tab.querySelector('.tab-title');
            if (titleElem) {
                titleElem.textContent = newTitle;
            }
            
            // Update in our tabs array
            const tabObj = this.tabs.find(t => t.id === tabId);
            if (tabObj) {
                tabObj.title = newTitle;
            }
        }
    }
    
    // Helper method to restore note state
    async restoreNoteState(noteId) {
        // Find the note in the tree view
        const noteTreeView = window.noteTreeView;
        if (!noteTreeView) return;
        
        const noteNode = noteTreeView.findNodeById(noteTreeView.nodes, noteId);
        if (noteNode) {
            // Select the note in the tree
            noteTreeView.selectNode(noteId);
            
            // Update the title display
            document.getElementById('note-title-display').textContent = noteNode.name;
            
            // Load note content into editor
            if (window.editorInstance) {
                try {
                    await window.editorInstance.render(noteNode.content);
                    window.editorInstance.setCurrentNote(noteId);
                } catch (error) {
                    console.error('Error rendering note in tab:', error);
                }
            }
        }
    }
    
    // Helper method to restore chat state
    restoreChatState(chatId) {
        // Use the existing loadChatMessages function to restore chat content
        if (window.loadChatMessages) {
            window.loadChatMessages(chatId);
        }
        
        // Select the chat in the tree view
        const chatTreeView = window.chatTreeView;
        if (chatTreeView) {
            chatTreeView.selectNode(chatId);
        }
    }
    
    // Find a tab by its content ID
    findTabByContentId(contentId) {
        return this.tabs.find(tab => tab.contentId === contentId);
    }
    
    // Set the content ID for the current active tab
    setActiveTabContent(contentId, title = null) {
        if (!this.activeTabId) return;
        
        const tabData = this.tabs.find(t => t.id === this.activeTabId);
        if (tabData) {
            tabData.contentId = contentId;
            if (title) {
                tabData.title = title;
                this.setTabTitle(this.activeTabId, title);
            }
        }
    }
    
    // Get a tab for specific content, or create one if it doesn't exist
    getOrCreateTabForContent(type, contentId, title) {
        // First look for an existing tab with this content
        const existingTab = this.findTabByContentId(contentId);
        if (existingTab) {
            // Use the existing tab
            this.activateTab(existingTab.id);
            return existingTab.id;
        } else {
            // Create a new tab for this content
            const tabId = this.createNewTab(type, title, contentId);
            return tabId;
        }
    }

    // Update the active tab content without creating a new tab
    updateActiveTabContent(type, contentId, title) {
        // First check if we have an active tab
        if (!this.activeTabId) {
            // No active tab, create a new one
            this.createNewTab(type, title, contentId);
            return;
        }
        
        // Get the active tab data
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (!activeTab) return;
        
        // Update the tab regardless of type - this allows switching between note and chat
        activeTab.type = type;
        activeTab.contentId = contentId;
        
        // Update the tab title
        if (title) {
            activeTab.title = title;
            this.setTabTitle(this.activeTabId, title);
        }
        
        // Update the tab's data-type attribute for styling
        const tabElement = document.getElementById(this.activeTabId);
        if (tabElement) {
            tabElement.setAttribute('data-type', type);
        }
        
        // Restore appropriate state based on type and switch UI context
        if (type === 'note') {
            this.switchToNotesContext();
            this.restoreNoteState(contentId);
        } else if (type === 'chat') {
            this.switchToChatContext();
            this.restoreChatState(contentId);
        }
    }
    
    // Helper method to switch to notes context
    switchToNotesContext() {
        // Show notes section, hide chat section
        document.getElementById('notesSection').style.display = 'block';
        document.getElementById('chatSection').style.display = 'none';
        
        // Add body class for styling
        document.body.classList.remove('chat-mode');
        document.body.classList.add('notes-mode');
        
        // Update old tab navigation
        const notesTabBtn = document.getElementById('notesTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        if (notesTabBtn && chatTabBtn) {
            notesTabBtn.classList.add('active');
            chatTabBtn.classList.remove('active');
        }
        
        // Show note sidebar elements and hide chat sidebar elements
        const noteTreeContainer = document.getElementById('noteTreeContainer');
        const chatTreeContainer = document.getElementById('chatTreeContainer');
        const notesButtons = document.getElementById('notesButtons');
        const chatButtons = document.getElementById('chatButtons');
        
        if (noteTreeContainer) noteTreeContainer.style.display = 'block';
        if (chatTreeContainer) chatTreeContainer.style.display = 'none';
        if (notesButtons) notesButtons.style.display = 'flex';
        if (chatButtons) chatButtons.style.display = 'none';
    }
    
    // Helper method to switch to chat context
    switchToChatContext() {
        // Show chat section, hide notes section
        document.getElementById('chatSection').style.display = 'block';
        document.getElementById('notesSection').style.display = 'none';
        
        // Add body class for styling
        document.body.classList.remove('notes-mode');
        document.body.classList.add('chat-mode');
        
        // Update old tab navigation
        const notesTabBtn = document.getElementById('notesTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        if (notesTabBtn && chatTabBtn) {
            notesTabBtn.classList.remove('active');
            chatTabBtn.classList.add('active');
        }
        
        // Show chat sidebar elements and hide note sidebar elements
        const noteTreeContainer = document.getElementById('noteTreeContainer');
        const chatTreeContainer = document.getElementById('chatTreeContainer');
        const notesButtons = document.getElementById('notesButtons');
        const chatButtons = document.getElementById('chatButtons');
        
        if (noteTreeContainer) noteTreeContainer.style.display = 'none';
        if (chatTreeContainer) chatTreeContainer.style.display = 'block';
        if (notesButtons) notesButtons.style.display = 'none';
        if (chatButtons) chatButtons.style.display = 'flex';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create global tab manager instance
    window.tabManager = new TabManager();
    
    // Create default tab
    window.tabManager.createNewTab('note', 'Welcome');
    
    // Make noteTreeView available globally for the tab manager
    window.noteTreeView = null;
    
    // Connect with existing tab navigation
    const notesTabBtn = document.getElementById('notesTabBtn');
    const chatTabBtn = document.getElementById('chatTabBtn');
    
    if (notesTabBtn && chatTabBtn) {
        // Override the existing tab buttons to use our tab system
        notesTabBtn.addEventListener('click', () => {
            // Find or create a note type tab
            const noteTab = window.tabManager.tabs.find(t => t.type === 'note');
            if (noteTab) {
                window.tabManager.activateTab(noteTab.id);
            } else {
                window.tabManager.createNewTab('note');
            }
        });
        
        chatTabBtn.addEventListener('click', () => {
            // Find or create a chat type tab
            const chatTab = window.tabManager.tabs.find(t => t.type === 'chat');
            if (chatTab) {
                window.tabManager.activateTab(chatTab.id);
            } else {
                window.tabManager.createNewTab('chat');
            }
        });
    }
});
