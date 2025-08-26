/**
 * Comprehensive Tag Management System
 * Features:
 * - Tag Library with usage counts and descriptions
 * - Hierarchical tags support (e.g., #tech/ai, #projects/personal)
 * - Search & Filter with autocomplete
 * - Bulk operations for applying/removing tags
 * - Tag templates for different note types
 * - Tag dependencies (auto-apply parent tags)
 * - Related tags suggestions
 */

class TagsManager {
    constructor() {
        this.tags = new Map();
        this.tagCategories = new Map();
        this.tagHierarchy = new Map();
        this.tagTemplates = new Map();
        this.relatedTags = new Map();
        this.currentView = 'grid';
        this.currentSort = 'name';
        this.sortOrder = 'asc';
        this.searchQuery = '';
        this.selectedTags = new Set();
        this.isInitialized = false;
        this.searchTimeout = null;
        
        // Initialize default templates
        this.initializeDefaultTemplates();
    }

    async init() {
        if (this.isInitialized) return;
        
        console.log('Initializing Tags Manager...');
        
        try {
            await this.loadTags();
            this.setupEventListeners();
            this.renderInterface();
            this.isInitialized = true;
            console.log('Tags Manager initialized successfully');
        } catch (error) {
            console.error('Error initializing Tags Manager:', error);
        }
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('tagsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
            
            // Keyboard shortcuts for search
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.handleSearch('');
                }
            });
        }

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Shift + T to open tags
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                if (window.tabManager) {
                    window.tabManager.createNewTab('tags');
                } else {
                    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabType: 'tags' } }));
                }
            }
        });

        // View controls
        document.getElementById('tagsGridViewBtn')?.addEventListener('click', () => this.setView('grid'));
        document.getElementById('tagsListViewBtn')?.addEventListener('click', () => this.setView('list'));
        document.getElementById('tagsHierarchyViewBtn')?.addEventListener('click', () => this.setView('hierarchy'));

        // Sort controls
        const sortSelect = document.getElementById('tagsSortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.renderTags();
            });
        }

        const sortOrderBtn = document.getElementById('tagsSortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.addEventListener('click', () => {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                this.updateSortOrderIcon();
                this.renderTags();
            });
        }

        // Filter controls
        const categoryFilter = document.getElementById('tagsCategoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => this.renderTags());
        }

        const hierarchyFilter = document.getElementById('tagsHierarchyFilter');
        if (hierarchyFilter) {
            hierarchyFilter.addEventListener('change', () => this.renderTags());
        }

        // Action buttons
        document.getElementById('createTagBtn')?.addEventListener('click', () => this.showCreateTagModal());
        document.getElementById('tagTemplatesBtn')?.addEventListener('click', () => this.showTagTemplatesModal());
        document.getElementById('bulkTagsBtn')?.addEventListener('click', () => this.showBulkOperationsModal());
    }

    async loadTags() {
        try {
            const response = await fetch('/api/tags?includeUsage=true&limit=1000');
            if (!response.ok) throw new Error('Failed to load tags');
            
            const data = await response.json();
            this.processTags(data.tags || []);
            
            console.log(`Loaded ${this.tags.size} tags`);
        } catch (error) {
            console.error('Error loading tags:', error);
            // Initialize with empty state if API fails
            this.tags.clear();
            
            // Show user-friendly message
            this.showNotification('Failed to load tags. Please check your connection.', 'error');
        }
    }

    processTags(tagsData) {
        this.tags.clear();
        this.tagCategories.clear();
        this.tagHierarchy.clear();

        tagsData.forEach(tag => {
            // Process hierarchical slug
            const slugParts = tag.slug ? tag.slug.split('/') : [];
            const category = slugParts.length > 1 ? slugParts[0] : 'General';
            
            // Store tag data
            this.tags.set(tag.id, {
                ...tag,
                category,
                level: slugParts.length - 1,
                parentSlug: slugParts.length > 1 ? slugParts.slice(0, -1).join('/') : null,
                children: []
            });

            // Track categories
            if (!this.tagCategories.has(category)) {
                this.tagCategories.set(category, {
                    name: category,
                    count: 0,
                    tags: []
                });
            }
            this.tagCategories.get(category).count++;
            this.tagCategories.get(category).tags.push(tag.id);
        });

        // Build hierarchy relationships
        this.buildHierarchy();
    }

    buildHierarchy() {
        // Build parent-child relationships
        this.tags.forEach((tag, tagId) => {
            if (tag.parentSlug) {
                // Find parent tag
                const parentTag = Array.from(this.tags.values()).find(t => t.slug === tag.parentSlug);
                if (parentTag) {
                    parentTag.children.push(tagId);
                    tag.parentId = parentTag.id;
                }
            }
        });

        // Build hierarchy tree structure
        this.tagHierarchy.clear();
        this.tags.forEach((tag, tagId) => {
            if (!tag.parentId) {
                // Root level tag
                this.tagHierarchy.set(tagId, this.buildHierarchyNode(tagId));
            }
        });
    }

    buildHierarchyNode(tagId) {
        const tag = this.tags.get(tagId);
        if (!tag) return null;

        return {
            id: tagId,
            tag: tag,
            children: tag.children.map(childId => this.buildHierarchyNode(childId)).filter(Boolean)
        };
    }

    renderInterface() {
        this.renderCategories();
        this.renderHierarchyTree();
        this.renderTags();
        this.updateFilters();
        
        // Show welcome message if no tags exist
        if (this.tags.size === 0) {
            this.showWelcomeMessage();
        }
    }

    showWelcomeMessage() {
        const container = document.getElementById('tagsGridView');
        if (!container) return;

        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-tags"></i>
                </div>
                <h3>Welcome to Tag Management!</h3>
                <p>You don't have any tags yet. Tags help you organize and find your notes quickly.</p>
                <div class="welcome-actions">
                    <button class="btn-primary" id="createFirstTag">
                        <i class="fas fa-plus"></i> Create Your First Tag
                    </button>
                    <button class="btn-secondary" id="loadSampleTags">
                        <i class="fas fa-download"></i> Load Sample Tags
                    </button>
                </div>
                <div class="welcome-tips">
                    <h4>Quick Tips:</h4>
                    <ul>
                        <li>Use <strong>/</strong> in slugs to create hierarchies (e.g., <code>work/projects</code>)</li>
                        <li>Press <strong>Ctrl+Shift+T</strong> to quickly open tag management</li>
                        <li>Use bulk operations to tag multiple notes at once</li>
                        <li>Create templates for common tag combinations</li>
                    </ul>
                </div>
            </div>
        `;

        // Add event listeners for welcome actions
        document.getElementById('createFirstTag')?.addEventListener('click', () => {
            this.showCreateTagModal();
        });

        document.getElementById('loadSampleTags')?.addEventListener('click', () => {
            this.createSampleTags();
        });
    }

    async createSampleTags() {
        const sampleTags = [
            { name: 'Work', slug: 'work', description: 'Work-related content', color: '#3498db' },
            { name: 'Personal', slug: 'personal', description: 'Personal notes and thoughts', color: '#2ecc71' },
            { name: 'Projects', slug: 'work/projects', description: 'Project-related notes', color: '#9b59b6' },
            { name: 'Meetings', slug: 'work/meetings', description: 'Meeting notes and minutes', color: '#e74c3c' },
            { name: 'Ideas', slug: 'personal/ideas', description: 'Creative ideas and brainstorming', color: '#f39c12' },
            { name: 'Learning', slug: 'personal/learning', description: 'Study notes and research', color: '#1abc9c' },
            { name: 'Todo', slug: 'todo', description: 'Tasks and reminders', color: '#e67e22' },
            { name: 'Important', slug: 'important', description: 'High priority items', color: '#c0392b' }
        ];

        try {
            let successCount = 0;
            for (const tagData of sampleTags) {
                try {
                    await this.createTag(tagData);
                    successCount++;
                } catch (error) {
                    console.error(`Error creating sample tag ${tagData.name}:`, error);
                }
            }

            this.showNotification(`Created ${successCount} sample tags`, 'success');
        } catch (error) {
            console.error('Error creating sample tags:', error);
            this.showNotification('Failed to create sample tags', 'error');
        }
    }

    renderCategories() {
        const container = document.getElementById('tagCategoriesList');
        if (!container) return;

        container.innerHTML = '';
        
        const sortedCategories = Array.from(this.tagCategories.entries())
            .sort(([, a], [, b]) => b.count - a.count);

        sortedCategories.forEach(([categoryName, category]) => {
            const categoryEl = document.createElement('div');
            categoryEl.className = 'category-item';
            categoryEl.innerHTML = `
                <div class="category-name">${categoryName}</div>
                <div class="category-count">${category.count}</div>
            `;
            categoryEl.addEventListener('click', () => this.filterByCategory(categoryName));
            container.appendChild(categoryEl);
        });
    }

    renderHierarchyTree() {
        const container = document.getElementById('tagHierarchyTree');
        if (!container) return;

        container.innerHTML = '';
        
        this.tagHierarchy.forEach((node, tagId) => {
            const treeEl = this.createHierarchyTreeNode(node);
            container.appendChild(treeEl);
        });
    }

    createHierarchyTreeNode(node) {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'hierarchy-node';
        
        const tag = node.tag;
        const hasChildren = node.children.length > 0;
        
        nodeEl.innerHTML = `
            <div class="node-header" data-tag-id="${node.id}">
                ${hasChildren ? '<i class="fas fa-chevron-right toggle-icon"></i>' : '<span class="node-spacer"></span>'}
                <span class="tag-name">${tag.name}</span>
                <span class="tag-usage">${tag.usage_count || 0}</span>
            </div>
            ${hasChildren ? '<div class="node-children"></div>' : ''}
        `;

        // Add children if any
        if (hasChildren) {
            const childrenContainer = nodeEl.querySelector('.node-children');
            node.children.forEach(child => {
                const childEl = this.createHierarchyTreeNode(child);
                childEl.style.marginLeft = '20px';
                childrenContainer.appendChild(childEl);
            });

            // Add expand/collapse functionality
            const toggleIcon = nodeEl.querySelector('.toggle-icon');
            const header = nodeEl.querySelector('.node-header');
            header.addEventListener('click', () => {
                const isExpanded = childrenContainer.style.display !== 'none';
                childrenContainer.style.display = isExpanded ? 'none' : 'block';
                toggleIcon.className = isExpanded ? 'fas fa-chevron-right toggle-icon' : 'fas fa-chevron-down toggle-icon';
            });
        }

        // Add click handler for tag selection
        const header = nodeEl.querySelector('.node-header');
        header.addEventListener('click', (e) => {
            if (e.target.closest('.toggle-icon')) return;
            this.selectTag(node.id);
        });

        return nodeEl;
    }

    renderTags() {
        const filteredTags = this.getFilteredTags();
        const sortedTags = this.sortTags(filteredTags);

        // Show/hide views
        document.getElementById('tagsGridView').classList.toggle('is-hidden', this.currentView !== 'grid');
        document.getElementById('tagsListView').classList.toggle('is-hidden', this.currentView !== 'list');
        document.getElementById('tagsHierarchyView').classList.toggle('is-hidden', this.currentView !== 'hierarchy');

        // Update view button states
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tags${this.currentView.charAt(0).toUpperCase() + this.currentView.slice(1)}ViewBtn`)?.classList.add('active');

        switch (this.currentView) {
            case 'grid':
                this.renderGridView(sortedTags);
                break;
            case 'list':
                this.renderListView(sortedTags);
                break;
            case 'hierarchy':
                this.renderHierarchyView(sortedTags);
                break;
        }
    }

    renderGridView(tags) {
        const container = document.getElementById('tagsGridView');
        if (!container) return;

        container.innerHTML = '';
        
        tags.forEach(tag => {
            const tagCard = document.createElement('div');
            tagCard.className = 'tag-card';
            
            // Get color for tag (fallback to default if not set)
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();
            
            tagCard.innerHTML = `
                <div class="tag-card-header">
                    <div class="tag-name">
                        <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                        ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}${tag.name}
                    </div>
                    <div class="tag-actions">
                        <button class="tag-action-btn edit-tag" data-tag-id="${tag.id}" title="Edit tag">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="tag-action-btn delete-tag" data-tag-id="${tag.id}" title="Delete tag">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="tag-slug">${tag.slug || ''}</div>
                <div class="tag-description">${tag.description || 'No description'}</div>
                <div class="tag-footer">
                    <div class="tag-usage">
                        <i class="fas fa-sticky-note"></i>
                        ${tag.usage || 0} notes
                    </div>
                    <div class="tag-category">${tag.category}</div>
                </div>
            `;

            // Add event listeners
            tagCard.querySelector('.edit-tag').addEventListener('click', () => this.editTag(tag.id));
            tagCard.querySelector('.delete-tag').addEventListener('click', () => this.deleteTag(tag.id));
            tagCard.addEventListener('click', (e) => {
                if (!e.target.closest('.tag-action-btn')) {
                    this.selectTag(tag.id);
                }
            });

            container.appendChild(tagCard);
        });
    }

    renderListView(tags) {
        const container = document.getElementById('tagsListView');
        if (!container) return;

        container.innerHTML = `
            <div class="tags-list-header">
                <div class="list-col-name">Name</div>
                <div class="list-col-slug">Slug</div>
                <div class="list-col-usage">Usage</div>
                <div class="list-col-category">Category</div>
                <div class="list-col-actions">Actions</div>
            </div>
        `;

        const listBody = document.createElement('div');
        listBody.className = 'tags-list-body';

        tags.forEach(tag => {
            const row = document.createElement('div');
            row.className = 'tag-list-row';
            
            // Get color for tag (fallback to default if not set)
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();
            
            row.innerHTML = `
                <div class="list-col-name">
                    <div class="tag-name">
                        <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                        ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}${tag.name}
                    </div>
                    <div class="tag-description">${tag.description || ''}</div>
                </div>
                <div class="list-col-slug">${tag.slug || ''}</div>
                <div class="list-col-usage">${tag.usage || 0}</div>
                <div class="list-col-category">${tag.category}</div>
                <div class="list-col-actions">
                    <button class="tag-action-btn edit-tag" data-tag-id="${tag.id}" title="Edit tag">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="tag-action-btn delete-tag" data-tag-id="${tag.id}" title="Delete tag">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Add event listeners
            row.querySelector('.edit-tag').addEventListener('click', () => this.editTag(tag.id));
            row.querySelector('.delete-tag').addEventListener('click', () => this.deleteTag(tag.id));
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.tag-action-btn')) {
                    this.selectTag(tag.id);
                }
            });

            listBody.appendChild(row);
        });

        container.appendChild(listBody);
    }

    renderHierarchyView(tags) {
        const container = document.getElementById('tagsHierarchyView');
        if (!container) return;

        container.innerHTML = '';
        
        // Group tags by hierarchy level
        const hierarchyMap = new Map();
        
        tags.forEach(tag => {
            const level = tag.level || 0;
            if (!hierarchyMap.has(level)) {
                hierarchyMap.set(level, []);
            }
            hierarchyMap.get(level).push(tag);
        });

        // Render each level
        Array.from(hierarchyMap.keys()).sort((a, b) => a - b).forEach(level => {
            const levelTags = hierarchyMap.get(level);
            
            const levelSection = document.createElement('div');
            levelSection.className = 'hierarchy-level';
            levelSection.innerHTML = `
                <h3 class="level-title">Level ${level} ${level === 0 ? '(Root)' : ''}</h3>
                <div class="level-tags"></div>
            `;

            const tagsContainer = levelSection.querySelector('.level-tags');
            levelTags.forEach(tag => {
                const tagEl = document.createElement('div');
                tagEl.className = 'hierarchy-tag';
                
                // Get color for tag (fallback to default if not set)
                const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
                const hasIcon = tag.icon && tag.icon.trim();
                
                tagEl.innerHTML = `
                    <div class="tag-info">
                        <div class="tag-name">
                            <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                            ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}${tag.name}
                        </div>
                        <div class="tag-slug">${tag.slug || ''}</div>
                        <div class="tag-usage">${tag.usage || 0} notes</div>
                    </div>
                    <div class="tag-actions">
                        <button class="tag-action-btn edit-tag" data-tag-id="${tag.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="tag-action-btn delete-tag" data-tag-id="${tag.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;

                tagEl.querySelector('.edit-tag').addEventListener('click', () => this.editTag(tag.id));
                tagEl.querySelector('.delete-tag').addEventListener('click', () => this.deleteTag(tag.id));
                
                tagsContainer.appendChild(tagEl);
            });

            container.appendChild(levelSection);
        });
    }

    getFilteredTags() {
        let filtered = Array.from(this.tags.values());

        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(tag =>
                tag.name.toLowerCase().includes(query) ||
                (tag.slug && tag.slug.toLowerCase().includes(query)) ||
                (tag.description && tag.description.toLowerCase().includes(query))
            );
        }

        // Filter by category
        const categoryFilter = document.getElementById('tagsCategoryFilter')?.value;
        if (categoryFilter) {
            filtered = filtered.filter(tag => tag.category === categoryFilter);
        }

        // Filter by hierarchy
        const hierarchyFilter = document.getElementById('tagsHierarchyFilter')?.value;
        if (hierarchyFilter === 'parents') {
            filtered = filtered.filter(tag => !tag.parentId);
        } else if (hierarchyFilter === 'children') {
            filtered = filtered.filter(tag => tag.parentId);
        }

        return filtered;
    }

    sortTags(tags) {
        return tags.sort((a, b) => {
            let aVal, bVal;

            switch (this.currentSort) {
                case 'usage':
                    aVal = a.usage_count || 0;
                    bVal = b.usage_count || 0;
                    break;
                case 'created':
                    aVal = new Date(a.created_at || 0);
                    bVal = new Date(b.created_at || 0);
                    break;
                case 'updated':
                    aVal = new Date(a.updated_at || 0);
                    bVal = new Date(b.updated_at || 0);
                    break;
                default: // name
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
            }

            if (this.sortOrder === 'desc') {
                return aVal < bVal ? 1 : -1;
            } else {
                return aVal > bVal ? 1 : -1;
            }
        });
    }

    updateFilters() {
        // Update category filter options
        const categoryFilter = document.getElementById('tagsCategoryFilter');
        if (categoryFilter) {
            const currentValue = categoryFilter.value;
            categoryFilter.innerHTML = '<option value="">All Categories</option>';
            
            Array.from(this.tagCategories.keys()).sort().forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            });
            
            if (currentValue) categoryFilter.value = currentValue;
        }
    }

    updateSortOrderIcon() {
        const icon = document.querySelector('#tagsSortOrderBtn i');
        if (icon) {
            if (this.currentSort === 'name') {
                icon.className = this.sortOrder === 'asc' ? 'fas fa-sort-alpha-down' : 'fas fa-sort-alpha-up';
            } else {
                icon.className = this.sortOrder === 'asc' ? 'fas fa-sort-numeric-down' : 'fas fa-sort-numeric-up';
            }
        }
    }

    handleSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.searchQuery = query;
            this.renderTags();
        }, 300);
    }

    filterByCategory(category) {
        const categoryFilter = document.getElementById('tagsCategoryFilter');
        if (categoryFilter) {
            categoryFilter.value = category;
            this.renderTags();
        }
    }

    setView(view) {
        this.currentView = view;
        this.renderTags();
    }

    selectTag(tagId) {
        // For single-selection mode, show tag details
        if (!this.selectedTags.has(tagId)) {
            this.selectedTags.clear(); // Single selection
            this.selectedTags.add(tagId);
            this.showTagDetails(tagId);
        } else {
            this.selectedTags.delete(tagId);
        }
        
        // Update visual selection
        this.updateTagSelection();
    }

    async showTagDetails(tagId) {
        try {
            const tag = this.tags.get(tagId);
            if (!tag) return;

            // Create or update tag details panel
            let detailsPanel = document.getElementById('tagDetailsPanel');
            if (!detailsPanel) {
                detailsPanel = document.createElement('div');
                detailsPanel.id = 'tagDetailsPanel';
                detailsPanel.className = 'tag-details-panel';
                
                // Insert into the main tags area
                const tagsMain = document.querySelector('.tags-main');
                if (tagsMain) {
                    tagsMain.appendChild(detailsPanel);
                }
            }

            // Show loading state
            detailsPanel.innerHTML = `
                <div class="tag-details-header">
                    <h3>Tag Details</h3>
                    <button class="close-details" title="Close details">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="tag-details-content">
                    <div class="loading">Loading tag information...</div>
                </div>
            `;

            // Add close handler
            detailsPanel.querySelector('.close-details').addEventListener('click', () => {
                detailsPanel.remove();
                this.selectedTags.clear();
                this.updateTagSelection();
            });

            // Fetch notes that use this tag
            const notesResponse = await fetch(`/api/tags/${tagId}/notes`);
            const notesData = notesResponse.ok ? await notesResponse.json() : { notes: [], count: 0 };

            // Get color for tag
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();

            // Render detailed information
            detailsPanel.querySelector('.tag-details-content').innerHTML = `
                <div class="tag-info-section">
                    <div class="tag-main-info">
                        <div class="tag-name-display">
                            <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                            ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}
                            <h4>${tag.name}</h4>
                        </div>
                        <div class="tag-slug-display">${tag.slug || 'No slug'}</div>
                        <div class="tag-description-display">${tag.description || 'No description'}</div>
                    </div>
                    
                    <div class="tag-stats-section">
                        <div class="tag-stat">
                            <i class="fas fa-sticky-note"></i>
                            <span>${tag.usage || 0} notes</span>
                        </div>
                        <div class="tag-stat">
                            <i class="fas fa-folder"></i>
                            <span>${tag.category}</span>
                        </div>
                        ${tag.parent_id ? `<div class="tag-stat"><i class="fas fa-sitemap"></i><span>Has parent</span></div>` : ''}
                        ${tag.children && tag.children.length > 0 ? `<div class="tag-stat"><i class="fas fa-code-branch"></i><span>${tag.children.length} children</span></div>` : ''}
                    </div>
                </div>

                <div class="tag-notes-section">
                    <h5><i class="fas fa-sticky-note"></i> Notes using this tag (${notesData.count})</h5>
                    <div class="tag-notes-list">
                        ${notesData.notes.length > 0 ? 
                            notesData.notes.map(note => `
                                <div class="tag-note-item" data-note-id="${note.id}">
                                    <div class="note-title">${note.title}</div>
                                    <div class="note-meta">
                                        ${note.lastModified ? `Modified: ${new Date(note.lastModified).toLocaleDateString()}` : ''}
                                    </div>
                                </div>
                            `).join('') : 
                            '<div class="no-notes">No notes use this tag yet.</div>'
                        }
                    </div>
                </div>

                <div class="tag-actions-section">
                    <button class="btn-primary edit-tag-btn" data-tag-id="${tagId}">
                        <i class="fas fa-edit"></i> Edit Tag
                    </button>
                    <button class="btn-danger delete-tag-btn" data-tag-id="${tagId}">
                        <i class="fas fa-trash"></i> Delete Tag
                    </button>
                </div>
            `;

            // Add event listeners for actions
            detailsPanel.querySelector('.edit-tag-btn').addEventListener('click', () => this.editTag(tagId));
            detailsPanel.querySelector('.delete-tag-btn').addEventListener('click', () => this.deleteTag(tagId));

            // Add click handlers for notes
            detailsPanel.querySelectorAll('.tag-note-item').forEach(noteEl => {
                noteEl.addEventListener('click', () => {
                    const noteId = noteEl.dataset.noteId;
                    this.openNote(noteId);
                });
            });

            // Scroll to show the details panel
            detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } catch (error) {
            console.error('Error showing tag details:', error);
        }
    }

    openNote(noteId) {
        // Try to open the note in the current tab system
        if (window.tabManager) {
            // Find existing note tab or create new one
            window.tabManager.getOrCreateTabForContent('note', noteId, 'Note');
        }
    }

    updateTagSelection() {
        // Update visual indicators for selected tags
        document.querySelectorAll('.tag-card, .tag-list-row, .hierarchy-tag').forEach(el => {
            const tagId = el.querySelector('[data-tag-id]')?.dataset.tagId;
            if (tagId) {
                el.classList.toggle('selected', this.selectedTags.has(tagId));
            }
        });
    }

    async createTag(tagData) {
        try {
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tagData)
            });
            
            if (!response.ok) throw new Error('Failed to create tag');
            
            const result = await response.json();
            await this.loadTags();
            this.renderInterface();
            
            this.showNotification(`Tag "${tagData.name}" created successfully`, 'success');
            return result;
        } catch (error) {
            console.error('Error creating tag:', error);
            this.showNotification('Failed to create tag', 'error');
            throw error;
        }
    }

    async editTag(tagId) {
        const tag = this.tags.get(tagId);
        if (!tag) return;

        this.showEditTagModal(tag);
    }

    async updateTag(tagId, updates) {
        try {
            const response = await fetch(`/api/tags/${tagId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) throw new Error('Failed to update tag');
            
            const result = await response.json();
            await this.loadTags();
            this.renderInterface();
            
            this.showNotification(`Tag updated successfully`, 'success');
            return result;
        } catch (error) {
            console.error('Error updating tag:', error);
            this.showNotification('Failed to update tag', 'error');
            throw error;
        }
    }

    async deleteTag(tagId) {
        const tag = this.tags.get(tagId);
        if (!tag) return;

        if (!confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/tags/${tagId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete tag');
            
            await this.loadTags();
            this.renderInterface();
            
            this.showNotification(`Tag "${tag.name}" deleted successfully`, 'success');
            
        } catch (error) {
            console.error('Error deleting tag:', error);
            this.showNotification('Failed to delete tag', 'error');
        }
    }

    showCreateTagModal() {
        this.showTagModal();
    }

    showEditTagModal(tag) {
        this.showTagModal(tag);
    }

    showTagModal(tag = null) {
        const isEdit = !!tag;
        const modalTitle = isEdit ? 'Edit Tag' : 'Create New Tag';
        
        const modalHtml = `
            <div class="tag-modal">
                <div class="modal-header">
                    <h3>${modalTitle}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="tagForm">
                        <div class="form-group">
                            <label for="tagName">Name *</label>
                            <input type="text" id="tagName" value="${tag?.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="tagSlug">Slug (use / for hierarchy, e.g., tech/ai)</label>
                            <input type="text" id="tagSlug" value="${tag?.slug || ''}" placeholder="e.g., tech/ai or projects/personal">
                        </div>
                        <div class="form-group">
                            <label for="tagDescription">Description</label>
                            <textarea id="tagDescription" rows="3" placeholder="Optional description for this tag">${tag?.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="tagColor">Color</label>
                            <input type="color" id="tagColor" value="${tag?.color || '#3498db'}">
                        </div>
                        ${isEdit ? '' : `
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="createTemplate"> Create as template
                            </label>
                        </div>
                        `}
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" id="cancelTag">Cancel</button>
                    <button type="button" class="btn-primary" id="saveTag">${isEdit ? 'Update' : 'Create'}</button>
                </div>
            </div>
        `;

        this.showModal(modalHtml, () => {
            this.handleTagSave(isEdit, tag);
        });
    }

    handleTagSave(isEdit, existingTag) {
        const name = document.getElementById('tagName').value.trim();
        const slug = document.getElementById('tagSlug').value.trim();
        const description = document.getElementById('tagDescription').value.trim();
        const color = document.getElementById('tagColor').value;
        
        if (!name) {
            alert('Tag name is required');
            return;
        }

        const tagData = {
            name,
            slug: slug || null,
            description: description || null,
            color
        };

        if (isEdit) {
            this.updateTag(existingTag.id, tagData);
        } else {
            this.createTag(tagData);
        }

        this.closeModal();
    }

    showTagTemplatesModal() {
        const modalHtml = `
            <div class="tag-templates-modal">
                <div class="modal-header">
                    <h3>Tag Templates</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="templates-list">
                        ${this.renderTagTemplates()}
                    </div>
                    <div class="template-actions">
                        <button id="createTemplateBtn" class="btn-primary">Create New Template</button>
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHtml);
    }

    showBulkOperationsModal() {
        const modalHtml = `
            <div class="bulk-operations-modal">
                <div class="modal-header">
                    <h3>Bulk Tag Operations</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="bulk-section">
                        <h4>Select Notes</h4>
                        <div class="note-selection">
                            <input type="text" id="noteSearchInput" placeholder="Search notes...">
                            <div id="notesList" class="notes-list">
                                <div class="loading">Loading notes...</div>
                            </div>
                        </div>
                    </div>
                    <div class="bulk-section">
                        <h4>Select Tags</h4>
                        <div class="tag-selection">
                            <input type="text" id="bulkTagSearchInput" placeholder="Search tags...">
                            <div id="bulkTagsList" class="bulk-tags-list">
                                <!-- Tags will be populated here -->
                            </div>
                        </div>
                    </div>
                    <div class="bulk-actions">
                        <button id="applyTagsBtn" class="btn-primary">Apply Tags</button>
                        <button id="removeTagsBtn" class="btn-danger">Remove Tags</button>
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHtml, null, () => {
            // Load notes and set up bulk operations
            this.loadNotesForBulkOperations();
            this.setupBulkOperationsEvents();
        });
    }

    async loadNotesForBulkOperations() {
        try {
            // Fetch all notes from the tree API
            const response = await fetch('/api/tree');
            if (!response.ok) throw new Error('Failed to load notes');
            
            const treeData = await response.json();
            const notesList = document.getElementById('notesList');
            
            if (!notesList) return;
            
            const notes = this.extractNotesFromTree(treeData);
            this.renderNotesForBulkOperations(notes);
            this.renderTagsForBulkOperations();
            
        } catch (error) {
            console.error('Error loading notes for bulk operations:', error);
            const notesList = document.getElementById('notesList');
            if (notesList) {
                notesList.innerHTML = '<div class="error">Failed to load notes</div>';
            }
        }
    }

    extractNotesFromTree(nodes) {
        const notes = [];
        
        const extractRecursive = (nodeList) => {
            nodeList.forEach(node => {
                if (node.type === 'note') {
                    notes.push({
                        id: node.id,
                        name: node.name,
                        path: this.getNodePath(node, nodeList)
                    });
                }
                if (node.children) {
                    extractRecursive(node.children);
                }
            });
        };
        
        extractRecursive(nodes);
        return notes;
    }

    getNodePath(targetNode, allNodes, path = []) {
        // Simple path calculation - could be improved with parent references
        return targetNode.name; // Simplified for now
    }

    renderNotesForBulkOperations(notes) {
        const notesList = document.getElementById('notesList');
        if (!notesList) return;

        notesList.innerHTML = '';
        
        if (notes.length === 0) {
            notesList.innerHTML = '<div class="no-items">No notes found</div>';
            return;
        }

        notes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'note-item';
            noteItem.innerHTML = `
                <input type="checkbox" id="note-${note.id}" value="${note.id}">
                <label for="note-${note.id}">${note.name}</label>
            `;
            notesList.appendChild(noteItem);
        });
    }

    renderTagsForBulkOperations() {
        const tagsList = document.getElementById('bulkTagsList');
        if (!tagsList) return;

        tagsList.innerHTML = '';
        
        const sortedTags = Array.from(this.tags.values()).sort((a, b) => a.name.localeCompare(b.name));

        sortedTags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'bulk-tag-item';
            tagItem.innerHTML = `
                <input type="checkbox" id="bulk-tag-${tag.id}" value="${tag.id}">
                <label for="bulk-tag-${tag.id}">
                    <span class="tag-name">${tag.name}</span>
                    ${tag.slug ? `<span class="tag-slug">${tag.slug}</span>` : ''}
                    <span class="tag-usage">(${tag.usage_count || 0})</span>
                </label>
            `;
            tagsList.appendChild(tagItem);
        });
    }

    setupBulkOperationsEvents() {
        // Search functionality for notes
        const noteSearchInput = document.getElementById('noteSearchInput');
        if (noteSearchInput) {
            noteSearchInput.addEventListener('input', (e) => {
                this.filterNotes(e.target.value);
            });
        }

        // Search functionality for tags
        const tagSearchInput = document.getElementById('bulkTagSearchInput');
        if (tagSearchInput) {
            tagSearchInput.addEventListener('input', (e) => {
                this.filterBulkTags(e.target.value);
            });
        }

        // Bulk action buttons
        document.getElementById('applyTagsBtn')?.addEventListener('click', () => {
            this.performBulkTagOperation('apply');
        });

        document.getElementById('removeTagsBtn')?.addEventListener('click', () => {
            this.performBulkTagOperation('remove');
        });
    }

    filterNotes(query) {
        const noteItems = document.querySelectorAll('.note-item');
        noteItems.forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase();
            const matches = label.includes(query.toLowerCase());
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    filterBulkTags(query) {
        const tagItems = document.querySelectorAll('.bulk-tag-item');
        tagItems.forEach(item => {
            const tagName = item.querySelector('.tag-name').textContent.toLowerCase();
            const tagSlug = item.querySelector('.tag-slug')?.textContent?.toLowerCase() || '';
            const matches = tagName.includes(query.toLowerCase()) || tagSlug.includes(query.toLowerCase());
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    async performBulkTagOperation(operation) {
        const selectedNotes = Array.from(document.querySelectorAll('#notesList input:checked')).map(cb => cb.value);
        const selectedTags = Array.from(document.querySelectorAll('#bulkTagsList input:checked')).map(cb => cb.value);

        if (selectedNotes.length === 0) {
            this.showNotification('Please select at least one note', 'warning');
            return;
        }

        if (selectedTags.length === 0) {
            this.showNotification('Please select at least one tag', 'warning');
            return;
        }

        try {
            const promises = selectedNotes.map(noteId => {
                if (operation === 'apply') {
                    return this.applyTagsToNote(noteId, selectedTags);
                } else {
                    return this.removeTagsFromNote(noteId, selectedTags);
                }
            });

            await Promise.all(promises);
            
            this.showNotification(
                `Successfully ${operation === 'apply' ? 'applied' : 'removed'} tags ${operation === 'apply' ? 'to' : 'from'} ${selectedNotes.length} note(s)`,
                'success'
            );
            
            this.closeModal();
            await this.loadTags();
            this.renderInterface();
            
        } catch (error) {
            console.error(`Error during bulk tag ${operation}:`, error);
            this.showNotification(`Failed to ${operation} tags`, 'error');
        }
    }

    async applyTagsToNote(noteId, tagIds) {
        try {
            const response = await fetch(`/api/notes/${noteId}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagIds })
            });
            
            if (!response.ok) throw new Error('Failed to apply tags');
            return await response.json();
        } catch (error) {
            console.error(`Error applying tags to note ${noteId}:`, error);
            throw error;
        }
    }

    async removeTagsFromNote(noteId, tagIds) {
        try {
            // Get current tags and filter out the ones to remove
            const currentTagsResponse = await fetch(`/api/notes/${noteId}/tags`);
            if (!currentTagsResponse.ok) throw new Error('Failed to get current tags');
            
            const currentTags = await currentTagsResponse.json();
            const remainingTagIds = currentTags.tags
                .map(tag => tag.id)
                .filter(id => !tagIds.includes(id));

            const response = await fetch(`/api/notes/${noteId}/tags`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagIds: remainingTagIds })
            });
            
            if (!response.ok) throw new Error('Failed to remove tags');
            return await response.json();
        } catch (error) {
            console.error(`Error removing tags from note ${noteId}:`, error);
            throw error;
        }
    }

    renderTagTemplates() {
        let html = '';
        this.tagTemplates.forEach((template, templateId) => {
            html += `
                <div class="template-item" data-template-id="${templateId}">
                    <div class="template-info">
                        <div class="template-name">${template.name}</div>
                        <div class="template-description">${template.description}</div>
                        <div class="template-tags">
                            ${template.tags.map(tag => `<span class="template-tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    <div class="template-actions">
                        <button class="apply-template" data-template-id="${templateId}">Apply</button>
                        <button class="edit-template" data-template-id="${templateId}">Edit</button>
                        <button class="delete-template" data-template-id="${templateId}">Delete</button>
                    </div>
                </div>
            `;
        });
        return html;
    }

    initializeDefaultTemplates() {
        // Default tag templates for different note types
        this.tagTemplates.set('research', {
            name: 'Research',
            description: 'Tags for research notes',
            tags: ['research', 'academic', 'source', 'reference']
        });

        this.tagTemplates.set('todo', {
            name: 'Todo',
            description: 'Tags for task and todo notes',
            tags: ['todo', 'task', 'priority', 'deadline']
        });

        this.tagTemplates.set('meeting', {
            name: 'Meeting',
            description: 'Tags for meeting notes',
            tags: ['meeting', 'notes', 'action-items', 'follow-up']
        });

        this.tagTemplates.set('project', {
            name: 'Project',
            description: 'Tags for project-related notes',
            tags: ['project', 'planning', 'progress', 'milestone']
        });
    }

    showModal(html, onSave = null, onCreated = null) {
        // Remove existing modal if any
        this.closeModal();

        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-overlay';
        modalContainer.innerHTML = html;

        document.body.appendChild(modalContainer);

        // Add event listeners
        modalContainer.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
        modalContainer.querySelector('#cancelTag')?.addEventListener('click', () => this.closeModal());
        modalContainer.querySelector('#saveTag')?.addEventListener('click', onSave);

        // Close on overlay click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                this.closeModal();
            }
        });

        // Call post-creation callback if provided
        if (onCreated) {
            onCreated();
        }
    }

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    showNotification(message, type = 'info') {
        // Use the existing notification system if available
        if (window.notifications && typeof window.notifications.show === 'function') {
            window.notifications.show(message, type);
        } else {
            // Fallback to alert
            if (type === 'error') {
                alert('Error: ' + message);
            } else if (type === 'warning') {
                alert('Warning: ' + message);
            } else {
                console.log(message);
            }
        }
    }

    // Helper method to get related tags for suggestions
    getRelatedTags(tagId) {
        const tag = this.tags.get(tagId);
        if (!tag) return [];

        const related = new Set();

        // Add parent and sibling tags
        if (tag.parentId) {
            related.add(tag.parentId);
            const parent = this.tags.get(tag.parentId);
            if (parent) {
                parent.children.forEach(childId => {
                    if (childId !== tagId) {
                        related.add(childId);
                    }
                });
            }
        }

        // Add child tags
        tag.children.forEach(childId => {
            related.add(childId);
        });

        // Add tags from same category
        const categoryTags = this.tagCategories.get(tag.category)?.tags || [];
        categoryTags.forEach(catTagId => {
            if (catTagId !== tagId) {
                related.add(catTagId);
            }
        });

        return Array.from(related).slice(0, 5); // Limit to 5 suggestions
    }

    // Method to auto-apply parent tags when child tag is applied
    applyTagDependencies(tagId) {
        const dependencies = [];
        const tag = this.tags.get(tagId);
        
        if (tag && tag.parentId) {
            dependencies.push(tag.parentId);
            // Recursively get all parent dependencies
            const parentDeps = this.applyTagDependencies(tag.parentId);
            dependencies.push(...parentDeps);
        }
        
        return dependencies;
    }

    // Export/Import functionality
    exportTags() {
        try {
            const exportData = {
                tags: Array.from(this.tags.values()),
                categories: Array.from(this.tagCategories.entries()),
                templates: Array.from(this.tagTemplates.entries()),
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `tags-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('Tags exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting tags:', error);
            this.showNotification('Failed to export tags', 'error');
        }
    }

    importTags() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);
                    this.processImportedTags(importData);
                } catch (error) {
                    console.error('Error parsing import file:', error);
                    this.showNotification('Invalid import file format', 'error');
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    async processImportedTags(importData) {
        try {
            if (!importData.tags || !Array.isArray(importData.tags)) {
                throw new Error('Invalid import data: missing tags array');
            }

            const confirmMessage = `This will import ${importData.tags.length} tags. Continue?`;
            if (!confirm(confirmMessage)) return;

            let successCount = 0;
            let errorCount = 0;

            for (const tagData of importData.tags) {
                try {
                    // Remove ID to avoid conflicts
                    const { id, ...tagWithoutId } = tagData;
                    await this.createTag(tagWithoutId);
                    successCount++;
                } catch (error) {
                    console.error(`Error importing tag ${tagData.name}:`, error);
                    errorCount++;
                }
            }

            await this.loadTags();
            this.renderInterface();

            const message = `Import completed: ${successCount} tags imported${errorCount > 0 ? `, ${errorCount} failed` : ''}`;
            this.showNotification(message, errorCount > 0 ? 'warning' : 'success');

        } catch (error) {
            console.error('Error processing imported tags:', error);
            this.showNotification('Failed to import tags', 'error');
        }
    }
}

// Initialize tags manager
window.tagsManager = new TagsManager();

// Make it globally available
window.TagsManager = TagsManager;

console.log('Tags Manager loaded');
