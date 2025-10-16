/**
 * Comprehensive Tag Management System
 * Features:
 * - Tag Library with usage counts and descriptions
 * - Hierarchical tags support (e.g., #tech/ai, #projects/personal)
 * - Search & Filter with autocomplete
 * - Bulk operations for applying/removing tags
 * - Tag dependencies (auto-apply parent tags)
 * - Related tags suggestions
 */

class TagsManager {
    constructor() {
        this.tags = new Map();
        this.tagCategories = new Map();
        this.tagHierarchy = new Map();
        this.relatedTags = new Map();
        this.currentView = 'grid';
        this.currentSort = 'name';
        this.sortOrder = 'asc';
        this.searchQuery = '';
        this.selectedTags = new Set();
        this.selectionMode = false; // New: track if we're in selection mode
        this.isInitialized = false;
        this.searchTimeout = null;
    }

    async init() {
        if (this.isInitialized) return;
        
        console.log('Initializing Tags Manager...');
        
        try {
            this.setupEventListeners();
            await this.loadTags();
            this.renderInterface();
            this.isInitialized = true;
            console.log('Tags Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Tags Manager:', error);
        }
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('tagsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.handleSearch('');
                }
            });
        }        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Shift + T to open tags in settings modal
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                if (window.settingsModal && typeof window.settingsModal.open === 'function') {
                    window.settingsModal.open('tags');
                }
            }
        });

        // View controls
        document.getElementById('tagsGridViewBtn')?.addEventListener('click', () => this.setView('grid'));
        document.getElementById('tagsListViewBtn')?.addEventListener('click', () => this.setView('list'));
        document.getElementById('tagsHierarchyViewBtn')?.addEventListener('click', () => this.setView('hierarchy'));
        document.getElementById('tagsGraphViewBtn')?.addEventListener('click', () => this.setView('graph'));

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

        // Selection mode toggle
        const selectionToggleBtn = document.getElementById('tagsSelectionToggle');
        if (selectionToggleBtn) {
            selectionToggleBtn.addEventListener('click', () => this.toggleSelectionMode());
        }

        // Select all / Deselect all
        document.getElementById('tagsSelectAll')?.addEventListener('click', () => this.selectAllTags());
        document.getElementById('tagsDeselectAll')?.addEventListener('click', () => this.deselectAllTags());

        // Bulk actions menu
        const bulkBtn = document.getElementById('tagsBulkActionsBtn');
        const bulkMenu = document.getElementById('tagsBulkMenu');
        
        if (bulkBtn && bulkMenu) {
            bulkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                bulkMenu.classList.toggle('is-hidden');
            });
            
            // Hide menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!bulkMenu.contains(e.target) && e.target !== bulkBtn) {
                    bulkMenu.classList.add('is-hidden');
                }
            });
        }

        // Bulk selection actions
        const bulkDeleteBtn = document.getElementById('tagsBulkDelete');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.handleBulkDelete();
                bulkMenu?.classList.add('is-hidden');
            });
        }

        const bulkMergeBtn = document.getElementById('tagsBulkMerge');
        if (bulkMergeBtn) {
            bulkMergeBtn.addEventListener('click', () => {
                this.handleBulkMerge();
                bulkMenu?.classList.add('is-hidden');
            });
        }

        const bulkMakeChildBtn = document.getElementById('tagsBulkMakeChild');
        if (bulkMakeChildBtn) {
            bulkMakeChildBtn.addEventListener('click', () => {
                this.handleBulkMakeChild();
                bulkMenu?.classList.add('is-hidden');
            });
        }

        const hierarchyFilter = document.getElementById('tagsHierarchyFilter');
        if (hierarchyFilter) {
            hierarchyFilter.addEventListener('change', () => this.renderTags());
        }

        // Action buttons
        document.getElementById('createTagBtn')?.addEventListener('click', () => this.showCreateTagModal());
        document.getElementById('bulkTagsBtn')?.addEventListener('click', () => this.showBulkOperationsModal());
    }

    async loadTags() {
        try {
            const response = await fetch('/api/tags?includeUsage=true&limit=1000');
            if (!response.ok) throw new Error('Failed to load tags');
            
            const data = await response.json();
            const tagsData = data.tags || [];
            
            // Load parent information for each tag
            await this.loadTagParents(tagsData);
            
            this.processTags(tagsData);
            
            console.log(`Loaded ${this.tags.size} tags`);
        } catch (error) {
            console.error('Error loading tags:', error);
            // Initialize with empty state if API fails
            this.tags.clear();
            
            // Show user-friendly message
            this.showNotification('Failed to load tags. Please check your connection.', 'error');
        }
    }

    async loadTagParents(tagsData) {
        // Load parent information for all tags in parallel
        const parentPromises = tagsData.map(async tag => {
            try {
                const response = await fetch(`/api/tags/${tag.id}/parents`);
                if (response.ok) {
                    const data = await response.json();
                    tag.parentIds = data.parentIds || [];
                }
            } catch (error) {
                console.warn(`Failed to load parents for tag ${tag.id}:`, error);
                tag.parentIds = [];
            }
        });
        
        await Promise.all(parentPromises);
    }

    processTags(tagsData) {
        this.tags.clear();
        this.tagCategories.clear();
        this.tagHierarchy.clear();

        tagsData.forEach(tag => {
            // Process hierarchical slug (keep for backwards compatibility)
            const slugParts = tag.slug ? tag.slug.split('/') : [];
            
            // Get all categories from all parents (multi-parent support)
            const categories = new Set();
            
            if (tag.parentIds && tag.parentIds.length > 0) {
                // Get root-level parents (categories)
                tag.parentIds.forEach(parentId => {
                    const parent = tagsData.find(t => t.id === parentId);
                    if (parent) {
                        // Get the root ancestor of this parent
                        const rootAncestor = this.getRootAncestor(parent, tagsData);
                        if (rootAncestor) {
                            categories.add(rootAncestor.name);
                        }
                    }
                });
            }
            
            // Fallback to slug-based category if no parents
            if (categories.size === 0) {
                const slugCategory = slugParts.length > 1 ? slugParts[0] : 'General';
                categories.add(slugCategory);
            }
            
            // Store tag data with all categories
            const categoriesArray = Array.from(categories);
            this.tags.set(tag.id, {
                ...tag,
                categories: categoriesArray,
                category: categoriesArray[0] || 'General', // Primary category for backwards compatibility
                level: slugParts.length - 1,
                parentSlug: slugParts.length > 1 ? slugParts.slice(0, -1).join('/') : null,
                children: []
            });

            // Track all categories
            categoriesArray.forEach(category => {
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
        });

        // Build hierarchy relationships
        this.buildHierarchy();
    }

    getRootAncestor(tag, allTags) {
        // Find the root-level ancestor (category) of a tag
        if (!tag.parentIds || tag.parentIds.length === 0) {
            return tag; // This is a root tag (category)
        }
        
        // Get the first parent and recursively find its root
        const parentId = tag.parentIds[0];
        const parent = allTags.find(t => t.id === parentId);
        
        if (parent) {
            return this.getRootAncestor(parent, allTags);
        }
        
        return tag; // Fallback
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

    getParentPaths(tag) {
        // Get all parent paths for a tag (multi-parent support)
        if (!tag.parentIds || tag.parentIds.length === 0) {
            return [];
        }
        
        return tag.parentIds.map(parentId => {
            const parent = this.tags.get(parentId);
            return parent ? parent.name : parentId;
        }).filter(Boolean);
    }

    getFullHierarchyPaths(tag) {
        // Get all full hierarchical paths for a tag (e.g., "italian/rice", "spanish/rice")
        if (!tag.parentIds || tag.parentIds.length === 0) {
            return [tag.name]; // Root level tag
        }
        
        const paths = [];
        for (const parentId of tag.parentIds) {
            const parent = this.tags.get(parentId);
            if (parent) {
                // Recursively get parent's paths
                const parentPaths = this.getFullHierarchyPaths(parent);
                // Append current tag name to each parent path
                parentPaths.forEach(parentPath => {
                    paths.push(`${parentPath} › ${tag.name}`);
                });
            }
        }
        
        return paths.length > 0 ? paths : [tag.name];
    }

    renderInterface() {
        this.renderCategories();
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

    renderTags() {
        const filteredTags = this.getFilteredTags();
        const sortedTags = this.sortTags(filteredTags);

        // Show/hide views
        document.getElementById('tagsGridView')?.classList.toggle('is-hidden', this.currentView !== 'grid');
        document.getElementById('tagsListView')?.classList.toggle('is-hidden', this.currentView !== 'list');
        document.getElementById('tagsHierarchyView')?.classList.toggle('is-hidden', this.currentView !== 'hierarchy');
        document.getElementById('tagsGraphView')?.classList.toggle('is-hidden', this.currentView !== 'graph');

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
            tagCard.setAttribute('data-tag-id', tag.id); // Add data attribute for finding the element
            if (this.selectedTags.has(tag.id)) {
                tagCard.classList.add('selected');
            }
            
            // Get color for tag (fallback to default if not set)
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();
            
            // Get full hierarchy paths for display (e.g., "italian › rice", "spanish › rice")
            const hierarchyPaths = this.getFullHierarchyPaths(tag);
            const pathsDisplay = hierarchyPaths.length > 0 && hierarchyPaths[0] !== tag.name
                ? `<div class="tag-hierarchy-paths"><i class="fas fa-sitemap"></i> ${hierarchyPaths.join(' | ')}</div>`
                : '';
            
            tagCard.innerHTML = `
                ${this.selectionMode ? `
                    <div class="tag-select-wrapper">
                        <input type="checkbox" class="tag-select-checkbox" data-tag-id="${tag.id}" ${this.selectedTags.has(tag.id) ? 'checked' : ''}>
                    </div>
                ` : ''}
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
                ${pathsDisplay}
                <div class="tag-description">${tag.description || 'No description'}</div>
                <div class="tag-footer">
                    <div class="tag-usage">
                        <i class="fas fa-sticky-note"></i>
                        ${tag.usage || 0} notes
                    </div>
                    <div class="tag-categories">
                        ${tag.categories && tag.categories.length > 0 
                            ? tag.categories.map(cat => `<span class="tag-category-badge">${cat}</span>`).join('')
                            : '<span class="tag-category-badge">General</span>'
                        }
                    </div>
                </div>
            `;

            // Add event listeners
            const editBtn = tagCard.querySelector('.edit-tag');
            const deleteBtn = tagCard.querySelector('.delete-tag');
            
            if (this.selectionMode) {
                const checkbox = tagCard.querySelector('.tag-select-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleTagSelection(tag.id, e);
                    });
                }
                
                // Still allow edit/delete in selection mode, but don't toggle selection
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.editTag(tag.id);
                    });
                }
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteTag(tag.id);
                    });
                }
                
                // Click on card toggles selection
                tagCard.addEventListener('click', (e) => {
                    if (!e.target.closest('.tag-action-btn') && !e.target.closest('.tag-select-checkbox')) {
                        this.handleTagSelection(tag.id, e);
                    }
                });
            } else {
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.editTag(tag.id);
                    });
                }
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteTag(tag.id);
                    });
                }
                tagCard.addEventListener('click', (e) => {
                    if (!e.target.closest('.tag-action-btn')) {
                        this.selectTag(tag.id);
                    }
                });
            }

            container.appendChild(tagCard);
        });
    }

    renderListView(tags) {
        const container = document.getElementById('tagsListView');
        if (!container) return;

        container.innerHTML = `
            <div class="tags-list-header">
                ${this.selectionMode ? '<div class="list-col-select"></div>' : ''}
                <div class="list-col-name">Name</div>
                <div class="list-col-slug">Hierarchy Paths</div>
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
            row.setAttribute('data-tag-id', tag.id); // Add data attribute for finding the element
            if (this.selectedTags.has(tag.id)) {
                row.classList.add('selected');
            }
            
            // Get color for tag (fallback to default if not set)
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();
            
            // Get full hierarchy paths
            const hierarchyPaths = this.getFullHierarchyPaths(tag);
            const pathsText = hierarchyPaths.length > 0 && hierarchyPaths[0] !== tag.name
                ? hierarchyPaths.join(' | ')
                : 'Root level';
            
            row.innerHTML = `
                ${this.selectionMode ? `
                    <div class="list-col-select">
                        <input type="checkbox" class="tag-select-checkbox" data-tag-id="${tag.id}" ${this.selectedTags.has(tag.id) ? 'checked' : ''}>
                    </div>
                ` : ''}
                <div class="list-col-name">
                    <div class="tag-name">
                        <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                        ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}${tag.name}
                    </div>
                    <div class="tag-description">${tag.description || ''}</div>
                </div>
                <div class="list-col-slug" title="${pathsText}">${pathsText}</div>
                <div class="list-col-usage">${tag.usage || 0}</div>
                <div class="list-col-category">
                    ${tag.categories && tag.categories.length > 0 
                        ? tag.categories.map(cat => `<span class="tag-category-badge">${cat}</span>`).join(' ')
                        : '<span class="tag-category-badge">General</span>'
                    }
                </div>
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
            const editBtn = row.querySelector('.edit-tag');
            const deleteBtn = row.querySelector('.delete-tag');
            
            if (this.selectionMode) {
                const checkbox = row.querySelector('.tag-select-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleTagSelection(tag.id, e);
                    });
                }
                
                // Still allow edit/delete in selection mode
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.editTag(tag.id);
                    });
                }
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteTag(tag.id);
                    });
                }
                
                // Click on row toggles selection
                row.addEventListener('click', (e) => {
                    if (!e.target.closest('.tag-action-btn') && !e.target.closest('.tag-select-checkbox')) {
                        this.handleTagSelection(tag.id, e);
                    }
                });
            } else {
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.editTag(tag.id);
                    });
                }
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteTag(tag.id);
                    });
                }
                row.addEventListener('click', (e) => {
                    if (!e.target.closest('.tag-action-btn')) {
                        this.selectTag(tag.id);
                    }
                });
            }

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
                
                // Get full hierarchy paths
                const hierarchyPaths = this.getFullHierarchyPaths(tag);
                const pathsText = hierarchyPaths.length > 0 && hierarchyPaths[0] !== tag.name
                    ? hierarchyPaths.join(' | ')
                    : 'Root level';
                
                tagEl.innerHTML = `
                    <div class="tag-info">
                        <div class="tag-name">
                            <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                            ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}${tag.name}
                        </div>
                        <div class="tag-slug" title="${pathsText}">${pathsText}</div>
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

    async initGraphView() {
        console.log('[TagsManager] Initializing graph view...');
        const container = document.getElementById('tagsGraphView');
        if (!container) {
            console.error('[TagsManager] Graph view container not found');
            return;
        }

        console.log('[TagsManager] Container found:', container);

        // Clear container
        container.innerHTML = '';

        // Check if D3 is loaded
        if (typeof d3 === 'undefined') {
            console.error('[TagsManager] D3.js is not loaded');
            container.innerHTML = `
                <div class="graph-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="empty-title">D3.js Required</div>
                    <div class="empty-description">
                        The graph visualization requires D3.js library. 
                        Please include D3.js in your project.
                    </div>
                </div>
            `;
            console.error('D3.js is not loaded. Please include it in your HTML.');
            return;
        }

        // Show loading
        container.innerHTML = `
            <div class="graph-loading">
                <i class="fas fa-spinner"></i>
                <div class="loading-text">Building graph...</div>
            </div>
        `;

        try {
            // Dynamically import the graph view
            console.log('[TagsManager] Importing graph module...');
            const { default: TagGraphView } = await import('./graph-BcAW7KVI.js');
            console.log('[TagsManager] Graph module imported successfully');
            
            // Create graph container structure
            container.innerHTML = `
                <div class="graph-view-header">
                    <div class="graph-view-title">
                        <i class="fas fa-project-diagram"></i>
                        Tag Relationships
                    </div>
                    <div class="graph-controls">
                        <div class="graph-control-group">
                            <label class="graph-control-label">Layout</label>
                            <select class="graph-layout-select" id="graphLayoutSelect">
                                <option value="force">Force-Directed</option>
                                <option value="radial">Radial</option>
                                <option value="hierarchical">Hierarchical</option>
                                <option value="circular">Circular</option>
                            </select>
                        </div>
                        <div class="graph-control-group graph-spacing-group">
                            <label class="graph-control-label">
                                Spacing: <span id="graphStrengthValue">Medium</span>
                            </label>
                            <input type="range" class="graph-strength-slider" id="graphStrengthSlider" 
                                   min="150" max="600" value="300" step="25">
                        </div>
                        <div class="graph-control-buttons">
                            <button class="graph-control-btn" id="graphToggleLabels" title="Toggle Labels">
                                <i class="fas fa-tag"></i>
                            </button>
                            <button class="graph-control-btn" id="graphResetZoom" title="Reset Zoom">
                                <i class="fas fa-search-minus"></i>
                            </button>
                            <button class="graph-control-btn" id="graphFullscreen" title="Fullscreen">
                                <i class="fas fa-expand"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="tags-graph-container" id="tagsGraphContainer">
                    <!-- Graph will be rendered here -->
                </div>
            `;

            // Initialize graph view
            console.log('[TagsManager] Creating TagGraphView instance...');
            this.graphView = new TagGraphView(this);
            await this.graphView.init();
            console.log('[TagsManager] Graph view initialized successfully');

            // Add fullscreen handler
            document.getElementById('graphFullscreen')?.addEventListener('click', () => {
                const graphContainer = document.getElementById('tagsGraphView');
                if (graphContainer) {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        graphContainer.requestFullscreen();
                    }
                }
            });

        } catch (error) {
            console.error('Failed to initialize graph view:', error);
            container.innerHTML = `
                <div class="graph-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="empty-title">Failed to Load Graph</div>
                    <div class="empty-description">
                        ${error.message || 'An error occurred while loading the graph visualization.'}
                    </div>
                </div>
            `;
        }
    }

    getUniqueCategoriesForFilter() {
        const categories = new Set();
        this.tags.forEach(tag => {
            if (tag.category && tag.category !== 'default') {
                categories.add(tag.category);
            }
        });
        return Array.from(categories).sort();
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

        // Filter by category (supports multi-category tags)
        const categoryFilter = document.getElementById('tagsCategoryFilter')?.value;
        if (categoryFilter && categoryFilter !== '') {
            filtered = filtered.filter(tag => {
                // Check if tag has the category in its categories array
                if (tag.categories && Array.isArray(tag.categories)) {
                    return tag.categories.includes(categoryFilter);
                }
                // Fallback to single category for backward compatibility
                return tag.category === categoryFilter;
            });
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
            
            // If in graph view, trigger the graph filter
            if (this.currentView === 'graph' && this.graphView) {
                this.graphView.handleCategoryFilter(category);
            } else {
                this.renderTags();
            }
        }
    }

    async setView(view) {
        this.currentView = view;
        
        // Clear selected tags and remove details panel when changing views
        this.selectedTags.clear();
        const existingPanel = document.getElementById('tagDetailsPanel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // Update view button states
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tags${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`)?.classList.add('active');
        
        // Show/hide views
        document.getElementById('tagsGridView')?.classList.toggle('is-hidden', view !== 'grid');
        document.getElementById('tagsListView')?.classList.toggle('is-hidden', view !== 'list');
        document.getElementById('tagsHierarchyView')?.classList.toggle('is-hidden', view !== 'hierarchy');
        document.getElementById('tagsGraphView')?.classList.toggle('is-hidden', view !== 'graph');
        
        // If switching to graph view, initialize it
        if (view === 'graph') {
            await this.initGraphView();
        } else {
            // Cleanup graph view if switching away
            if (this.graphView) {
                this.graphView.destroy();
                this.graphView = null;
            }
            this.renderTags();
        }
    }

    selectTag(tagId) {
        // For single-selection mode, show tag details
        if (!this.selectedTags.has(tagId)) {
            this.selectedTags.clear(); // Single selection
            this.selectedTags.add(tagId);
            this.showTagDetails(tagId);
        } else {
            this.selectedTags.delete(tagId);
            // Remove the details panel when unselecting
            const existingPanel = document.getElementById('tagDetailsPanel');
            if (existingPanel) {
                existingPanel.remove();
            }
        }
        
        // Update visual selection
        this.updateTagSelection();
    }

    async showTagDetails(tagId) {
        try {
            const tag = this.tags.get(tagId);
            if (!tag) return;

            // Remove any existing details panel
            const existingPanel = document.getElementById('tagDetailsPanel');
            if (existingPanel) {
                existingPanel.remove();
            }

            // Create tag details panel
            const detailsPanel = document.createElement('div');
            detailsPanel.id = 'tagDetailsPanel';
            detailsPanel.className = 'tag-details-panel';
            
            // Insert panel based on current view
            if (this.currentView === 'graph' || this.currentView === 'hierarchy') {
                // For graph/hierarchy view, append to the view container
                const viewContainer = document.getElementById(this.currentView === 'graph' ? 'tagsGraphView' : 'tagsHierarchyView');
                if (viewContainer) {
                    viewContainer.appendChild(detailsPanel);
                } else {
                    return;
                }
            } else {
                // For grid/list view, find the clicked tag element within the current view container
                let tagElement;
                if (this.currentView === 'grid') {
                    tagElement = document.querySelector(`#tagsGridView .tag-card[data-tag-id="${tagId}"]`);
                } else if (this.currentView === 'list') {
                    tagElement = document.querySelector(`#tagsListView .tag-list-row[data-tag-id="${tagId}"]`);
                }
                
                if (!tagElement) return;
                
                // Insert panel right after the clicked tag element
                tagElement.insertAdjacentElement('afterend', detailsPanel);
                
                // For grid view, position the panel absolutely below the card
                if (this.currentView === 'grid') {
                    const cardRect = tagElement.getBoundingClientRect();
                    const containerRect = tagElement.parentElement.getBoundingClientRect();
                    const topPosition = cardRect.bottom - containerRect.top + tagElement.parentElement.scrollTop;
                    
                    detailsPanel.style.top = `${topPosition}px`;
                    detailsPanel.style.width = `${cardRect.width}px`;
                    detailsPanel.style.left = `${cardRect.left - containerRect.left}px`;
                }
            }

            // Show loading state
            detailsPanel.innerHTML = `
                <div class="tag-details-content">
                    <div class="loading">Loading tag information...</div>
                </div>
            `;

            // Fetch notes that use this tag
            const notesResponse = await fetch(`/api/tags/${tagId}/notes`);
            const notesData = notesResponse.ok ? await notesResponse.json() : { notes: [], count: 0 };

            // Get color for tag
            const tagColor = tag.color && tag.color !== 'default' ? tag.color : '#1DA1F2';
            const hasIcon = tag.icon && tag.icon.trim();

            // Get hierarchy paths and parent info
            const hierarchyPaths = this.getFullHierarchyPaths(tag);
            const parentNames = (tag.parentIds || []).map(pid => {
                const parent = this.tags.get(pid);
                return parent ? parent.name : pid;
            }).filter(Boolean);

            // Render detailed information
            detailsPanel.querySelector('.tag-details-content').innerHTML = `
                <div class="tag-info-section">
                    <div class="tag-main-info">
                        <div class="tag-name-display">
                            <span class="tag-color-indicator" style="background-color: ${tagColor}"></span>
                            ${hasIcon ? `<i class="${tag.icon}"></i> ` : ''}
                            <h4>${tag.name}</h4>
                        </div>
                        ${hierarchyPaths.length > 0 && hierarchyPaths[0] !== tag.name ? `
                            <div class="tag-hierarchy-display">
                                <i class="fas fa-sitemap"></i>
                                <strong>Hierarchy Paths:</strong> ${hierarchyPaths.join(' | ')}
                            </div>
                        ` : ''}
                        ${parentNames.length > 0 ? `
                            <div class="tag-parents-display">
                                <i class="fas fa-layer-group"></i>
                                <strong>Parents:</strong> ${parentNames.join(', ')}
                            </div>
                        ` : ''}
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
                        ${parentNames.length > 0 ? `<div class="tag-stat"><i class="fas fa-sitemap"></i><span>${parentNames.length} parent${parentNames.length > 1 ? 's' : ''}</span></div>` : ''}
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
        if (!noteId) return;
        const noteIdStr = String(noteId);
        let noteTitle = 'Note';
        try {
            if (window.noteTreeView && typeof window.noteTreeView.findNodeById === 'function') {
                const node = window.noteTreeView.findNodeById(window.noteTreeView.nodes || [], noteIdStr);
                if (node && node.name) noteTitle = node.name;
            }
        } catch (_) {}

        if (window.tabManager) {
            if (typeof window.tabManager.updateActiveTabContent === 'function') {
                window.tabManager.updateActiveTabContent('note', noteIdStr, noteTitle);
            } else if (typeof window.tabManager.getOrCreateTabForContent === 'function') {
                window.tabManager.getOrCreateTabForContent('note', noteIdStr, noteTitle);
            }
        }

        let selected = false;
        if (window.noteTreeView && typeof window.noteTreeView.selectNode === 'function') {
            selected = Boolean(window.noteTreeView.selectNode(noteIdStr));
        }

        if (!selected && typeof window.loadNoteContent === 'function') {
            window.__noteSyncExtras = { source: 'tags-panel', state: { keepSidebar: true } };
            window.loadNoteContent(noteIdStr, noteTitle);
        }

        if (!selected) {
            window.__pendingNoteRoute = { id: noteIdStr, title: noteTitle };
        } else if (window.__pendingNoteRoute && window.__pendingNoteRoute.id === noteIdStr) {
            delete window.__pendingNoteRoute;
        }

        if (window.navigateToSection) {
            window.navigateToSection('notes', { params: { note: noteIdStr }, source: 'tags-panel', state: { keepSidebar: true } });
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

    async deleteTag(tagId, skipConfirmation = false) {
        const tag = this.tags.get(tagId);
        if (!tag) return;

        if (!skipConfirmation && !confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/tags/${tagId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete tag');
            
            await this.loadTags();
            this.renderInterface();
            
            if (!skipConfirmation) {
                this.showNotification(`Tag "${tag.name}" deleted successfully`, 'success');
            }
            
        } catch (error) {
            console.error('Error deleting tag:', error);
            if (!skipConfirmation) {
                this.showNotification('Failed to delete tag', 'error');
            }
            throw error;
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
        
        // Get current parents if editing
        const currentParents = isEdit && tag.parentIds ? tag.parentIds.map(pid => {
            const parent = this.tags.get(pid);
            return parent ? { id: parent.id, name: parent.name } : null;
        }).filter(Boolean) : [];
        
        const parentsHtml = currentParents.length > 0 ? currentParents.map(p => `
            <div class="parent-badge" data-parent-id="${p.id}">
                <span>${p.name}</span>
                <button type="button" class="remove-parent" data-parent-id="${p.id}" title="Remove parent">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('') : '<div class="no-parents-message">No parents - this is a root level tag</div>';
        
        const modalHtml = `
            <div class="tag-modal">
                <div class="modal-header">
                    <h3>${modalTitle}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="tagForm">
                        <div class="tag-menu-section">
                            <label class="tag-menu-label" for="tagName">Tag Name *</label>
                            <div class="tag-input-wrapper">
                                <input type="text" id="tagName" class="tag-search-input" value="${tag?.name || ''}" required autocomplete="off" placeholder="Enter tag name">
                                <div class="tag-validation-message" id="tagNameValidation"></div>
                                <div class="tag-suggestions" id="tagNameSuggestions" role="listbox" aria-label="Tag name suggestions"></div>
                            </div>
                        </div>
                        
                        ${isEdit ? `
                        <div class="tag-menu-section">
                            <label class="tag-menu-label">Parent Tags</label>
                            <div class="current-parents-container" id="currentParents">
                                ${parentsHtml}
                            </div>
                            <div class="add-parent-section">
                                <input type="text" id="addParentInput" class="tag-name-input" placeholder="Type to search for a parent tag..." autocomplete="off">
                                <div class="tag-suggestions" id="addParentSuggestions" role="listbox" aria-label="Available parent tags"></div>
                            </div>
                            <div class="form-help">
                                <i class="fas fa-info-circle"></i> 
                                A tag can have multiple parents. Search and click to add, or click × to remove.
                            </div>
                        </div>
                        ` : `
                        <div class="tag-menu-section">
                            <label class="tag-menu-label" for="tagParentPath">Parent Path (Optional)</label>
                            <div class="tag-input-wrapper">
                                <input type="text" id="tagParentPath" class="tag-name-input" value="${this.extractParentPath(tag?.slug || '')}" placeholder="e.g., cooking/italian or leave empty for root level" autocomplete="off">
                                <div class="form-help">Type the parent hierarchy path. Leave empty for root level. You can add more parents after creation.</div>
                                <div class="tag-hierarchy-preview" id="tagHierarchyPreview"></div>
                                <div class="tag-suggestions" id="tagParentPathSuggestions" role="listbox" aria-label="Parent path suggestions"></div>
                            </div>
                        </div>
                        `}
                        
                        <div class="tag-menu-section">
                            <label class="tag-menu-label" for="tagDescription">Description</label>
                            <textarea id="tagDescription" class="tag-name-input" rows="2" placeholder="Optional description for this tag">${tag?.description || ''}</textarea>
                        </div>
                        
                        <div class="tag-menu-section">
                            <label class="tag-menu-label">Color</label>
                            <div class="tag-color-section">
                                <input type="color" id="tagColor" value="${tag?.color || '#3498db'}" style="display: none;">
                                <div class="tag-color-grid" id="tagColorGrid"></div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" id="cancelTag">Cancel</button>
                    <button type="button" class="btn-primary" id="saveTag" disabled>${isEdit ? 'Update' : 'Create'}</button>
                </div>
            </div>
        `;

        this.showModal(modalHtml, () => {
            this.handleTagSave(isEdit, tag);
        }, () => {
            this.setupTagModalEnhancements(isEdit, tag);
        });
    }
    
    extractParentPath(slug) {
        if (!slug) return '';
        const parts = slug.split('/');
        if (parts.length <= 1) return '';
        // Return all parts except the last one (which should be the tag name)
        return parts.slice(0, -1).join('/');
    }
    
    constructFullSlug(parentPath, tagName) {
        if (!parentPath || !parentPath.trim()) {
            return tagName;
        }
        return `${parentPath.trim().replace(/\/$/, '')}/${tagName}`;
    }

    setupTagModalEnhancements(isEdit, tag = null) {
        const nameInput = document.getElementById('tagName');
        const parentPathInput = document.getElementById('tagParentPath');
        const saveButton = document.getElementById('saveTag');
        const colorInput = document.getElementById('tagColor');
        const colorGrid = document.getElementById('tagColorGrid');
        
        // Track validation state
        let isNameValid = isEdit; // If editing, name is initially valid
        let debounceTimeout = null;
        
        // Predefined color palette similar to tag_system.js
        const colorPalette = [
            '#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#2ecc71',
            '#27ae60', '#1abc9c', '#16a085', '#3498db', '#2980b9',
            '#9b59b6', '#8e44ad', '#34495e', '#2c3e50', '#95a5a6', '#7f8c8d'
        ];
        
        // Setup color grid
        this.setupColorGrid(colorGrid, colorInput, colorPalette);
        
        // Setup parent management for edit mode
        if (isEdit) {
            this.setupParentManagement(tag);
        } else {
            // Update hierarchy preview when either name or parent path changes
            const updatePreview = () => {
                const name = nameInput.value.trim();
                const parentPath = parentPathInput.value.trim();
                const fullSlug = this.constructFullSlug(parentPath, name);
                this.updateHierarchyPreview(fullSlug);
            };
            
            // Handle parent path input changes
            parentPathInput.addEventListener('input', (e) => {
                updatePreview();
                this.debounceParentPathSuggestions(e.target.value);
            });
            
            // Handle parent path suggestions
            parentPathInput.addEventListener('focus', () => {
                this.showParentPathSuggestions(parentPathInput.value);
            });
            
            // Initial hierarchy preview
            updatePreview();
        }
        
        // Handle name input changes
        nameInput.addEventListener('input', (e) => {
            const name = e.target.value.trim();
            
            // Clear previous timeout
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
            
            // Debounced validation
            debounceTimeout = setTimeout(async () => {
                await this.validateTagName(name, isEdit ? tag.id : null);
            }, 300);
        });
        
        // Handle tag name suggestions
        nameInput.addEventListener('focus', () => {
            this.showTagNameSuggestions(nameInput.value);
        });
        
        // Hide suggestions on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tag-input-wrapper')) {
                this.hideSuggestions();
            }
        });
        
        // Form validation
        const validateForm = () => {
            const name = nameInput.value.trim();
            const isValid = isNameValid && name.length > 0;
            saveButton.disabled = !isValid;
        };
        
        nameInput.addEventListener('input', validateForm);
        
        // Initial validation
        if (isEdit && tag) {
            isNameValid = true;
            validateForm();
        }
    }

    setupParentManagement(tag) {
        const addParentInput = document.getElementById('addParentInput');
        const currentParentsContainer = document.getElementById('currentParents');
        const addParentSuggestions = document.getElementById('addParentSuggestions');
        
        // Store current parent IDs
        if (!tag.parentIds) {
            tag.parentIds = [];
        }
        
        // Handle remove parent buttons
        currentParentsContainer.addEventListener('click', async (e) => {
            const removeBtn = e.target.closest('.remove-parent');
            if (removeBtn) {
                const parentId = removeBtn.dataset.parentId;
                
                // Remove from API
                try {
                    const response = await fetch(`/api/tags/${tag.id}/parents`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parentId })
                    });
                    
                    if (response.ok) {
                        // Remove from UI
                        const badge = removeBtn.closest('.parent-badge');
                        badge.remove();
                        
                        // Update tag's parentIds
                        tag.parentIds = tag.parentIds.filter(id => id !== parentId);
                        
                        // Show empty message if no parents left
                        if (tag.parentIds.length === 0) {
                            currentParentsContainer.innerHTML = '<div class="no-parents-message">No parents - this is a root level tag</div>';
                        }
                        
                        this.showNotification('Parent removed successfully', 'success');
                    } else {
                        this.showNotification('Failed to remove parent', 'error');
                    }
                } catch (error) {
                    console.error('Error removing parent:', error);
                    this.showNotification('Failed to remove parent', 'error');
                }
            }
        });
        
        // Handle add parent input
        addParentInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            
            if (query.length === 0) {
                addParentSuggestions.innerHTML = '';
                addParentSuggestions.style.display = 'none';
                return;
            }
            
            // Get available parent tags (excluding current tag and its children)
            const availableTags = Array.from(this.tags.values()).filter(t => {
                // Can't be parent of itself
                if (t.id === tag.id) return false;
                // Can't add if already a parent
                if (tag.parentIds.includes(t.id)) return false;
                // Can't add if it would create a cycle (child can't be parent)
                if (this.isDescendant(tag.id, t.id)) return false;
                // Match query
                return t.name.toLowerCase().includes(query);
            });
            
            if (availableTags.length === 0) {
                addParentSuggestions.innerHTML = '<div class="no-suggestions">No matching tags found</div>';
                addParentSuggestions.style.display = 'block';
                return;
            }
            
            addParentSuggestions.innerHTML = availableTags.slice(0, 10).map(t => `
                <div class="suggestion-item" data-tag-id="${t.id}" data-tag-name="${t.name}">
                    <i class="fas fa-tag"></i> ${t.name}
                </div>
            `).join('');
            addParentSuggestions.style.display = 'block';
        });
        
        // Handle parent selection
        addParentSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                const parentId = item.dataset.tagId;
                const parentName = item.dataset.tagName;
                
                // Add parent via API
                try {
                    const response = await fetch(`/api/tags/${tag.id}/parents`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parentId })
                    });
                    
                    if (response.ok) {
                        // Add to UI
                        if (tag.parentIds.length === 0) {
                            currentParentsContainer.innerHTML = '';
                        }
                        
                        const badge = document.createElement('div');
                        badge.className = 'parent-badge';
                        badge.dataset.parentId = parentId;
                        badge.innerHTML = `
                            <span>${parentName}</span>
                            <button type="button" class="remove-parent" data-parent-id="${parentId}" title="Remove parent">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                        currentParentsContainer.appendChild(badge);
                        
                        // Update tag's parentIds
                        tag.parentIds.push(parentId);
                        
                        // Clear input
                        addParentInput.value = '';
                        addParentSuggestions.innerHTML = '';
                        addParentSuggestions.style.display = 'none';
                        
                        this.showNotification('Parent added successfully', 'success');
                    } else {
                        const data = await response.json();
                        this.showNotification(data.error || 'Failed to add parent', 'error');
                    }
                } catch (error) {
                    console.error('Error adding parent:', error);
                    this.showNotification('Failed to add parent', 'error');
                }
            }
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.add-parent-section')) {
                addParentSuggestions.style.display = 'none';
            }
        });
    }

    isDescendant(ancestorId, descendantId) {
        // Check if ancestorId is an ancestor of descendantId
        const descendant = this.tags.get(descendantId);
        if (!descendant || !descendant.parentIds) return false;
        
        const visited = new Set();
        const queue = [descendantId];
        
        while (queue.length > 0) {
            const currentId = queue.shift();
            if (visited.has(currentId)) continue;
            if (currentId === ancestorId) return true;
            
            visited.add(currentId);
            
            const current = this.tags.get(currentId);
            if (current && current.parentIds) {
                queue.push(...current.parentIds);
            }
        }
        
        return false;
    }
    
    setupColorGrid(colorGrid, colorInput, colorPalette) {
        colorGrid.innerHTML = colorPalette.map(color => `
            <div class="tag-color-swatch" 
                 data-color="${color}" 
                 style="background-color: ${color};"
                 title="${color}">
            </div>
        `).join('');
        
        colorGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-color-swatch')) {
                const selectedColor = e.target.dataset.color;
                colorInput.value = selectedColor;
                
                // Update active state
                colorGrid.querySelectorAll('.tag-color-swatch').forEach(swatch => 
                    swatch.classList.remove('selected')
                );
                e.target.classList.add('selected');
            }
        });
        
        // Set initial selected color
        const currentColor = colorInput.value;
        const activeOption = colorGrid.querySelector(`[data-color="${currentColor}"]`);
        if (activeOption) {
            activeOption.classList.add('selected');
        }
    }
    
    generateSlugFromName(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9\s-/]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    
    async validateTagName(name, excludeId = null) {
        const validationEl = document.getElementById('tagNameValidation');
        const saveButton = document.getElementById('saveTag');
        
        if (!name) {
            validationEl.textContent = '';
            validationEl.className = 'tag-validation-message';
            return false;
        }
        
        try {
            const response = await fetch('/api/tags');
            const data = await response.json();
            const tags = data.tags || data; // Handle both {tags: [...]} and [...] formats
            
            const existingTag = tags.find(tag => 
                tag.name.toLowerCase() === name.toLowerCase() && 
                tag.id !== excludeId
            );
            
            if (existingTag) {
                validationEl.textContent = 'A tag with this name already exists';
                validationEl.className = 'tag-validation-message error';
                saveButton.disabled = true;
                return false;
            } else {
                validationEl.textContent = 'Name is available';
                validationEl.className = 'tag-validation-message success';
                saveButton.disabled = false;
                return true;
            }
        } catch (error) {
            console.error('Error validating tag name:', error);
            validationEl.textContent = 'Error checking name availability';
            validationEl.className = 'tag-validation-message error';
            return false;
        }
    }
    
    updateHierarchyPreview(fullSlug) {
        const previewEl = document.getElementById('tagHierarchyPreview');
        if (!fullSlug || !fullSlug.trim()) {
            previewEl.innerHTML = '<span class="hierarchy-level level-0">Root Level</span>';
            return;
        }
        
        const parts = fullSlug.split('/').filter(part => part.trim());
        if (parts.length === 0) {
            previewEl.innerHTML = '<span class="hierarchy-level level-0">Root Level</span>';
            return;
        }
        
        let hierarchy = '<span class="hierarchy-level level-0">Root</span>';
        
        parts.forEach((part, index) => {
            const isLastPart = index === parts.length - 1;
            const level = Math.min(index + 1, 3); // Cap at level 3 for styling
            const label = isLastPart ? `${part} (new)` : part;
            hierarchy += `<span class="hierarchy-level level-${level}">${label}</span>`;
        });
        
        previewEl.innerHTML = hierarchy;
    }
    
    debounceParentPathSuggestions(value) {
        if (this.parentPathDebounceTimeout) {
            clearTimeout(this.parentPathDebounceTimeout);
        }
        
        this.parentPathDebounceTimeout = setTimeout(() => {
            this.showParentPathSuggestions(value);
        }, 200);
    }
    
    async showParentPathSuggestions(query) {
        const suggestionsEl = document.getElementById('tagParentPathSuggestions');
        
        try {
            const response = await fetch('/api/tags');
            const data = await response.json();
            const tags = data.tags || data; // Handle both {tags: [...]} and [...] formats
            
            if (!Array.isArray(tags)) {
                suggestionsEl.style.display = 'none';
                return;
            }
            
            // Get unique parent paths from existing tags
            const parentPaths = new Set();
            
            // Add existing hierarchical paths
            tags.forEach(tag => {
                if (tag.slug) {
                    const parts = tag.slug.split('/');
                    // Add all possible parent paths from existing hierarchical tags
                    for (let i = 1; i < parts.length; i++) {
                        parentPaths.add(parts.slice(0, i).join('/'));
                    }
                    // Also add the full path (for deeper nesting)
                    if (parts.length > 1) {
                        parentPaths.add(tag.slug);
                    }
                }
            });
            
            // Add suggested parent paths based on existing root tags
            const rootTags = tags.filter(tag => tag.slug && !tag.slug.includes('/'));
            rootTags.forEach(tag => {
                // Suggest common categories that could have subcategories
                const slug = tag.slug.toLowerCase();
                if (slug.includes('cook') || slug.includes('recipe') || slug.includes('food')) {
                    parentPaths.add('cooking');
                    parentPaths.add('recipes');
                }
                if (slug.includes('tech') || slug.includes('program') || slug.includes('code')) {
                    parentPaths.add('technology');
                    parentPaths.add('programming');
                }
                if (slug.includes('learn') || slug.includes('study') || slug.includes('educ')) {
                    parentPaths.add('learning');
                    parentPaths.add('education');
                }
                // Add the tag itself as a potential parent
                parentPaths.add(tag.slug);
            });
            
            // Add some common parent path suggestions
            const commonParents = [
                'projects', 'work', 'personal', 'hobbies', 'recipes', 'cooking',
                'technology', 'programming', 'learning', 'health', 'finance',
                'travel', 'books', 'movies', 'music', 'sports', 'games'
            ];
            commonParents.forEach(parent => parentPaths.add(parent));
            
            // Filter based on query and sort
            const filteredPaths = Array.from(parentPaths)
                .filter(path => !query || path.toLowerCase().includes(query.toLowerCase()))
                .sort((a, b) => {
                    // Prioritize exact matches
                    if (query) {
                        const queryLower = query.toLowerCase();
                        const aStartsWith = a.toLowerCase().startsWith(queryLower);
                        const bStartsWith = b.toLowerCase().startsWith(queryLower);
                        if (aStartsWith && !bStartsWith) return -1;
                        if (!aStartsWith && bStartsWith) return 1;
                    }
                    
                    // Sort by depth first, then alphabetically
                    const depthA = a.split('/').length;
                    const depthB = b.split('/').length;
                    if (depthA !== depthB) return depthA - depthB;
                    return a.localeCompare(b);
                })
                .slice(0, 8);
            
            if (filteredPaths.length === 0) {
                suggestionsEl.style.display = 'none';
                return;
            }
            
            const suggestions = filteredPaths.map(path => {
                const parts = path.split('/');
                const lastPart = parts[parts.length - 1];
                const level = parts.length - 1;
                const indent = '  '.repeat(level);
                const icon = level === 0 ? '📁' : '📂';
                
                // Check if this is an existing tag vs suggested path
                const isExistingTag = tags.some(tag => tag.slug === path);
                const statusIcon = isExistingTag ? '✅' : '💡';
                
                return `
                    <div class="tag-suggestion" data-path="${path}">
                        <span class="hierarchy-suggestion">
                            ${indent}${icon} ${this.highlightMatch(lastPart, query)} ${statusIcon}
                        </span>
                        <span class="muted">${path}</span>
                    </div>
                `;
            }).join('');
            
            suggestionsEl.innerHTML = suggestions;
            suggestionsEl.style.display = 'block';
            
            // Handle suggestion clicks
            suggestionsEl.addEventListener('click', (e) => {
                const item = e.target.closest('.tag-suggestion');
                if (item) {
                    const path = item.dataset.path;
                    document.getElementById('tagParentPath').value = path;
                    // Update preview immediately
                    const nameInput = document.getElementById('tagName');
                    const fullSlug = this.constructFullSlug(path, nameInput.value.trim());
                    this.updateHierarchyPreview(fullSlug);
                    this.hideSuggestions();
                }
            });
            
        } catch (error) {
            console.error('Error fetching parent path suggestions:', error);
            suggestionsEl.style.display = 'none';
        }
    }
    
    async showTagNameSuggestions(query) {
        const suggestionsEl = document.getElementById('tagNameSuggestions');
        
        if (!query || query.length < 1) {
            suggestionsEl.style.display = 'none';
            return;
        }
        
        try {
            const response = await fetch(`/api/tags?search=${encodeURIComponent(query)}`);
            const data = await response.json();
            const tags = data.tags || data; // Handle both {tags: [...]} and [...] formats
            
            if (!Array.isArray(tags) || tags.length === 0) {
                suggestionsEl.style.display = 'none';
                return;
            }
            
            const suggestions = tags.slice(0, 5).map(tag => {
                const hierarchyPath = tag.slug ? tag.slug.split('/').slice(0, -1).join(' › ') : 'Root';
                const icon = tag.slug ? '🏷️' : '📁';
                
                return `
                    <div class="tag-suggestion" data-name="${tag.name}">
                        <span class="tag-name">${icon} ${this.highlightMatch(tag.name, query)}</span>
                        <span class="muted">${hierarchyPath}</span>
                    </div>
                `;
            }).join('');
            
            suggestionsEl.innerHTML = suggestions;
            suggestionsEl.style.display = 'block';
            
            // Handle suggestion clicks
            suggestionsEl.addEventListener('click', (e) => {
                const item = e.target.closest('.tag-suggestion');
                if (item) {
                    const name = item.dataset.name;
                    document.getElementById('tagName').value = name;
                    this.hideSuggestions();
                    this.validateTagName(name);
                }
            });
            
        } catch (error) {
            console.error('Error fetching tag suggestions:', error);
            suggestionsEl.style.display = 'none';
        }
    }
    
    highlightMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    hideSuggestions() {
        const suggestions = document.querySelectorAll('.tag-suggestions');
        suggestions.forEach(el => el.style.display = 'none');
    }

    handleTagSave(isEdit, existingTag) {
        const name = document.getElementById('tagName').value.trim();
        const parentPath = document.getElementById('tagParentPath').value.trim();
        const description = document.getElementById('tagDescription').value.trim();
        const color = document.getElementById('tagColor').value;
        
        if (!name) {
            alert('Tag name is required');
            return;
        }

        const tagData = {
            name,
            parentPath: parentPath || null,
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

    showBulkOperationsModal() {
        const modalHtml = `
            <div class="bulk-operations-modal">
                <div class="modal-header">
                    <h3>Bulk Tag Operations</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="bulk-instructions">
                        <i class="fas fa-info-circle"></i>
                        <p>Select notes and tags, then choose to apply or remove the selected tags from the selected notes.</p>
                    </div>

                    <div class="bulk-grid">
                        <div class="bulk-section">
                            <div class="bulk-section-header">
                                <h4>
                                    <i class="fas fa-file-alt"></i>
                                    Notes
                                    <span class="selection-count" id="notesCount">(0 selected)</span>
                                </h4>
                                <div class="bulk-section-actions">
                                    <button class="btn-link" id="selectAllNotes">Select All</button>
                                    <span class="separator">•</span>
                                    <button class="btn-link" id="selectNoneNotes">Clear</button>
                                </div>
                            </div>
                            <div class="search-box">
                                <i class="fas fa-search"></i>
                                <input type="text" id="noteSearchInput" placeholder="Search notes...">
                            </div>
                            <div class="note-selection">
                                <div id="bulkNotesList" class="notes-list">
                                    <div class="loading">
                                        <i class="fas fa-spinner fa-spin"></i>
                                        Loading notes...
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bulk-section">
                            <div class="bulk-section-header">
                                <h4>
                                    <i class="fas fa-tags"></i>
                                    Tags
                                    <span class="selection-count" id="tagsCount">(0 selected)</span>
                                </h4>
                                <div class="bulk-section-actions">
                                    <button class="btn-link" id="selectAllTags">Select All</button>
                                    <span class="separator">•</span>
                                    <button class="btn-link" id="selectNoneTags">Clear</button>
                                </div>
                            </div>
                            <div class="search-box">
                                <i class="fas fa-search"></i>
                                <input type="text" id="bulkTagSearchInput" placeholder="Search tags...">
                            </div>
                            <div class="tag-selection">
                                <div id="bulkTagsList" class="bulk-tags-list">
                                    <div class="loading">
                                        <i class="fas fa-spinner fa-spin"></i>
                                        Loading tags...
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <div class="bulk-actions">
                        <button id="applyTagsBtn" class="btn-primary" disabled>
                            <i class="fas fa-plus-circle"></i> Apply Tags
                        </button>
                        <button id="removeTagsBtn" class="btn-danger" disabled>
                            <i class="fas fa-minus-circle"></i> Remove Tags
                        </button>
                        <button id="cancelBulkBtn" class="btn-secondary">Cancel</button>
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
            const notesList = document.getElementById('bulkNotesList');
            
            if (!notesList) return;
            
            const notes = this.extractNotesFromTree(treeData);
            this.renderNotesForBulkOperations(notes);
            this.renderTagsForBulkOperations();
            
        } catch (error) {
            console.error('Error loading notes for bulk operations:', error);
            const notesList = document.getElementById('bulkNotesList');
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
    const notesList = document.getElementById('bulkNotesList');
        if (!notesList) return;

        notesList.innerHTML = '';
        
        if (notes.length === 0) {
            notesList.innerHTML = '<div class="no-items"><i class="fas fa-inbox"></i> No notes found</div>';
            return;
        }

        notes.forEach(note => {
            const noteItem = document.createElement('label');
            noteItem.className = 'note-item';
            noteItem.innerHTML = `
                <input type="checkbox" id="note-${note.id}" value="${note.id}">
                <span class="note-name">
                    <i class="fas fa-file-alt"></i>
                    ${this.escapeHtml(note.name)}
                </span>
            `;
            notesList.appendChild(noteItem);
        });

        this.updateBulkSelectionCounts();
    }

    renderTagsForBulkOperations() {
        const tagsList = document.getElementById('bulkTagsList');
        if (!tagsList) return;

        tagsList.innerHTML = '';
        
        if (this.tags.size === 0) {
            tagsList.innerHTML = '<div class="no-items"><i class="fas fa-tags"></i> No tags found</div>';
            return;
        }

        const sortedTags = Array.from(this.tags.values()).sort((a, b) => a.name.localeCompare(b.name));

        sortedTags.forEach(tag => {
            const tagItem = document.createElement('label');
            tagItem.className = 'bulk-tag-item';
            tagItem.innerHTML = `
                <input type="checkbox" id="bulk-tag-${tag.id}" value="${tag.id}">
                <span class="tag-info">
                    <span class="tag-name">${this.escapeHtml(tag.name)}</span>
                    ${tag.slug ? `<span class="tag-slug">#${this.escapeHtml(tag.slug)}</span>` : ''}
                    <span class="tag-usage-badge">${tag.usage_count || 0}</span>
                </span>
            `;
            tagsList.appendChild(tagItem);
        });

        this.updateBulkSelectionCounts();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

        // Select all/none notes
        document.getElementById('selectAllNotes')?.addEventListener('click', () => {
            document.querySelectorAll('#bulkNotesList input[type="checkbox"]:not([style*="display: none"])').forEach(cb => {
                cb.checked = true;
            });
            this.updateBulkSelectionCounts();
        });

        document.getElementById('selectNoneNotes')?.addEventListener('click', () => {
            document.querySelectorAll('#bulkNotesList input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            this.updateBulkSelectionCounts();
        });

        // Select all/none tags
        document.getElementById('selectAllTags')?.addEventListener('click', () => {
            document.querySelectorAll('#bulkTagsList input[type="checkbox"]:not([style*="display: none"])').forEach(cb => {
                cb.checked = true;
            });
            this.updateBulkSelectionCounts();
        });

        document.getElementById('selectNoneTags')?.addEventListener('click', () => {
            document.querySelectorAll('#bulkTagsList input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            this.updateBulkSelectionCounts();
        });

        // Update counts when checkboxes change
    document.getElementById('bulkNotesList')?.addEventListener('change', () => {
            this.updateBulkSelectionCounts();
        });

        document.getElementById('bulkTagsList')?.addEventListener('change', () => {
            this.updateBulkSelectionCounts();
        });

        // Bulk action buttons
        document.getElementById('applyTagsBtn')?.addEventListener('click', () => {
            this.performBulkTagOperation('apply');
        });

        document.getElementById('removeTagsBtn')?.addEventListener('click', () => {
            this.performBulkTagOperation('remove');
        });

        document.getElementById('cancelBulkBtn')?.addEventListener('click', () => {
            this.closeModal();
        });
    }

    updateBulkSelectionCounts() {
    const notesCount = document.querySelectorAll('#bulkNotesList input:checked').length;
        const tagsCount = document.querySelectorAll('#bulkTagsList input:checked').length;
        
        const notesCountEl = document.getElementById('notesCount');
        const tagsCountEl = document.getElementById('tagsCount');
        
        if (notesCountEl) {
            notesCountEl.textContent = `(${notesCount} selected)`;
        }
        
        if (tagsCountEl) {
            tagsCountEl.textContent = `(${tagsCount} selected)`;
        }

        // Enable/disable action buttons
        const applyBtn = document.getElementById('applyTagsBtn');
        const removeBtn = document.getElementById('removeTagsBtn');
        const canAct = notesCount > 0 && tagsCount > 0;
        
        if (applyBtn) applyBtn.disabled = !canAct;
        if (removeBtn) removeBtn.disabled = !canAct;
    }

    filterNotes(query) {
    // Scope to bulk modal list only to avoid affecting other note lists on the page
    const noteItems = document.querySelectorAll('#bulkNotesList .note-item');
        const lowerQuery = query.toLowerCase();
        
        noteItems.forEach(item => {
            const noteName = item.querySelector('.note-name').textContent.toLowerCase();
            const matches = noteName.includes(lowerQuery);
            item.style.display = matches ? 'flex' : 'none';
            
            // Uncheck hidden items
            if (!matches) {
                item.querySelector('input').checked = false;
            }
        });
        
        this.updateBulkSelectionCounts();
    }

    filterBulkTags(query) {
        const tagItems = document.querySelectorAll('.bulk-tag-item');
        const lowerQuery = query.toLowerCase();
        
        tagItems.forEach(item => {
            const tagName = item.querySelector('.tag-name').textContent.toLowerCase();
            const tagSlug = item.querySelector('.tag-slug')?.textContent?.toLowerCase() || '';
            const matches = tagName.includes(lowerQuery) || tagSlug.includes(lowerQuery);
            item.style.display = matches ? 'flex' : 'none';
            
            // Uncheck hidden items
            if (!matches) {
                item.querySelector('input').checked = false;
            }
        });
        
        this.updateBulkSelectionCounts();
    }

    async performBulkTagOperation(operation) {
    const selectedNotes = Array.from(document.querySelectorAll('#bulkNotesList input:checked')).map(cb => cb.value);
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

    showModal(html, onSave = null, onCreated = null) {
        // Remove existing modal if any
        this.closeModal();

    const modalContainer = document.createElement('div');
    modalContainer.className = 'tags-modal-overlay';
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
    const modal = document.querySelector('.tags-modal-overlay');
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

    // ============================================
    // Selection Mode Methods
    // ============================================

    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        
        if (!this.selectionMode) {
            // Clear selection when exiting selection mode
            this.selectedTags.clear();
        }
        
        this.updateSelectionUI();
        this.renderTags();
    }

    updateSelectionUI() {
        const toolbar = document.getElementById('tagsSelectionToolbar');
        const toggleBtn = document.getElementById('tagsSelectionToggle');
        document.getElementById('tagsBulkBar');
        
        if (toolbar) {
            toolbar.classList.toggle('is-hidden', !this.selectionMode);
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = this.selectionMode 
                ? '<i class="fas fa-check-square"></i> Exit Selection'
                : '<i class="fas fa-square"></i> Select Mode';
            toggleBtn.classList.toggle('active', this.selectionMode);
        }
        
        this.updateBulkBar();
    }

    updateBulkBar() {
        const bulkBar = document.getElementById('tagsBulkBar');
        const bulkCount = document.getElementById('tagsBulkCount');
        
        if (!bulkBar || !bulkCount) return;
        
        const count = this.selectedTags.size;
        
        if (this.selectionMode && count > 0) {
            bulkBar.classList.remove('is-hidden');
            bulkCount.textContent = `${count} selected`;
        } else {
            bulkBar.classList.add('is-hidden');
        }
    }

    handleTagSelection(tagId, event) {
        if (!this.selectionMode) return;
        
        if (event) {
            event.stopPropagation();
        }
        
        if (this.selectedTags.has(tagId)) {
            this.selectedTags.delete(tagId);
        } else {
            this.selectedTags.add(tagId);
        }
        
        this.updateBulkBar();
        this.updateTagSelectionVisuals();
    }

    selectAllTags() {
        const filteredTags = this.getFilteredTags();
        this.selectedTags.clear();
        filteredTags.forEach(tag => this.selectedTags.add(tag.id));
        this.updateBulkBar();
        this.updateTagSelectionVisuals();
    }

    deselectAllTags() {
        this.selectedTags.clear();
        this.updateBulkBar();
        this.updateTagSelectionVisuals();
    }

    updateTagSelectionVisuals() {
        document.querySelectorAll('.tag-card, .tag-list-row, .hierarchy-tag').forEach(el => {
            const checkbox = el.querySelector('.tag-select-checkbox');
            if (checkbox) {
                const tagId = checkbox.dataset.tagId;
                checkbox.checked = this.selectedTags.has(tagId);
                el.classList.toggle('selected', this.selectedTags.has(tagId));
            }
        });
    }

    // ============================================
    // Bulk Operations
    // ============================================

    async handleBulkDelete() {
        const selectedIds = Array.from(this.selectedTags);
        if (selectedIds.length === 0) return;
        
        const plural = selectedIds.length > 1 ? 'tags' : 'tag';
        if (!confirm(`Delete ${selectedIds.length} ${plural}? This cannot be undone.`)) return;
        
        try {
            let successCount = 0;
            let errorCount = 0;
            
            for (const tagId of selectedIds) {
                try {
                    await this.deleteTag(tagId, true); // Pass true to skip confirmation
                    successCount++;
                } catch (error) {
                    console.error(`Error deleting tag ${tagId}:`, error);
                    errorCount++;
                }
            }
            
            this.selectedTags.clear();
            await this.loadTags();
            this.renderInterface();
            this.updateBulkBar();
            
            const message = `Deleted ${successCount} ${plural}${errorCount > 0 ? `, ${errorCount} failed` : ''}`;
            this.showNotification(message, errorCount > 0 ? 'warning' : 'success');
        } catch (error) {
            console.error('Bulk delete failed:', error);
            this.showNotification('Failed to delete tags', 'error');
        }
    }

    async handleBulkMerge() {
        const selectedIds = Array.from(this.selectedTags);
        if (selectedIds.length < 2) {
            this.showNotification('Select at least 2 tags to merge', 'warning');
            return;
        }
        
        // Show merge modal to select target tag
        this.showBulkMergeModal(selectedIds);
    }

    async handleBulkMakeChild() {
        const selectedIds = Array.from(this.selectedTags);
        if (selectedIds.length === 0) return;
        
        // Show parent selection modal
        this.showParentSelectionModal(selectedIds);
    }

    showBulkMergeModal(tagIds) {
        const tags = tagIds.map(id => this.tags.get(id)).filter(Boolean);
        
        const modalHtml = `
            <div class="bulk-merge-modal">
                <div class="modal-header">
                    <h3>Merge Tags</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Select the tag to merge into (all other selected tags will be merged into this one):</p>
                    <div class="merge-target-list">
                        ${tags.map(tag => `
                            <div class="merge-target-item">
                                <input type="radio" name="mergeTarget" value="${tag.id}" id="merge-${tag.id}">
                                <label for="merge-${tag.id}">
                                    <span class="tag-color-indicator" style="background-color: ${tag.color || '#1DA1F2'}"></span>
                                    <strong>${tag.name}</strong>
                                    <span class="tag-slug">${tag.slug || ''}</span>
                                    <span class="tag-usage">(${tag.usage || 0} notes)</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="confirmMergeBtn" class="btn-primary" disabled>
                        <i class="fas fa-code-branch"></i> Merge Tags
                    </button>
                    <button id="cancelMergeBtn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml, null, () => {
            // Enable merge button when target is selected
            const radios = document.querySelectorAll('input[name="mergeTarget"]');
            const confirmBtn = document.getElementById('confirmMergeBtn');
            
            radios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (confirmBtn) confirmBtn.disabled = false;
                });
            });
            
            document.getElementById('confirmMergeBtn')?.addEventListener('click', async () => {
                const selectedRadio = document.querySelector('input[name="mergeTarget"]:checked');
                if (!selectedRadio) return;
                
                const targetId = selectedRadio.value;
                const sourceIds = tagIds.filter(id => id !== targetId);
                
                await this.performBulkMerge(targetId, sourceIds);
                this.closeModal();
            });
            
            document.getElementById('cancelMergeBtn')?.addEventListener('click', () => {
                this.closeModal();
            });
        });
    }

    async performBulkMerge(targetId, sourceIds) {
        try {
            // Merge all source tags into target
            for (const sourceId of sourceIds) {
                const response = await fetch(`/api/tags/${sourceId}/merge/${targetId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to merge tag ${sourceId}`);
                }
            }
            
            this.selectedTags.clear();
            await this.loadTags();
            this.renderInterface();
            this.updateBulkBar();
            
            this.showNotification(`Merged ${sourceIds.length} tags successfully`, 'success');
        } catch (error) {
            console.error('Bulk merge failed:', error);
            this.showNotification('Failed to merge tags', 'error');
        }
    }

    showParentSelectionModal(childIds) {
        const availableParents = Array.from(this.tags.values())
            .filter(tag => !childIds.includes(tag.id));
        
        const modalHtml = `
            <div class="parent-selection-modal">
                <div class="modal-header">
                    <h3>Make Child Of</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Select a parent tag for the ${childIds.length} selected tag(s):</p>
                    <div class="parent-search">
                        <input type="text" id="parentSearchInput" placeholder="Search parent tags..." class="search-input">
                    </div>
                    <div class="parent-list">
                        ${availableParents.map(tag => `
                            <div class="parent-item" data-tag-name="${tag.name.toLowerCase()}" data-tag-slug="${(tag.slug || '').toLowerCase()}">
                                <input type="radio" name="parentTag" value="${tag.id}" id="parent-${tag.id}">
                                <label for="parent-${tag.id}">
                                    <span class="tag-color-indicator" style="background-color: ${tag.color || '#1DA1F2'}"></span>
                                    <strong>${tag.name}</strong>
                                    <span class="tag-slug">${tag.slug || ''}</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="confirmParentBtn" class="btn-primary" disabled>
                        <i class="fas fa-sitemap"></i> Set Parent
                    </button>
                    <button id="removeParentBtn" class="btn-secondary">
                        <i class="fas fa-unlink"></i> Remove Parent
                    </button>
                    <button id="cancelParentBtn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        this.showModal(modalHtml, null, () => {
            // Search functionality
            const searchInput = document.getElementById('parentSearchInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    document.querySelectorAll('.parent-item').forEach(item => {
                        const name = item.dataset.tagName || '';
                        const slug = item.dataset.tagSlug || '';
                        const matches = name.includes(query) || slug.includes(query);
                        item.style.display = matches ? 'flex' : 'none';
                    });
                });
            }
            
            // Enable confirm button when parent is selected
            const radios = document.querySelectorAll('input[name="parentTag"]');
            const confirmBtn = document.getElementById('confirmParentBtn');
            
            radios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (confirmBtn) confirmBtn.disabled = false;
                });
            });
            
            document.getElementById('confirmParentBtn')?.addEventListener('click', async () => {
                const selectedRadio = document.querySelector('input[name="parentTag"]:checked');
                if (!selectedRadio) return;
                
                const parentId = selectedRadio.value;
                await this.performBulkSetParent(childIds, parentId);
                this.closeModal();
            });
            
            document.getElementById('removeParentBtn')?.addEventListener('click', async () => {
                await this.performBulkSetParent(childIds, null);
                this.closeModal();
            });
            
            document.getElementById('cancelParentBtn')?.addEventListener('click', () => {
                this.closeModal();
            });
        });
    }

    async performBulkSetParent(childIds, parentId) {
        try {
            let successCount = 0;
            let errorCount = 0;
            
            for (const childId of childIds) {
                try {
                    const tag = this.tags.get(childId);
                    if (!tag) continue;
                    
                    if (parentId) {
                        // Add parent to the tag (multi-parent support)
                        await fetch(`/api/tags/${childId}/parents`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ parentId })
                        });
                    } else {
                        // Remove all parents (for "Remove Parent" operation)
                        await fetch(`/api/tags/${childId}/parents`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ parentIds: [] })
                        });
                    }
                    successCount++;
                } catch (error) {
                    console.error(`Error updating tag ${childId}:`, error);
                    errorCount++;
                }
            }
            
            this.selectedTags.clear();
            await this.loadTags();
            this.renderInterface();
            this.updateBulkBar();
            
            const action = parentId ? 'added parent to' : 'removed parents from';
            const message = `${action} ${successCount} tag(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`;
            this.showNotification(message, errorCount > 0 ? 'warning' : 'success');
        } catch (error) {
            console.error('Bulk set parent failed:', error);
            this.showNotification('Failed to update tags', 'error');
        }
    }
}

let managerInstance = null;
let initPromise = null;

function ensureManager() {
    if (!managerInstance) {
        managerInstance = new TagsManager();
        try { window.tagsManager = managerInstance; } catch {}
    }
    return managerInstance;
}

function init() {
    if (initPromise) return initPromise;
    const manager = ensureManager();
    initPromise = manager.init().then(() => manager);
    return initPromise;
}

function getManager() {
    return ensureManager();
}

try { window.TagsManager = TagsManager; } catch {}

// Tag System: inline pills under title + submenu popover for search/create/color
  const COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
  const cache = new Map();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

  function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  function normalizeInput(s) { return (s||'').trim().replace(/\s+/g,' '); }

  function tagPill(tag) {
    const pill = document.createElement('span');
    pill.className = `tag-pill tag-${tag.color||'default'}`;
    pill.setAttribute('data-tag-id', tag.id);
    pill.innerHTML = `<span class="tag-name">${tag.name}</span><button class="tag-remove" aria-label="Remove tag">×</button>`;
    return pill;
  }

  async function apiListTags(q) {
    const key = `q:${q||''}`;
    if (cache.has(key)) return cache.get(key);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit','50'); params.set('includeUsage','true');
    const res = await fetch(`/api/tags?${params.toString()}`);
    const data = await res.json();
    cache.set(key, data.tags||[]); return data.tags||[];
  }
  async function apiCreateTag(name, color='default') {
    const res = await fetch('/api/tags',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, color})});
    if(!res.ok) throw new Error('create tag failed'); cache.clear();
    return res.json();
  }
  async function apiUpdateTagColor(tagId, color){
    const res = await fetch(`/api/tags/${encodeURIComponent(tagId)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ color }) });
    if(!res.ok) throw new Error('update tag failed'); cache.clear(); return true;
  }
  async function apiUpdateTagName(tagId, name){
    const res = await fetch(`/api/tags/${encodeURIComponent(tagId)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    if(!res.ok) throw new Error('update tag failed'); cache.clear(); return res.json();
  }
  async function apiGetNoteTags(noteId){ const r=await fetch(`/api/notes/${noteId}/tags`); const d=await r.json(); return d.tags||[]; }
  async function apiReplaceNoteTags(noteId, tagIds){ const r=await fetch(`/api/notes/${noteId}/tags`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tagIds})}); return r.ok; }

  const state = { noteId:null, tags:[], inlineEl:null, triggerEl:null, menuEl:null, selectedColor:'default', menuSelectedTagId:null };

  function renderInline() {
    if (!state.inlineEl) return;
    state.inlineEl.innerHTML = '';
    state.tags.forEach(t => state.inlineEl.appendChild(tagPill(t)));
  }

  async function addTag(tag) {
    if (!state.noteId) return;
    if (state.tags.find(t=>t.id===tag.id)) return;
    const next = [...state.tags, tag];
    const ok = await apiReplaceNoteTags(state.noteId, next.map(t=>t.id));
    if (ok) { state.tags = next.sort((a,b)=>collator.compare(a.name,b.name)); renderInline(); buildMenuContent(); }
  }
  async function removeTagId(tagId) {
    if (!state.noteId) return;
    const next = state.tags.filter(t=>t.id!==tagId);
    const ok = await apiReplaceNoteTags(state.noteId, next.map(t=>t.id));
    if (ok) { state.tags = next; renderInline(); buildMenuContent(); }
  }

  function wireInlineEvents() {
    if (!state.inlineEl) return;
    state.inlineEl.addEventListener('click', async (e)=>{
      if (e.target.classList.contains('tag-remove')) {
        const pill = e.target.closest('.tag-pill');
        const id = pill && pill.getAttribute('data-tag-id');
        if (id) await removeTagId(id);
      }
    });
  }

  // Reposition logic extracted so we can call on resize/scroll
  function positionMenu() {
    if (!state.menuEl) return;
    const menu = state.menuEl;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      // Mobile: prefer full-content height without internal scroll when possible.
      const rect = state.triggerEl ? state.triggerEl.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 60, top: 20 };
      const margin = 8;
      const minWidth = 280;
      const desiredMax = Math.min(520, window.innerWidth - margin * 2);
      const rightEdge = Math.min(rect.right, window.innerWidth - margin); // rightmost x of trigger
      // Keep right edge fixed to the trigger by using CSS 'right'
      const rightOffset = Math.max(margin, window.innerWidth - rightEdge);
      const maxRightAlignedWidth = Math.max(160, rightEdge - margin);
      let width = Math.min(desiredMax, Math.max(minWidth, maxRightAlignedWidth));
      if (maxRightAlignedWidth < minWidth) width = Math.max(160, maxRightAlignedWidth);
      let top = rect.bottom + margin;

      // Apply basic positioning and width first
      menu.style.setProperty('position', 'fixed', 'important');
      menu.style.setProperty('right', `${rightOffset}px`, 'important');
      menu.style.setProperty('left', 'auto', 'important');
      menu.style.setProperty('top', `${top}px`, 'important');
      menu.style.setProperty('width', `${width}px`, 'important');
      // Remove height limits so we can measure full content height
      menu.style.removeProperty('max-height');
      menu.style.removeProperty('overflow-y');
      menu.style.setProperty('height', 'auto', 'important');

      // Next frame, measure height and reposition so it fully fits without scroll if possible
      requestAnimationFrame(() => {
        // Measure full content height
        const fullHeight = menu.scrollHeight;
        const spaceBelow = window.innerHeight - (rect.bottom + margin) - margin;
        rect.top - margin;
        // Prefer placing below; if not enough space, place higher to fit
        if (fullHeight <= spaceBelow) {
          top = rect.bottom + margin;
        } else if (fullHeight <= window.innerHeight - margin * 2) {
          // Center vertically if needed so the entire menu fits in viewport
          top = Math.max(margin, Math.min(rect.bottom + margin, window.innerHeight - margin - fullHeight));
        } else {
          // Fallback: content simply can't fit; use viewport height with scroll
          top = margin;
          const maxH = window.innerHeight - margin * 2;
          menu.style.setProperty('max-height', `${maxH}px`, 'important');
          menu.style.setProperty('overflow-y', 'auto', 'important');
        }
        menu.style.setProperty('top', `${top}px`, 'important');
        // Show only after final position is set to avoid flicker/column phase
        menu.style.visibility = 'visible';
      });
      return;
    }

    // Desktop/tablet: use fixed positioning relative to viewport to avoid clipping
    const rect = state.triggerEl ? state.triggerEl.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 60 };
    const desired = Math.min(320, window.innerWidth - 16);
    const left = Math.min(window.innerWidth - 8 - desired, Math.max(8, rect.right - desired));

    // Use inline styles so it stays aligned on resize/scroll
    menu.style.setProperty('position', 'fixed');
    menu.style.setProperty('left', `${left}px`);
    menu.style.setProperty('width', `${desired}px`);
    menu.style.setProperty('top', `${rect.bottom + 8}px`);
    menu.style.setProperty('right', 'auto');
    menu.style.setProperty('bottom', '');
    menu.style.setProperty('max-height', '70vh');
    menu.style.setProperty('overflow-y', 'auto');

    // After layout, ensure it fits in viewport vertically, then show
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight;
      const currentTop = parseInt(menu.style.top || '0', 10);
      const bottomSpace = window.innerHeight - (currentTop + mh) - 8;
      if (bottomSpace < 0) {
        const top = Math.max(8, window.innerHeight - mh - 8);
        menu.style.setProperty('top', `${top}px`);
      }
      menu.style.visibility = 'visible';
    });
  }

  let boundReposition = null;

  function openMenu() {
    if (!state.menuEl) return;
    const menu = state.menuEl;
    menu.classList.remove('is-hidden');
    // Avoid flicker while we measure and position
    menu.style.visibility = 'hidden';
    // Visual styling (non-positional)
    menu.style.backgroundColor = '#ffffff';
    menu.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    menu.style.borderRadius = '8px';
    // Initial build then position and fit
    buildMenuContent();
    positionMenu();
    // Reposition on viewport changes to match modelDropdown behavior
    boundReposition = () => positionMenu();
    window.addEventListener('resize', boundReposition, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', boundReposition, { passive: true });
    }
    // Capture scrolls in ancestors/viewport
    window.addEventListener('scroll', boundReposition, { passive: true, capture: true });
    document.addEventListener('click', onDocClick, true);
  }
  function closeMenu() {
    if (!state.menuEl) return;
    state.menuEl.classList.add('is-hidden');
    state.menuSelectedTagId = null; // hide name editing when menu closes
    // Clear inline positioning so CSS can reapply later cleanly
    const s = state.menuEl.style;
    s.removeProperty('left');
    s.removeProperty('right');
    s.removeProperty('top');
    s.removeProperty('bottom');
    s.removeProperty('width');
    s.removeProperty('position');
    s.removeProperty('max-height');
    s.removeProperty('overflow-y');
    s.removeProperty('height');
    s.removeProperty('visibility');
    document.removeEventListener('click', onDocClick, true);
    // Remove reposition listeners
    if (boundReposition) {
      window.removeEventListener('resize', boundReposition, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', boundReposition, { passive: true });
      }
      window.removeEventListener('scroll', boundReposition, { passive: true, capture: true });
      boundReposition = null;
    }
  }
  function onDocClick(e){
    if (!state.menuEl) return;
    if (state.menuEl.contains(e.target) || (state.triggerEl && state.triggerEl.contains(e.target))) return;
    closeMenu();
  }

  function buildMenuContent() {
    if (!state.menuEl) return;
    const chosen = new Set(state.tags.map(t=>t.id));
    state.menuEl.innerHTML = `
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Current tags</div>
        <div class=\"tag-bar tag-bar--compact\"></div>
      </div>
      <div class=\"tag-menu-section\">
        <div class=\"tag-input-wrapper\">
          <input type=\"text\" class=\"tag-search-input tag-input\" placeholder=\"Search or create…\" aria-label=\"Search tags\" />
          <div class=\"tag-suggestions\" role=\"listbox\" aria-label=\"Tag suggestions\"></div>
        </div>
      </div>
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Color</div>
        <div class=\"tag-color-grid\"></div>
      </div>
      ${state.menuSelectedTagId ? `
      <div class=\"tag-menu-section\">
        <div class=\"tag-menu-label\">Tag name</div>
        <input type=\"text\" class=\"tag-name-input tag-input\" />
      </div>` : ''}
    `;
    // If a tag is selected for editing, prefill the name input
    const selectedTag = state.tags.find(t=>t.id===state.menuSelectedTagId) || null;
    if (selectedTag) {
      const nameInput = state.menuEl.querySelector('.tag-name-input');
      if (nameInput) {
        nameInput.value = selectedTag.name || '';
        const commit = async () => {
          const newName = (nameInput.value||'').trim();
          if (!newName || newName === selectedTag.name) return;
          const updated = await apiUpdateTagName(selectedTag.id, newName).catch(()=>null);
          if (updated) {
            // Update local state tag details
            const idx = state.tags.findIndex(t=>t.id===selectedTag.id);
            if (idx>=0) state.tags[idx] = { ...state.tags[idx], name: updated.name, slug: updated.slug };
            renderInline();
            buildMenuContent();
          }
        };
        nameInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter') { e.preventDefault(); commit(); } });
        nameInput.addEventListener('blur', ()=> commit());
        // Focus name input when selecting a tag for edit
        setTimeout(()=>{ nameInput.focus(); nameInput.select(); }, 0);
      }
    }

    const grid = state.menuEl.querySelector('.tag-color-grid');
    const activeColor = selectedTag ? (selectedTag.color||'default') : state.selectedColor;
    COLORS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tag-color-swatch dot dot-${c}` + (activeColor===c?' selected':'');
      btn.title = c;
      btn.addEventListener('click', async ()=>{
        if (selectedTag) {
          // Update existing tag color globally
          const ok = await apiUpdateTagColor(selectedTag.id, c).catch(()=>false);
          if (ok) {
            // update local state
            const idx = state.tags.findIndex(t=>t.id===selectedTag.id);
            if (idx>=0) state.tags[idx].color = c;
            state.selectedColor = c;
            renderInline();
            buildMenuContent();
          }
        } else {
          state.selectedColor=c; buildMenuContent();
        }
      });
      grid.appendChild(btn);
    });
    const bar = state.menuEl.querySelector('.tag-bar');
    state.tags.forEach(t => {
      const pill = tagPill(t);
      if (state.menuSelectedTagId===t.id) pill.classList.add('selected');
      // click selects for editing; the × remains for removal
      pill.addEventListener('click', (e)=>{
        if (e.target.classList.contains('tag-remove')) return; // handled elsewhere
        // toggle selection
        state.menuSelectedTagId = (state.menuSelectedTagId===t.id) ? null : t.id;
        state.selectedColor = t.color || 'default';
        buildMenuContent();
      });
      bar.appendChild(pill);
    });
    bar.addEventListener('click', async (e)=>{
      if (e.target.classList.contains('tag-remove')) {
        const pill = e.target.closest('.tag-pill');
        const id = pill && pill.getAttribute('data-tag-id');
        if (id) await removeTagId(id);
      }
    });

    const input = state.menuEl.querySelector('.tag-search-input');
    const dropdown = state.menuEl.querySelector('.tag-suggestions');
    // Focusing the search input unselects current tag (hide name editor) and shows initial suggestions
    input.addEventListener('focus', ()=>{ 
      if (state.menuSelectedTagId){ 
        state.menuSelectedTagId = null; 
        buildMenuContent(); 
      }
      // Trigger search on focus to show initial suggestions
      search();
    });
    
    // Hide dropdown when input loses focus (with a small delay to allow clicks on suggestions)
    input.addEventListener('blur', ()=>{
      setTimeout(()=> {
        if (dropdown && !dropdown.matches(':hover')) {
          dropdown.innerHTML = '';
        }
      }, 150);
    });
    const search = debounce(async ()=>{
      const q = normalizeInput(input.value);
      const list = await apiListTags(q);
      dropdown.innerHTML = '';
      const filtered = list.filter(t=>!chosen.has(t.id));
      if (q && !filtered.find(t=>t.name.toLowerCase()===q.toLowerCase())){
        const create = document.createElement('div');
        create.className = 'tag-suggestion create';
        create.textContent = `Create "${q}"`;
        create.addEventListener('click', async ()=>{
          const tag = await apiCreateTag(q, state.selectedColor).catch(()=>null);
          if(tag) await addTag(tag);
          input.value=''; dropdown.innerHTML='';
        });
        dropdown.appendChild(create);
      }
      filtered.slice(0,10).forEach(t=>{
        const el = document.createElement('div');
        el.className = 'tag-suggestion';
        el.innerHTML = `<span class="dot dot-${t.color||'default'}"></span>${t.name} ${t.usage?`<span class="muted">(${t.usage})</span>`:''}`;
        el.addEventListener('click', async ()=>{ await addTag(t); input.value=''; dropdown.innerHTML=''; });
        dropdown.appendChild(el);
      });
    }, 180);
    input.addEventListener('input', ()=>search());
    input.addEventListener('keydown', async (e)=>{
      if (e.key==='Enter' || e.key==='Tab' || e.key===','){
        e.preventDefault(); const q=normalizeInput(input.value); if(!q) return;
        const existing = (await apiListTags(q)).find(t=>t.name.toLowerCase()===q.toLowerCase());
        const tag = existing || await apiCreateTag(q, state.selectedColor).catch(()=>null);
        if(tag) await addTag(tag); input.value=''; dropdown.innerHTML='';
      }
      if (e.key==='Escape'){ closeMenu(); }
    });

    // After content rebuilds, ensure position stays correct
    if (!state.menuEl.classList.contains('is-hidden')) {
      requestAnimationFrame(() => positionMenu());
    }
  }

  const tagSystem = {
    mountInline(containerId){ state.inlineEl = document.getElementById(containerId); wireInlineEvents(); },
    mountMenu(triggerId, menuId){ state.triggerEl=document.getElementById(triggerId); state.menuEl=document.getElementById(menuId); if(state.triggerEl){ state.triggerEl.addEventListener('click',(e)=>{ e.stopPropagation(); if(state.menuEl.classList.contains('is-hidden')) openMenu(); else closeMenu(); }); } },
    async loadForNote(noteId){ state.noteId = noteId; state.tags = await apiGetNoteTags(noteId); renderInline(); if (state.menuEl && !state.menuEl.classList.contains('is-hidden')) buildMenuContent(); }
  };

try { window.tagSystem = tagSystem; } catch {}

function bootstrap() {
  if (window.__USE_TAGS_MODULES__ === false) return;
  init().catch((error) => console.error('[tags] initialization failed', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

export { TagsManager, getManager, init, tagSystem };
//# sourceMappingURL=index.js.map
