class TemplateManager {
    constructor() {
        this.templates = [];
        this.categories = {};
        this.currentTemplate = null;
        this.onTemplateSelected = null; // Callback function
        
        // Icon data for the icon picker
        this.iconCategories = {
            'General': [
                'fas fa-file-alt', 'fas fa-file', 'fas fa-folder', 'fas fa-bookmark', 'fas fa-star',
                'fas fa-heart', 'fas fa-lightbulb', 'fas fa-flag', 'fas fa-bell', 'fas fa-clock',
                'fas fa-calendar', 'fas fa-edit', 'fas fa-pen', 'fas fa-pencil-alt', 'fas fa-save'
            ],
            'Work & Business': [
                'fas fa-briefcase', 'fas fa-building', 'fas fa-users', 'fas fa-user-tie', 'fas fa-handshake',
                'fas fa-chart-line', 'fas fa-chart-bar', 'fas fa-chart-pie', 'fas fa-tasks', 'fas fa-clipboard',
                'fas fa-calculator', 'fas fa-dollar-sign', 'fas fa-euro-sign', 'fas fa-pound-sign', 'fas fa-yen-sign'
            ],
            'Education': [
                'fas fa-graduation-cap', 'fas fa-book', 'fas fa-book-open', 'fas fa-school', 'fas fa-university',
                'fas fa-microscope', 'fas fa-flask', 'fas fa-atom', 'fas fa-dna', 'fas fa-globe',
                'fas fa-language', 'fas fa-spell-check', 'fas fa-quote-left', 'fas fa-question-circle', 'fas fa-lightbulb'
            ],
            'Health & Fitness': [
                'fas fa-heartbeat', 'fas fa-dumbbell', 'fas fa-running', 'fas fa-walking', 'fas fa-biking',
                'fas fa-swimmer', 'fas fa-apple-alt', 'fas fa-carrot', 'fas fa-pills', 'fas fa-stethoscope',
                'fas fa-user-md', 'fas fa-hospital', 'fas fa-ambulance', 'fas fa-first-aid', 'fas fa-band-aid'
            ],
            'Food & Cooking': [
                'fas fa-utensils', 'fas fa-coffee', 'fas fa-wine-glass', 'fas fa-beer', 'fas fa-cocktail',
                'fas fa-pizza-slice', 'fas fa-hamburger', 'fas fa-hotdog', 'fas fa-ice-cream', 'fas fa-cookie',
                'fas fa-birthday-cake', 'fas fa-apple-alt', 'fas fa-carrot', 'fas fa-pepper-hot', 'fas fa-cheese'
            ],
            'Travel & Transport': [
                'fas fa-plane', 'fas fa-car', 'fas fa-train', 'fas fa-bus', 'fas fa-ship',
                'fas fa-bicycle', 'fas fa-motorcycle', 'fas fa-taxi', 'fas fa-subway', 'fas fa-rocket',
                'fas fa-map', 'fas fa-map-marker-alt', 'fas fa-compass', 'fas fa-route', 'fas fa-suitcase'
            ],
            'Technology': [
                'fas fa-laptop', 'fas fa-desktop', 'fas fa-mobile-alt', 'fas fa-tablet-alt', 'fas fa-keyboard',
                'fas fa-mouse', 'fas fa-headphones', 'fas fa-microphone', 'fas fa-camera', 'fas fa-video',
                'fas fa-wifi', 'fas fa-bluetooth', 'fas fa-usb', 'fas fa-plug', 'fas fa-battery-full'
            ],
            'Nature & Weather': [
                'fas fa-sun', 'fas fa-moon', 'fas fa-cloud', 'fas fa-cloud-rain', 'fas fa-snowflake',
                'fas fa-bolt', 'fas fa-rainbow', 'fas fa-tree', 'fas fa-leaf', 'fas fa-seedling',
                'fas fa-flower', 'fas fa-bug', 'fas fa-fish', 'fas fa-cat', 'fas fa-dog'
            ],
            'Entertainment': [
                'fas fa-music', 'fas fa-film', 'fas fa-camera', 'fas fa-photo-video', 'fas fa-play',
                'fas fa-gamepad', 'fas fa-dice', 'fas fa-chess', 'fas fa-puzzle-piece', 'fas fa-palette',
                'fas fa-paint-brush', 'fas fa-theater-masks', 'fas fa-guitar', 'fas fa-drum', 'fas fa-microphone-alt'
            ],
            'Communication': [
                'fas fa-envelope', 'fas fa-phone', 'fas fa-mobile-alt', 'fas fa-comments', 'fas fa-comment',
                'fas fa-sms', 'fas fa-fax', 'fas fa-bullhorn', 'fas fa-broadcast-tower', 'fas fa-satellite',
                'fas fa-share', 'fas fa-link', 'fas fa-at', 'fas fa-hashtag', 'fas fa-quote-right'
            ]
        };
        
        this.init();
    }
    
    async init() {
        await this.loadTemplates();
    }
    
    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            if (response.ok) {
                const data = await response.json();
                this.templates = data.templates;
                this.categories = data.categories;
                console.log('Templates loaded:', this.templates);
            } else {
                console.error('Failed to load templates:', response.statusText);
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }
    
    async getTemplateContent(templateId) {
        try {
            const response = await fetch(`/api/templates/${templateId}`);
            if (response.ok) {
                const template = await response.json();
                return template.content;
            } else {
                console.error('Failed to load template content:', response.statusText);
                return null;
            }
        } catch (error) {
            console.error('Error loading template content:', error);
            return null;
        }
    }
    
    showTemplateSelector(onTemplateSelected) {
        this.onTemplateSelected = onTemplateSelected;
        this.createTemplateModal();
    }
    
    createTemplateModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('templateModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        console.log('Creating template modal...'); // Debug log
        
        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'templateModal';
        modal.className = 'template-modal';
        modal.innerHTML = `
            <div class="template-modal-content">
                <div class="template-modal-header">
                    <h2><i class="fas fa-file-plus"></i> Create New Note</h2>
                    <button class="template-modal-close" aria-label="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="template-modal-body">
                    <div class="template-name-container">
                        <label for="templateNoteName">Note Name:</label>
                        <input type="text" id="templateNoteName" placeholder="Enter note name..." class="template-name-input">
                    </div>
                    <div class="template-search-container">
                        <input type="text" id="templateSearch" placeholder="Search templates..." class="template-search">
                        <i class="fas fa-search template-search-icon"></i>
                    </div>
                <div class="template-generate-container">
                    <label for="templateGenPrompt">Generate with prompt (optional):</label>
                    <textarea id="templateGenPrompt" class="template-generate-input" rows="3" placeholder="Describe what to create (e.g., weekly meal plan, keto dinner recipe, project outline)..."></textarea>
                    <div class="template-generate-actions">
                        <button class="btn btn-secondary create-template-btn" title="Save current note as template">
                            <i class="fas fa-save"></i> Save as Template
                        </button>
                    </div>
                </div>
                    <div class="template-categories">
                        ${this.renderCategories()}
                    </div>
                    <div class="template-grid" id="templateGrid">
                        ${this.renderTemplatesWithBlank()}
                    </div>
                </div>
                <div class="template-modal-footer">
                    <button class="btn btn-secondary template-modal-cancel">Cancel</button>
                    <button class="btn btn-primary template-modal-create" disabled>Create Note</button>
                </div>
            </div>
            <div class="template-modal-backdrop"></div>
        `;
        
        document.body.appendChild(modal);
        console.log('Template modal added to DOM'); // Debug log
        
        // Add event listeners
        this.setupModalEventListeners(modal);
        // Attach generate handler
        const genBtn = modal.querySelector('#templateGenBtn');
        if (genBtn) {
            genBtn.addEventListener('click', async () => {
                const promptEl = modal.querySelector('#templateGenPrompt');
                const useSelected = modal.querySelector('#templateGenUseSelected')?.checked;
                const nameInput = modal.querySelector('#templateNoteName');
                const noteName = (nameInput && nameInput.value.trim()) || 'Generated Note';
                const userPrompt = (promptEl && promptEl.value.trim()) || '';
                if (!userPrompt) { alert('Please enter a generation prompt.'); return; }
                try {
                    const skeleton = (useSelected && this.currentTemplate && this.currentTemplate !== 'blank')
                        ? await this.getTemplateContent(this.currentTemplate)
                        : null;
                    const res = await fetch('/api/compose', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'template',
                            prompt: userPrompt,
                            prefer_editorjs: true,
                            template_skeleton: skeleton ? (skeleton.blocks ? skeleton : skeleton.content || skeleton) : null
                        })
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json && (json.message || json.error) || 'generate_failed');
                    let content = null;
                    if (Array.isArray(json.blocks)) {
                        content = { blocks: json.blocks };
                    } else if (json.result_text) {
                        // As a fallback, try to parse any markdown to EditorJS
                        if (window.composeManager && typeof window.composeManager.parseMarkdownToBlocks === 'function') {
                            const blocks = await window.composeManager.parseMarkdownToBlocks(json.result_text);
                            content = { blocks };
                        } else {
                            content = { blocks: [{ type: 'paragraph', data: { text: json.result_text } }] };
                        }
                    }
                    if (!content) throw new Error('No content generated');
                    // Create a new note with generated content
                    if (window.createNoteWithTemplateAndName) {
                        await window.createNoteWithTemplateAndName('generated', content, noteName);
                    } else if (window.createNoteWithTemplate) {
                        await window.createNoteWithTemplate('generated', content);
                    }
                    this.closeModal();
                } catch (e) {
                    console.error('Generation failed:', e);
                    alert('Failed to generate note. Please try again.');
                }
            });
        }
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
            console.log('Template modal shown'); // Debug log
        }, 10);
        
        // Focus name input first
        setTimeout(() => {
            const nameInput = document.getElementById('templateNoteName');
            if (nameInput) {
                nameInput.focus();
            }
        }, 100);
    }
    
    renderCategories() {
        const allButton = `
            <button class="template-category-btn active" data-category="all">
                <i class="fas fa-th"></i>
                All Templates
            </button>
        `;
        
        const categoryButtons = Object.keys(this.categories).map(categoryKey => {
            const category = this.categories[categoryKey];
            return `
                <button class="template-category-btn" data-category="${categoryKey}">
                    <i class="${category.icon}"></i>
                    ${categoryKey}
                </button>
            `;
        }).join('');
        
        return allButton + categoryButtons;
    }
    
    renderTemplatesWithBlank(filteredTemplates = null) {
        const templatesToRender = filteredTemplates || this.templates;
        
        console.log('Rendering templates:', templatesToRender); // Debug log
        
        // Add blank note option first
        const blankNoteCard = `
            <div class="template-card template-card-blank" data-template-id="blank" data-category="Basic">
                <div class="template-card-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="template-card-content">
                    <h3 class="template-card-title">Blank Note</h3>
                    <p class="template-card-description">Start with an empty note</p>
                    <span class="template-card-category">Basic</span>
                </div>
            </div>
        `;
        
        const templateCards = templatesToRender.map(template => {
            console.log(`Template ${template.name} isCustom:`, template.isCustom); // Debug log
            return `
            <div class="template-card ${template.isCustom ? 'template-card-custom' : ''}" data-template-id="${template.id}" data-category="${template.category}">
                <div class="template-card-icon">
                    <i class="${template.icon}"></i>
                </div>
                <div class="template-card-content">
                    <h3 class="template-card-title">${template.name}</h3>
                    <p class="template-card-description">${template.description}</p>
                    <span class="template-card-category">${template.category}</span>
                    ${template.isCustom ? '<span class="template-card-custom-badge">Custom</span>' : ''}
                </div>
                ${template.isCustom ? `
                    <div class="template-card-actions">
                        <button class="template-edit-btn" data-template-id="${template.id}" title="Edit template">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="template-delete-btn" data-template-id="${template.id}" title="Delete template">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `}).join('');
        
        return blankNoteCard + templateCards;
    }
    
    renderTemplates(filteredTemplates = null) {
        const templatesToRender = filteredTemplates || this.templates;
        
        return templatesToRender.map(template => `
            <div class="template-card" data-template-id="${template.id}" data-category="${template.category}">
                <div class="template-card-icon">
                    <i class="${template.icon}"></i>
                </div>
                <div class="template-card-content">
                    <h3 class="template-card-title">${template.name}</h3>
                    <p class="template-card-description">${template.description}</p>
                    <span class="template-card-category">${template.category}</span>
                </div>
            </div>
        `).join('');
    }
    
    setupModalEventListeners(modal) {
        // Close modal events
        const closeBtn = modal.querySelector('.template-modal-close');
        const cancelBtn = modal.querySelector('.template-modal-cancel');
        const backdrop = modal.querySelector('.template-modal-backdrop');
        const createBtn = modal.querySelector('.template-modal-create');
        const nameInput = modal.querySelector('#templateNoteName');
        const createTemplateBtn = modal.querySelector('.create-template-btn');
        
        [closeBtn, cancelBtn, backdrop].forEach(element => {
            element.addEventListener('click', () => this.closeModal());
        });
        
        // Create button
        createBtn.addEventListener('click', () => this.createNoteFromTemplate());
        
        // Save as template button
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', () => this.showCreateTemplateModal());
        }
        
        // Name input validation
        nameInput.addEventListener('input', () => {
            const hasName = nameInput.value.trim().length > 0;
            const hasSelection = this.currentTemplate !== null;
            createBtn.disabled = !hasName || !hasSelection;
            
            if (hasName && hasSelection) {
                const selectedCard = modal.querySelector('.template-card.selected');
                const templateTitle = selectedCard ? selectedCard.querySelector('.template-card-title').textContent : 'Note';
                createBtn.textContent = `Create "${templateTitle}"`;
            }
        });
        
        // Template selection and actions
        const templateGrid = modal.querySelector('#templateGrid');
        templateGrid.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.template-edit-btn');
            if (editBtn) {
                e.stopPropagation();
                const templateId = editBtn.dataset.templateId;
                this.editCustomTemplate(templateId);
                return;
            }
            
            const deleteBtn = e.target.closest('.template-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const templateId = deleteBtn.dataset.templateId;
                this.deleteCustomTemplate(templateId);
                return;
            }
            
            const templateCard = e.target.closest('.template-card');
            if (templateCard) {
                this.selectTemplate(templateCard, nameInput);
            }
        });
        
        // Category filtering
        const categoryBtns = modal.querySelectorAll('.template-category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterByCategory(btn.dataset.category);
                // Update active category button
                categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Search functionality
        const searchInput = modal.querySelector('#templateSearch');
        searchInput.addEventListener('input', (e) => {
            this.searchTemplates(e.target.value);
        });
        
        // Keyboard navigation
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            } else if (e.key === 'Enter' && this.currentTemplate && nameInput.value.trim()) {
                this.createNoteFromTemplate();
            }
        });
    }
    
    selectTemplate(templateCard, nameInput = null) {
        // Remove previous selection
        const previousSelection = document.querySelector('.template-card.selected');
        if (previousSelection) {
            previousSelection.classList.remove('selected');
        }
        
        // Select new template
        templateCard.classList.add('selected');
        this.currentTemplate = templateCard.dataset.templateId;
        
        // Auto-populate name if blank
        if (nameInput && !nameInput.value.trim()) {
            const templateTitle = templateCard.querySelector('.template-card-title').textContent;
            nameInput.value = templateTitle;
        }
        
        // Enable create button if name is provided
        const createBtn = document.querySelector('.template-modal-create');
        const hasName = nameInput ? nameInput.value.trim().length > 0 : true;
        createBtn.disabled = !hasName;
        
        if (hasName) {
            const templateTitle = templateCard.querySelector('.template-card-title').textContent;
            createBtn.textContent = `Create "${templateTitle}"`;
        }
    }
    
    filterByCategory(category) {
        const templateCards = document.querySelectorAll('.template-card');
        
        templateCards.forEach(card => {
            if (category === 'all' || card.dataset.category === category) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    searchTemplates(query) {
        const templateCards = document.querySelectorAll('.template-card');
        const normalizedQuery = query.toLowerCase();
        
        templateCards.forEach(card => {
            const title = card.querySelector('.template-card-title').textContent.toLowerCase();
            const description = card.querySelector('.template-card-description').textContent.toLowerCase();
            const category = card.querySelector('.template-card-category').textContent.toLowerCase();
            
            const matches = title.includes(normalizedQuery) || 
                          description.includes(normalizedQuery) || 
                          category.includes(normalizedQuery);
            
            card.style.display = matches ? 'block' : 'none';
        });
    }
    
    async createNoteFromTemplate() {
        if (!this.currentTemplate) return;
        
        try {
            const nameInput = document.getElementById('templateNoteName');
            const noteName = nameInput ? nameInput.value.trim() : '';
            
            if (!noteName) {
                alert('Please enter a name for your note.');
                if (nameInput) nameInput.focus();
                return;
            }
            
            // Optional: generation prompt
            const promptEl = document.getElementById('templateGenPrompt');
            const userPrompt = promptEl ? promptEl.value.trim() : '';

            // Show progress UI
            const createBtn = document.querySelector('.template-modal-create');
            const cancelBtn = document.querySelector('.template-modal-cancel');
            const setBusy = (on) => {
                [createBtn, cancelBtn, nameInput].forEach(b => { if (b) b.disabled = !!on; });
                if (createBtn) createBtn.innerHTML = on ? '<i class="fas fa-spinner fa-spin"></i> Creating…' : 'Create Note';
            };
            setBusy(true);

            let templateContent = null;
            const isBlank = (this.currentTemplate === 'blank');
            const skeleton = isBlank ? { blocks: [] } : await this.getTemplateContent(this.currentTemplate);

            if (userPrompt) {
                // Generate using skeleton and prompt
                try {
                    const res = await fetch('/api/compose', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'template',
                            prompt: userPrompt,
                            prefer_editorjs: true,
                            template_id: this.currentTemplate,
                            template_skeleton: skeleton ? (skeleton.blocks ? skeleton : (skeleton.content || skeleton)) : null
                        })
                    });
                    const json = await res.json();
                    if (res.ok && Array.isArray(json.blocks)) {
                        // Normalize blocks for compatibility (e.g., columns/cols)
                        const normalize = (blocks) => {
                            if (window.composeManager && typeof window.composeManager.normalizeBlocks === 'function') {
                                return window.composeManager.normalizeBlocks(blocks);
                            }
                            const out = [];
                            for (const b of (blocks || [])) {
                                let t = (b.type || '').toLowerCase();
                                const d = b.data || {};
                                const hasCols = Array.isArray(d.cols) || Array.isArray(d.columns);
                                if (t !== 'columns' && hasCols) {
                                    const dCopy = { ...d }; delete dCopy.cols; delete dCopy.columns;
                                    out.push({ type: t, data: dCopy });
                                    const rawCols = Array.isArray(d.cols) ? d.cols : (Array.isArray(d.columns) ? d.columns : []);
                                    const cols = rawCols.map(c => (Array.isArray(c) ? { blocks: c } : (c && Array.isArray(c.blocks) ? { blocks: c.blocks } : { blocks: [] })));
                                    out.push({ type: 'columns', data: { cols } });
                                    continue;
                                }
                                if (t === 'columns') {
                                    const rawCols = Array.isArray(d.cols) ? d.cols : (Array.isArray(d.columns) ? d.columns : []);
                                    d.cols = rawCols.map(c => (Array.isArray(c) ? { blocks: c } : (c && Array.isArray(c.blocks) ? { blocks: c.blocks } : { blocks: [] })));
                                    delete d.columns;
                                }
                                out.push({ type: t, data: d });
                            }
                            return out;
                        };
                        templateContent = { blocks: normalize(json.blocks) };
                    } else if (res.ok && json.result_text) {
                        // Fallback to parse markdown
                        if (window.composeManager && typeof window.composeManager.parseMarkdownToBlocks === 'function') {
                            const blocks = await window.composeManager.parseMarkdownToBlocks(json.result_text);
                            templateContent = { blocks };
                        }
                    }
                } catch (e) {
                    console.warn('Template generation failed:', e);
                }
            }

            // If no generation or generation failed, default to skeleton
            if (!templateContent) {
                templateContent = skeleton && (skeleton.blocks ? skeleton : (skeleton.content || skeleton)) || { blocks: [] };
            }

            // Create the note
            if (this.onTemplateSelected) {
                this.onTemplateSelected(this.currentTemplate, templateContent, noteName);
            }
            this.closeModal();
            setBusy(false);
        } catch (error) {
            console.error('Error creating note from template:', error);
            alert('Failed to create note. Please try again.');
        }
    }
    
    closeModal() {
        const modal = document.getElementById('templateModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
        this.currentTemplate = null;
    }
    
    // Method to create a note with template content directly
    async applyTemplateToNote(templateId, noteId) {
        try {
            const templateContent = await this.getTemplateContent(templateId);
            if (templateContent && window.editorInstance) {
                await window.editorInstance.render(templateContent);
                window.editorInstance.setCurrentNote(noteId);
                console.log(`Template ${templateId} applied to note ${noteId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error applying template to note:', error);
            return false;
        }
    }
    
    showCreateTemplateModal() {
        // Check if we have current note content
        if (!window.editorInstance) {
            alert('No editor instance available');
            return;
        }
        
        // Close the template selection modal first
        this.closeModal();
        
        // Create the custom template creation modal
        const modal = document.createElement('div');
        modal.id = 'createTemplateModal';
        modal.className = 'template-modal';
        modal.innerHTML = `
            <div class="template-modal-content">
                <div class="template-modal-header">
                    <h2><i class="fas fa-save"></i> Save as Template</h2>
                    <button class="template-modal-close" aria-label="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="template-modal-body">
                    <form id="createTemplateForm">
                        <div class="form-group">
                            <label for="customTemplateName">Template Name:</label>
                            <input type="text" id="customTemplateName" placeholder="Enter template name..." class="template-name-input" required>
                        </div>
                        <div class="form-group">
                            <label for="customTemplateDescription">Description:</label>
                            <textarea id="customTemplateDescription" placeholder="Describe what this template is for..." class="template-description-input" rows="3" required></textarea>
                        </div>
                        <div class="form-group">
                            <label for="customTemplateCategory">Category:</label>
                            <select id="customTemplateCategory" class="template-category-select">
                                <option value="Custom">Custom</option>
                                ${Object.keys(this.categories).map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                                <option value="__new__">+ Create New Category</option>
                            </select>
                            <input type="text" id="customTemplateCategoryInput" placeholder="Enter new category name..." class="template-category-input" style="display: none;">
                        </div>
                        <div class="form-group">
                            <label for="customTemplateIcon">Icon:</label>
                            <div class="icon-picker-container">
                                <div class="icon-preview" id="iconPreview">
                                    <i class="fas fa-file-alt"></i>
                                </div>
                                <button type="button" class="btn btn-secondary icon-picker-btn" id="openIconPicker">
                                    Choose Icon
                                </button>
                                <input type="hidden" id="customTemplateIcon" value="fas fa-file-alt">
                            </div>
                        </div>
                    </form>
                </div>
                <div class="template-modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('createTemplateModal').remove()">Cancel</button>
                    <button class="btn btn-primary" id="saveTemplateBtn">Save Template</button>
                </div>
            </div>
            <div class="template-modal-backdrop"></div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => modal.classList.add('show'), 10);
        
        // Focus template name input
        setTimeout(() => {
            const nameInput = document.getElementById('customTemplateName');
            if (nameInput) nameInput.focus();
        }, 100);
        
        // Handle save button
        document.getElementById('saveTemplateBtn').addEventListener('click', () => {
            this.saveCustomTemplate();
        });
        
        // Handle form submission
        document.getElementById('createTemplateForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCustomTemplate();
        });
        
        // Handle icon picker button
        document.getElementById('openIconPicker').addEventListener('click', () => {
            this.openIconPicker('customTemplateIcon', 'iconPreview');
        });
        
        // Handle category selection change
        document.getElementById('customTemplateCategory').addEventListener('change', (e) => {
            const categoryInput = document.getElementById('customTemplateCategoryInput');
            if (e.target.value === '__new__') {
                categoryInput.style.display = 'block';
                categoryInput.focus();
                categoryInput.required = true;
            } else {
                categoryInput.style.display = 'none';
                categoryInput.required = false;
                categoryInput.value = '';
            }
        });
        
        // Close modal on backdrop click
        modal.querySelector('.template-modal-backdrop').addEventListener('click', () => {
            modal.remove();
        });
        
        // Close on close button
        modal.querySelector('.template-modal-close').addEventListener('click', () => {
            modal.remove();
        });
    }
    
    async saveCustomTemplate() {
        try {
            const name = document.getElementById('customTemplateName').value.trim();
            const description = document.getElementById('customTemplateDescription').value.trim();
            const categorySelect = document.getElementById('customTemplateCategory').value;
            const categoryInput = document.getElementById('customTemplateCategoryInput').value.trim();
            const icon = document.getElementById('customTemplateIcon').value.trim() || 'fas fa-file-alt';
            
            // Determine the final category
            let category;
            if (categorySelect === '__new__') {
                if (!categoryInput) {
                    alert('Please enter a category name');
                    document.getElementById('customTemplateCategoryInput').focus();
                    return;
                }
                category = categoryInput;
            } else {
                category = categorySelect;
            }
            
            if (!name || !description) {
                alert('Please fill in all required fields');
                return;
            }
            
            // Get current editor content using the correct method
            const content = await window.editorInstance.getData();
            
            if (!content || !content.blocks || content.blocks.length === 0) {
                alert('No content to save as template. Please add some content to your note first.');
                return;
            }
            
            // Prepare template data
            const templateData = {
                name,
                description,
                content,
                icon,
                category
            };
            
            // Send to backend
            const response = await fetch('/api/templates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(templateData)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Success
                alert('Template saved successfully!');
                
                // Reload templates
                await this.loadTemplates();
                
                // Close modal
                document.getElementById('createTemplateModal').remove();
                
                // Show success notification
                this.showNotification('Template saved successfully!', 'success');
            } else {
                alert(result.message || 'Failed to save template');
            }
            
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save template. Please try again.');
        }
    }
    
    async editCustomTemplate(templateId) {
        try {
            // First, get the template data
            const templateData = await this.getTemplateContent(templateId);
            if (!templateData) {
                alert('Failed to load template data');
                return;
            }
            
            console.log('Loaded template data for editing:', templateData); // Debug log
            
            // Find template metadata
            const templateMeta = this.templates.find(t => t.id === templateId);
            if (!templateMeta) {
                alert('Template metadata not found');
                return;
            }
            
            console.log('Template metadata:', templateMeta); // Debug log
            
            // Close the template selection modal first
            this.closeModal();
            
            // Create the edit template modal
            const modal = document.createElement('div');
            modal.id = 'editTemplateModal';
            modal.className = 'template-modal';
            modal.innerHTML = `
                <div class="template-modal-content">
                    <div class="template-modal-header">
                        <h2><i class="fas fa-edit"></i> Edit Template</h2>
                        <button class="template-modal-close" aria-label="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="template-modal-body">
                        <form id="editTemplateForm">
                            <div class="form-group">
                                <label for="editTemplateName">Template Name:</label>
                                <input type="text" id="editTemplateName" value="${templateMeta.name}" class="template-name-input" required>
                            </div>
                            <div class="form-group">
                                <label for="editTemplateDescription">Description:</label>
                                <textarea id="editTemplateDescription" class="template-description-input" rows="3" required>${templateMeta.description}</textarea>
                            </div>
                            <div class="form-group">
                                <label for="editTemplateCategory">Category:</label>
                                <select id="editTemplateCategory" class="template-category-select">
                                    <option value="Custom" ${templateMeta.category === 'Custom' ? 'selected' : ''}>Custom</option>
                                    ${Object.keys(this.categories).map(cat => 
                                        `<option value="${cat}" ${templateMeta.category === cat ? 'selected' : ''}>${cat}</option>`
                                    ).join('')}
                                    <option value="__new__">+ Create New Category</option>
                                </select>
                                <input type="text" id="editTemplateCategoryInput" placeholder="Enter new category name..." class="template-category-input" style="display: none;">
                            </div>
                            <div class="form-group">
                                <label for="editTemplateIcon">Icon:</label>
                                <div class="icon-picker-container">
                                    <div class="icon-preview" id="editIconPreview">
                                        <i class="${templateMeta.icon}"></i>
                                    </div>
                                    <button type="button" class="btn btn-secondary icon-picker-btn" id="openEditIconPicker">
                                        Choose Icon
                                    </button>
                                    <input type="hidden" id="editTemplateIcon" value="${templateMeta.icon}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="editTemplateContent"> Update content from current note
                                </label>
                                <small class="form-help">Check this to replace the template content with the current note's content</small>
                            </div>
                        </form>
                    </div>
                    <div class="template-modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('editTemplateModal').remove()">Cancel</button>
                        <button class="btn btn-primary" id="updateTemplateBtn">Update Template</button>
                    </div>
                </div>
                <div class="template-modal-backdrop"></div>
            `;
            
            document.body.appendChild(modal);
            
            // Show modal
            setTimeout(() => modal.classList.add('show'), 10);
            
            // Focus template name input
            setTimeout(() => {
                const nameInput = document.getElementById('editTemplateName');
                if (nameInput) nameInput.focus();
            }, 100);
            
            // Handle update button
            document.getElementById('updateTemplateBtn').addEventListener('click', () => {
                this.updateCustomTemplate(templateId, templateData);
            });
            
            // Handle form submission
            document.getElementById('editTemplateForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateCustomTemplate(templateId, templateData);
            });
            
            // Handle icon picker button
            document.getElementById('openEditIconPicker').addEventListener('click', () => {
                this.openIconPicker('editTemplateIcon', 'editIconPreview');
            });
            
            // Handle category selection change
            document.getElementById('editTemplateCategory').addEventListener('change', (e) => {
                const categoryInput = document.getElementById('editTemplateCategoryInput');
                if (e.target.value === '__new__') {
                    categoryInput.style.display = 'block';
                    categoryInput.focus();
                    categoryInput.required = true;
                } else {
                    categoryInput.style.display = 'none';
                    categoryInput.required = false;
                    categoryInput.value = '';
                }
            });
            
            // Close modal on backdrop click
            modal.querySelector('.template-modal-backdrop').addEventListener('click', () => {
                modal.remove();
            });
            
            // Close on close button
            modal.querySelector('.template-modal-close').addEventListener('click', () => {
                modal.remove();
            });
            
        } catch (error) {
            console.error('Error editing template:', error);
            alert('Failed to edit template. Please try again.');
        }
    }
    
    async updateCustomTemplate(templateId, originalTemplateData) {
        try {
            const name = document.getElementById('editTemplateName').value.trim();
            const description = document.getElementById('editTemplateDescription').value.trim();
            const categorySelect = document.getElementById('editTemplateCategory').value;
            const categoryInput = document.getElementById('editTemplateCategoryInput').value.trim();
            const icon = document.getElementById('editTemplateIcon').value.trim() || 'fas fa-file-alt';
            const updateContent = document.getElementById('editTemplateContent').checked;
            
            console.log('Form values:', { name, description, categorySelect, categoryInput, icon, updateContent }); // Debug log
            
            // Determine the final category
            let category;
            if (categorySelect === '__new__') {
                if (!categoryInput) {
                    alert('Please enter a category name');
                    document.getElementById('editTemplateCategoryInput').focus();
                    return;
                }
                category = categoryInput;
            } else {
                category = categorySelect;
            }
            
            if (!name || !description) {
                alert('Please fill in all required fields');
                return;
            }
            
            // Determine content to use
            let content = originalTemplateData.content;
            if (updateContent) {
                // Get current editor content
                const currentContent = await window.editorInstance.getData();
                if (!currentContent || !currentContent.blocks || currentContent.blocks.length === 0) {
                    alert('No content in current note to update with.');
                    return;
                }
                content = currentContent;
            }
            
            // Ensure content is valid
            if (!content || (typeof content === 'object' && (!content.blocks || content.blocks.length === 0))) {
                console.warn('Content is empty, using default structure');
                content = { blocks: [] };
            }
            
            console.log('Final content to send:', content); // Debug log
            
            // Prepare template data
            const templateData = {
                name,
                description,
                content,
                icon,
                category
            };
            
            console.log('Sending template data:', templateData); // Debug log
            
            // Send to backend
            const response = await fetch(`/api/templates/${templateId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(templateData)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Success
                alert('Template updated successfully!');
                
                // Reload templates
                await this.loadTemplates();
                
                // Close modal
                document.getElementById('editTemplateModal').remove();
                
                // Show success notification
                this.showNotification('Template updated successfully!', 'success');
            } else {
                console.error('Update failed:', result); // Debug log
                alert(result.message || 'Failed to update template');
            }
            
        } catch (error) {
            console.error('Error updating template:', error);
            alert('Failed to update template. Please try again.');
        }
    }

    async deleteCustomTemplate(templateId) {
        if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/templates/${templateId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Success - reload templates
                await this.loadTemplates();
                
                // Refresh the template grid
                const templateGrid = document.getElementById('templateGrid');
                if (templateGrid) {
                    templateGrid.innerHTML = this.renderTemplatesWithBlank();
                }
                
                this.showNotification('Template deleted successfully!', 'success');
            } else {
                alert(result.message || 'Failed to delete template');
            }
            
        } catch (error) {
            console.error('Error deleting template:', error);
            alert('Failed to delete template. Please try again.');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show with animation
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    openIconPicker(iconInputId, iconPreviewId) {
        // Create icon picker modal
        const modal = document.createElement('div');
        modal.id = 'iconPickerModal';
        modal.className = 'template-modal icon-picker-modal';
        modal.innerHTML = `
            <div class="template-modal-content icon-picker-content">
                <div class="template-modal-header">
                    <h2><i class="fas fa-icons"></i> Choose Icon</h2>
                    <button class="template-modal-close" aria-label="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="template-modal-body">
                    <div class="icon-search-container">
                        <input type="text" id="iconSearch" placeholder="Search icons..." class="icon-search-input">
                        <i class="fas fa-search icon-search-icon"></i>
                    </div>
                    <div class="icon-categories-tabs">
                        ${Object.keys(this.iconCategories).map((category, index) => `
                            <button class="icon-category-tab ${index === 0 ? 'active' : ''}" data-category="${category}">
                                ${category}
                            </button>
                        `).join('')}
                    </div>
                    <div class="icon-grid" id="iconGrid">
                        ${this.renderIconCategory(Object.keys(this.iconCategories)[0])}
                    </div>
                </div>
                <div class="template-modal-footer">
                    <button class="btn btn-secondary" id="cancelIconPicker">Cancel</button>
                    <button class="btn btn-primary" id="confirmIconPicker" disabled>Select Icon</button>
                </div>
            </div>
            <div class="template-modal-backdrop"></div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => modal.classList.add('show'), 10);
        
        let selectedIcon = null;
        
        // Handle icon selection
        const iconGrid = modal.querySelector('#iconGrid');
        iconGrid.addEventListener('click', (e) => {
            const iconItem = e.target.closest('.icon-item');
            if (iconItem) {
                // Remove previous selection
                modal.querySelectorAll('.icon-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Select new icon
                iconItem.classList.add('selected');
                selectedIcon = iconItem.dataset.icon;
                
                // Enable confirm button
                modal.querySelector('#confirmIconPicker').disabled = false;
            }
        });
        
        // Handle category tabs
        modal.querySelectorAll('.icon-category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                modal.querySelectorAll('.icon-category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update icon grid
                iconGrid.innerHTML = this.renderIconCategory(tab.dataset.category);
                
                // Clear selection
                selectedIcon = null;
                modal.querySelector('#confirmIconPicker').disabled = true;
            });
        });
        
        // Handle search
        const searchInput = modal.querySelector('#iconSearch');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.filterIcons(query, iconGrid);
        });
        
        // Handle confirm
        modal.querySelector('#confirmIconPicker').addEventListener('click', () => {
            if (selectedIcon) {
                // Update the icon input and preview
                document.getElementById(iconInputId).value = selectedIcon;
                const preview = document.getElementById(iconPreviewId);
                preview.innerHTML = `<i class="${selectedIcon}"></i>`;
                
                // Close modal
                modal.remove();
            }
        });
        
        // Handle cancel
        modal.querySelector('#cancelIconPicker').addEventListener('click', () => {
            modal.remove();
        });
        
        // Handle close button
        modal.querySelector('.template-modal-close').addEventListener('click', () => {
            modal.remove();
        });
        
        // Handle backdrop click
        modal.querySelector('.template-modal-backdrop').addEventListener('click', () => {
            modal.remove();
        });
    }
    
    renderIconCategory(categoryName) {
        const icons = this.iconCategories[categoryName] || [];
        return icons.map(icon => `
            <div class="icon-item" data-icon="${icon}" title="${this.getIconName(icon)}">
                <i class="${icon}"></i>
            </div>
        `).join('');
    }
    
    getIconName(iconClass) {
        // Convert icon class to readable name
        return iconClass.replace('fas fa-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    filterIcons(query, iconGrid) {
        if (!query) {
            // Show first category when search is cleared
            iconGrid.innerHTML = this.renderIconCategory(Object.keys(this.iconCategories)[0]);
            return;
        }
        
        // Search across all categories
        const allIcons = [];
        Object.values(this.iconCategories).forEach(categoryIcons => {
            categoryIcons.forEach(icon => {
                const iconName = this.getIconName(icon).toLowerCase();
                if (iconName.includes(query) || icon.includes(query)) {
                    allIcons.push(icon);
                }
            });
        });
        
        iconGrid.innerHTML = allIcons.map(icon => `
            <div class="icon-item" data-icon="${icon}" title="${this.getIconName(icon)}">
                <i class="${icon}"></i>
            </div>
        `).join('');
        
        if (allIcons.length === 0) {
            iconGrid.innerHTML = '<div class="no-icons-found">No icons found</div>';
        }
    }
}

// Global template manager instance
window.templateManager = new TemplateManager();
