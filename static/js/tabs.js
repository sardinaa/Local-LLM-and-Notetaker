class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 0;
        this.tabsCollapsed = false;
        
        // Check if we're in mobile mode
        this.isMobile = window.innerWidth <= 768;
        
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
            const newIsMobile = window.innerWidth <= 768;
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
        
        // Create collapse toggle button only for desktop
        const collapseToggle = document.createElement('button');
        collapseToggle.id = 'tabsCollapseToggle';
        collapseToggle.title = 'Toggle tabs bar';
        collapseToggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
        
        // Insert at beginning of the desktop tabs container
        const tabsContainer = this.dynamicTabs ? this.dynamicTabs.querySelector('.tabs-container') : null;
        if (tabsContainer) {
            tabsContainer.insertBefore(collapseToggle, tabsContainer.firstChild);
        }
        
        // Add event listener
        collapseToggle.addEventListener('click', () => this.toggleTabsVisibility());
    }
    
    toggleTabsVisibility() {
        // Check if we're in mobile mode
        const mobileHeader = document.querySelector('.mobile-header');
        if (mobileHeader) {
            // In mobile mode, tabs are handled by mobile.js, don't manipulate dynamic-tabs
            return;
        }
        
        // Store the current state before toggling
        const wasCollapsed = this.tabsCollapsed;
        this.tabsCollapsed = !this.tabsCollapsed;
        
        // Add or remove body class for CSS styling
        if (this.tabsCollapsed) {
            document.body.classList.add('tabs-collapsed');
        } else {
            document.body.classList.remove('tabs-collapsed');
        }
        
        if (this.dynamicTabs) {
            // Get the actual height of the tabs container before any changes
            const tabsContainer = this.dynamicTabs.querySelector('.tabs-container');
            const actualHeight = tabsContainer ? tabsContainer.offsetHeight : 0;
            
            if (!wasCollapsed) {
                // We're collapsing - set current height explicitly first
                this.dynamicTabs.style.height = actualHeight + 'px';
                // Force reflow to ensure the browser recognizes the height
                this.dynamicTabs.offsetHeight;
                
                // Now animate to height 0
                this.dynamicTabs.style.height = '0px';
                this.dynamicTabs.style.overflow = 'hidden';
                
                // After animation completes, add the collapsed class
                setTimeout(() => {
                    this.dynamicTabs.classList.add('collapsed');
                    
                    // Position the toggle button at the top of notesSection
                    const collapseToggle = document.getElementById('tabsCollapseToggle');
                    const notesSection = document.getElementById('notesSection');
                    const sidebar = document.querySelector('.sidebar');
                    
                    if (collapseToggle && notesSection) {
                        // Move the collapse toggle to be a direct child of the body to allow proper positioning
                        document.body.appendChild(collapseToggle);
                        
                        // Position it at the top of notesSection, after the sidebar
                        const sidebarWidth = sidebar ? sidebar.offsetWidth : 250;
                        collapseToggle.style.position = 'fixed'; // Use fixed positioning
                        collapseToggle.style.top = '0'; // Place it at the very top
                        collapseToggle.style.left = `${sidebarWidth + 10}px`; // Position right after sidebar
                        collapseToggle.style.borderRadius = '0 0 4px 0'; // Adjust border radius for new position
                        collapseToggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    }
                }, 300); // Match the CSS transition duration
            } else {
                // We're expanding - first remove collapsed class
                this.dynamicTabs.classList.remove('collapsed');
                // Set height to 0 and ensure it's visible but just at 0 height
                this.dynamicTabs.style.height = '0px';
                this.dynamicTabs.style.opacity = '1';
                this.dynamicTabs.style.overflow = 'hidden';
                
                // Move the collapse toggle back to its original container
                const collapseToggle = document.getElementById('tabsCollapseToggle');
                const tabsContainer = document.querySelector('.tabs-container');
                
                if (collapseToggle && tabsContainer) {
                    tabsContainer.insertBefore(collapseToggle, tabsContainer.firstChild);
                    // Reset custom positioning
                    collapseToggle.style.position = 'absolute';
                    collapseToggle.style.top = '0';
                    collapseToggle.style.left = '10px';
                    collapseToggle.style.borderRadius = '0 0 4px 4px';
                    collapseToggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
                }
                
                // Force reflow
                this.dynamicTabs.offsetHeight;
                
                // Get the actual height needed for the expanded state
                setTimeout(() => {
                    // Get the complete height of the tabs container
                    const expandedHeight = tabsContainer ? tabsContainer.offsetHeight : 0;
                    
                    // Now animate to the full height
                    this.dynamicTabs.style.height = expandedHeight + 'px';
                    
                    // After animation completes, remove the explicit height to allow natural sizing
                    setTimeout(() => {
                        this.dynamicTabs.style.height = '';
                        this.dynamicTabs.style.overflow = '';
                    }, 300); // Match the CSS transition duration
                }, 10); // Small delay to ensure DOM updates
            }
        }
        
        // Save state to localStorage
        localStorage.setItem('tabsCollapsed', this.tabsCollapsed);
    }
    
    loadCollapseState() {
        // Restore collapse state from localStorage
        const savedState = localStorage.getItem('tabsCollapsed');
        if (savedState === 'true') {
            this.tabsCollapsed = true;
            // Add the body class for styling
            document.body.classList.add('tabs-collapsed');
            
            if (this.dynamicTabs) {
                this.dynamicTabs.classList.add('collapsed');
                // Set immediate styles for collapsed state without animation
                this.dynamicTabs.style.height = '0px';
                this.dynamicTabs.style.opacity = '0';
                this.dynamicTabs.style.overflow = 'hidden';
                
                // Position the toggle button appropriately on page load
                const collapseToggle = document.getElementById('tabsCollapseToggle');
                const notesSection = document.getElementById('notesSection');
                const sidebar = document.querySelector('.sidebar');
                
                if (collapseToggle && notesSection) {
                    // Delay positioning to ensure notesSection has been rendered
                    setTimeout(() => {
                        document.body.appendChild(collapseToggle);
                        const sidebarWidth = sidebar ? sidebar.offsetWidth : 250;
                        collapseToggle.style.position = 'fixed'; // Use fixed positioning
                        collapseToggle.style.top = '0'; // Place it at the very top
                        collapseToggle.style.left = `${sidebarWidth + 10}px`; // Position right after sidebar
                        collapseToggle.style.borderRadius = '0 0 4px 0'; // Adjust border radius for new position
                        collapseToggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    }, 100);
                }
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
