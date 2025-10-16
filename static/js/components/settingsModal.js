/**
 * Settings Modal Component
 * Manages user options, agents, and tags configuration
 */

class SettingsModal {
  constructor() {
    this.modal = null;
    this.backdrop = null;
    this.currentTab = 'user-options';
    this.isDirty = false;
    this.formData = {};
    this.agentsEmbedded = false;
    this.tagsEmbedded = false;
    
    // Bind escape key handler
    this.handleEscapeKey = this.handleEscapeKey.bind(this);
    
    this.init();
  }

  init() {
    console.log('SettingsModal: Initializing...');
    this.createModal();
    this.attachEventListeners();
    this.loadInitialData();
    console.log('SettingsModal: Initialization complete');
  }

  createModal() {
    console.log('SettingsModal: Creating modal elements...');
    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'settings-modal-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'settings-modal';
    this.modal.innerHTML = this.getModalHTML();

    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.modal);
    console.log('SettingsModal: Modal elements created and appended to body');
  }

  getModalHTML() {
    return `
      <div class="settings-modal-content">
        <div class="settings-tabs">
          <div class="settings-modal-header">
            <h2>Settings</h2>
            <button class="close-btn" aria-label="Close settings modal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <button class="tab-button active" data-tab="user-options">
            <i class="fas fa-cog"></i> User Options
          </button>
          <button class="tab-button" data-tab="agents">
            <i class="fas fa-robot"></i> Agents
          </button>
          <button class="tab-button" data-tab="tags">
            <i class="fas fa-tags"></i> Tags
          </button>
        </div>

        <div class="settings-modal-body">
          ${this.getUserOptionsTabHTML()}
          ${this.getAgentsTabHTML()}
          ${this.getTagsTabHTML()}
        </div>
      </div>
    `;
  }

  getUserOptionsTabHTML() {
    return `
      <div class="settings-tab-content active" data-tab-content="user-options">
        
        <!-- Model Configuration Section -->
        <div class="settings-section">
          <h3 class="section-title">Model Configuration</h3>
          <p class="section-description">
            Configure the AI models used for different operations. Changes require app restart.
          </p>

          <div class="settings-grid">
            <div class="settings-form-group">
              <label for="composeModel">
                Compose Model
                <i class="fas fa-info-circle tooltip-icon" title="The LLM model used for the 'Compose' feature that helps you write and edit text content. Use a model with good instruction-following capabilities."></i>
              </label>
              <select id="composeModel" name="COMPOSE_MODEL" class="model-select">
                <option value="">Loading models...</option>
              </select>
            </div>

            <div class="settings-form-group">
              <label for="agentModel">
                Agent Model
                <i class="fas fa-info-circle tooltip-icon" title="The LLM model used for conversational chat agents. This handles question-answering, reasoning, and interactive conversations."></i>
              </label>
              <select id="agentModel" name="AGENT_MODEL" class="model-select">
                <option value="">Loading models...</option>
              </select>
            </div>

            <div class="settings-form-group">
              <label for="ragModel">
                RAG Model
                <i class="fas fa-info-circle tooltip-icon" title="The LLM model used for Retrieval-Augmented Generation. This model processes retrieved context from your documents to generate informed responses."></i>
              </label>
              <select id="ragModel" name="RAG_MODEL" class="model-select">
                <option value="">Loading models...</option>
              </select>
            </div>

            <div class="settings-form-group">
              <label for="recipeModel">
                Recipe Model
                <i class="fas fa-info-circle tooltip-icon" title="The LLM model used for generating content from templates and recipes. Should have good creative and structured output capabilities."></i>
              </label>
              <select id="recipeModel" name="RECIPE_MODEL" class="model-select">
                <option value="">Loading models...</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Token Limits Section -->
        <div class="settings-section">
          <h3 class="section-title">Token Limits</h3>
          <p class="section-description">
            Configure maximum token limits for different operations.
          </p>

          <div class="settings-grid">
            <div class="settings-form-group">
              <label for="recipeMaxTokens">
                Recipe Max Tokens
                <i class="fas fa-info-circle tooltip-icon" title="Maximum number of tokens (roughly 4 characters = 1 token) that the model can generate when creating content from recipes. Higher values allow longer outputs but take more time and resources."></i>
              </label>
              <input type="number" id="recipeMaxTokens" name="RECIPE_MAX_TOKENS" min="500" max="8000" step="100">
            </div>

            <div class="settings-form-group">
              <label for="templateMaxTokens">
                Template Max Tokens
                <i class="fas fa-info-circle tooltip-icon" title="Maximum tokens for template-based content generation. Controls how long the generated content can be when using templates."></i>
              </label>
              <input type="number" id="templateMaxTokens" name="TEMPLATE_MAX_TOKENS" min="500" max="4000" step="100">
            </div>

            <div class="settings-form-group">
              <label for="generateMaxTokens">
                Generate Max Tokens
                <i class="fas fa-info-circle tooltip-icon" title="Maximum tokens for general content generation tasks. Applies to various AI-powered content creation features throughout the app."></i>
              </label>
              <input type="number" id="generateMaxTokens" name="GENERATE_MAX_TOKENS" min="500" max="4000" step="100">
            </div>

            <div class="settings-form-group">
              <label for="composeMaxTokens">
                Compose Max Tokens
                <i class="fas fa-info-circle tooltip-icon" title="Maximum tokens for the Compose feature. Lower values mean faster responses but potentially incomplete suggestions. Typical range: 500-2000."></i>
              </label>
              <input type="number" id="composeMaxTokens" name="COMPOSE_MAX_TOKENS" min="500" max="2000" step="100">
            </div>
          </div>
        </div>

        <!-- Search Engine Configuration -->
        <div class="settings-section">
          <h3 class="section-title">Search Engines</h3>
          <p class="section-description">
            Configure search engine integrations for web searches. Enable the engines your agents can use.
          </p>

          <div class="settings-form-group">
            <label for="braveApiKey">
              Brave Search API Key
              <i class="fas fa-info-circle tooltip-icon" title="API key for Brave Search. Provides privacy-focused web search results. Get your free API key from brave.com/search/api/"></i>
            </label>
            <div class="input-with-toggle">
              <input type="text" id="braveApiKey" name="BRAVE_API_KEY" placeholder="Enter your Brave API key" style="font-family: monospace; letter-spacing: 1px;">
              <button type="button" class="toggle-visibility-btn" data-target="braveApiKey" title="Show/Hide API key">
                <i class="fas fa-eye"></i>
              </button>
              <button type="button" class="verify-api-btn" id="verifyBraveApiBtn" title="Verify API key">
                <i class="fas fa-check-circle"></i>
              </button>
            </div>
            <p class="help-text" id="braveApiKeyStatus">Get your free API key from <a href="https://brave.com/search/api/" target="_blank">Brave Search API</a></p>
          </div>

          <div class="settings-form-group">
            <label>
              Enabled Search Engines
              <i class="fas fa-info-circle tooltip-icon" title="Select which search engines agents can use for web searches. Multiple engines can be enabled simultaneously for fallback and redundancy."></i>
            </label>
            <div class="checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" name="ENABLE_BRAVE_SEARCH" id="enableBrave">
                <span>Brave Search (requires API key)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="ENABLE_SEARXNG" id="enableSearxng">
                <span>SearXNG (self-hosted metasearch)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="ENABLE_YACY" id="enableYacy">
                <span>YaCy (decentralized P2P search)</span>
              </label>
            </div>
          </div>

          <div class="settings-grid">
            <div class="settings-form-group">
              <label for="searxngUrl">
                SearXNG URL
                <i class="fas fa-info-circle tooltip-icon" title="URL of your SearXNG instance. SearXNG is a privacy-respecting metasearch engine that aggregates results from multiple sources."></i>
              </label>
              <input type="url" id="searxngUrl" name="SEARXNG_URL" placeholder="http://localhost:8080">
            </div>

            <div class="settings-form-group">
              <label for="yacyUrl">
                YaCy URL
                <i class="fas fa-info-circle tooltip-icon" title="URL of your YaCy node. YaCy is a decentralized peer-to-peer search engine that doesn't rely on central servers."></i>
              </label>
              <input type="url" id="yacyUrl" name="YACY_URL" placeholder="http://localhost:8090">
            </div>
          </div>
        </div>

        <!-- RAG Configuration -->
        <div class="settings-section">
          <h3 class="section-title">RAG Configuration</h3>
          <p class="section-description">
            Configure Retrieval-Augmented Generation settings.
          </p>
          <p class="warning-text">
            <i class="fas fa-exclamation-triangle"></i>
            Changing embedding model requires deleting existing embeddings (data/chroma_db/)
          </p>

          <div class="settings-form-group">
            <label for="ragEmbeddingModel">
              Embedding Model
              <i class="fas fa-info-circle tooltip-icon" title="The model used to convert text into vector embeddings for semantic search. Choose multilingual models if you work with multiple languages. Larger models provide better quality but are slower."></i>
            </label>
            <select id="ragEmbeddingModel" name="RAG_EMBEDDING_MODEL">
              <option value="nomic-embed-text:latest">nomic-embed-text (Ollama - English only)</option>
              <option value="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2">paraphrase-multilingual-MiniLM-L12-v2 (Fast, 50+ languages)</option>
              <option value="sentence-transformers/intfloat/multilingual-e5-base">multilingual-e5-base (Balanced, 100+ languages)</option>
              <option value="sentence-transformers/intfloat/multilingual-e5-large">multilingual-e5-large (Best quality, 100+ languages)</option>
              <option value="sentence-transformers/BAAI/bge-m3">bge-m3 (Production, 100+ languages)</option>
            </select>
          </div>

          <div class="settings-grid">
            <div class="settings-form-group">
              <label for="chatAgentTopK">
                Top K Results
                <i class="fas fa-info-circle tooltip-icon" title="Maximum number of document chunks to retrieve from the vector database. Higher values provide more context but may include less relevant information. Typical range: 3-10."></i>
              </label>
              <input type="number" id="chatAgentTopK" name="CHAT_AGENT_TOP_K" min="1" max="20" step="1">
            </div>

            <div class="settings-form-group">
              <label for="chatAgentMinTopK">
                Min Top K Results
                <i class="fas fa-info-circle tooltip-icon" title="Minimum number of chunks to retrieve even if they have low relevance scores. Ensures the agent always has some context to work with. Should be less than Top K."></i>
              </label>
              <input type="number" id="chatAgentMinTopK" name="CHAT_AGENT_MIN_TOP_K" min="1" max="10" step="1">
            </div>

            <div class="settings-form-group">
              <label for="chatAgentRelevanceThreshold">
                Relevance Threshold
                <i class="fas fa-info-circle tooltip-icon" title="Minimum cosine similarity score (0.0-1.0) for a chunk to be considered relevant. Higher values mean stricter filtering, only very relevant chunks are used. Typical: 0.5-0.7."></i>
              </label>
              <input type="number" id="chatAgentRelevanceThreshold" name="CHAT_AGENT_RELEVANCE_THRESHOLD" min="0" max="1" step="0.05">
            </div>

            <div class="settings-form-group">
              <label for="chatAgentTemperature">
                Temperature
                <i class="fas fa-info-circle tooltip-icon" title="Controls randomness in responses (0.0-2.0). Lower values (0.1-0.5) make outputs more focused and deterministic. Higher values (0.8-1.5) make them more creative and varied. Default: 0.7."></i>
              </label>
              <input type="number" id="chatAgentTemperature" name="CHAT_AGENT_TEMPERATURE" min="0" max="2" step="0.1">
            </div>
          </div>
        </div>

      </div>
    `;
  }

  getAgentsTabHTML() {
    return `
      <div class="settings-tab-content" data-tab-content="agents">
        <!-- Agents section will be embedded directly here -->
      </div>
    `;
  }

  getTagsTabHTML() {
    return `
      <div class="settings-tab-content" data-tab-content="tags">
        <!-- Tags section will be embedded directly here -->
      </div>
    `;
  }

  attachEventListeners() {
    // Close button
    const closeBtn = this.modal.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Tab switching
    this.modal.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-button').dataset.tab));
    });

    // Track form changes and auto-save
    this.modal.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('change', () => {
        this.isDirty = true;
        this.autoSave();
      });
    });
    
    // Toggle visibility buttons for password fields
    this.modal.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.dataset.target;
        const input = document.getElementById(targetId);
        const icon = e.currentTarget.querySelector('i');
        
        if (input.type === 'password' || input.style.webkitTextSecurity === 'disc') {
          input.type = 'text';
          input.style.webkitTextSecurity = 'none';
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        } else {
          input.type = 'text';
          input.style.webkitTextSecurity = 'disc';
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        }
      });
    });
    
    // Verify API key button
    const verifyBraveBtn = this.modal.querySelector('#verifyBraveApiBtn');
    if (verifyBraveBtn) {
      verifyBraveBtn.addEventListener('click', () => this.verifyBraveApiKey());
    }
    
    // Enable/disable URL inputs based on checkbox state
    const enableBrave = this.modal.querySelector('#enableBrave');
    const enableSearxng = this.modal.querySelector('#enableSearxng');
    const enableYacy = this.modal.querySelector('#enableYacy');
    const searxngUrl = this.modal.querySelector('#searxngUrl');
    const yacyUrl = this.modal.querySelector('#yacyUrl');
    const braveApiKey = this.modal.querySelector('#braveApiKey');
    
    const updateInputStates = () => {
      if (braveApiKey) {
        braveApiKey.disabled = !enableBrave.checked;
      }
      if (searxngUrl) {
        searxngUrl.disabled = !enableSearxng.checked;
      }
      if (yacyUrl) {
        yacyUrl.disabled = !enableYacy.checked;
      }
    };
    
    if (enableBrave) enableBrave.addEventListener('change', updateInputStates);
    if (enableSearxng) enableSearxng.addEventListener('change', updateInputStates);
    if (enableYacy) enableYacy.addEventListener('change', updateInputStates);
    
    // Initial state
    updateInputStates();
  }

  handleEscapeKey(e) {
    if (e.key === 'Escape' && this.modal && this.modal.classList.contains('is-active')) {
      this.close();
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab buttons
    this.modal.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    this.modal.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tabContent === tabName);
    });

    // Dispatch event for integrations
    document.dispatchEvent(new CustomEvent('settingsModalTabChanged', { 
      detail: { tab: tabName } 
    }));

    // Handle agents/tags sections
    if (tabName === 'agents') {
      this.embedAgentsSection();
    } else if (tabName === 'tags') {
      this.embedTagsSection();
    }
  }

  async loadInitialData() {
    try {
      // Load available models
      await this.loadAvailableModels();
      
      // Load current settings
      const response = await fetch('/api/settings/env');
      if (response.ok) {
        const data = await response.json();
        this.populateForm(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  async loadAvailableModels() {
    try {
      const ollamaUrl = 'http://127.0.0.1:11434';
      const response = await fetch(`${ollamaUrl}/api/tags`);
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        
        // Update all model select dropdowns
        const modelSelects = this.modal.querySelectorAll('.model-select');
        modelSelects.forEach(select => {
          const currentValue = select.value;
          select.innerHTML = '<option value="">-- Select a model --</option>';
          
          models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            select.appendChild(option);
          });
          
          // Restore previous value if it exists
          if (currentValue && models.find(m => m.name === currentValue)) {
            select.value = currentValue;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      // Keep the "Loading models..." text or show error
      const modelSelects = this.modal.querySelectorAll('.model-select');
      modelSelects.forEach(select => {
        select.innerHTML = '<option value="">Failed to load models - check Ollama</option>';
      });
    }
  }

  populateForm(data) {
    Object.keys(data).forEach(key => {
      const input = this.modal.querySelector(`[name="${key}"]`);
      if (input) {
        input.value = data[key] || '';
      }
    });
    this.isDirty = false;
  }

  async loadAgents() {
    const container = document.getElementById('agentsListContainer');
    
    try {
      const response = await fetch('/api/agents');
      if (response.ok) {
        const data = await response.json();
        // API returns {"agents": [...]}
        const agents = data.agents || [];
        
        if (agents.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-robot"></i>
              <p>No agents yet. Create your first agent!</p>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="agents-list">
              ${agents.map(agent => `
                <div class="agent-item" data-agent-id="${agent.name || agent.id}">
                  <h4>${agent.name || 'Unnamed Agent'}</h4>
                  <p>${agent.description || 'No description'}</p>
                  <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn-cancel" onclick="window.settingsModal.editAgent('${agent.name || agent.id}')">Edit</button>
                    <button class="btn-cancel" onclick="window.settingsModal.deleteAgent('${agent.name || agent.id}')">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load agents</p>
        </div>
      `;
    }
  }

  embedAgentsSection() {
    const agentsSection = document.getElementById('agentsSection');
    const container = this.modal.querySelector('[data-tab-content="agents"]');
    
    if (!agentsSection || !container) {
      console.warn('Agents section or container not found');
      return;
    }
    
    // If already embedded, don't do anything
    if (this.agentsEmbedded) {
      return;
    }
    
    // Move the agents section directly into the tab content (no wrapper)
    container.innerHTML = '';
    container.appendChild(agentsSection);
    
    // Show the agents section
    agentsSection.classList.remove('is-hidden');
    agentsSection.style.display = 'block';
    
    // Call render to populate it
    if (window.agents && typeof window.agents.renderAgentsGrid === 'function') {
      window.agents.renderAgentsGrid();
      this.agentsEmbedded = true;
    } else {
      console.warn('Agents manager not available yet, retrying...');
      setTimeout(() => {
        if (!this.agentsEmbedded) {
          this.embedAgentsSection();
        }
      }, 500);
    }
  }

  async loadTags() {
    const container = document.getElementById('tagsListContainer');
    
    try {
      const response = await fetch('/api/tags');
      if (response.ok) {
        const data = await response.json();
        // API returns {"tags": [...]}
        const tags = data.tags || [];
        
        if (tags.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-tags"></i>
              <p>No tags yet. Start tagging your notes!</p>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="tags-list">
              ${tags.map(tag => `
                <div class="tag-item">
                  <strong>${tag.name || tag.label || 'Unnamed'}</strong> 
                  <span style="color: var(--text-muted);">(${tag.note_count || tag.count || 0} notes)</span>
                </div>
              `).join('')}
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load tags</p>
        </div>
      `;
    }
  }

  embedTagsSection() {
    const tagsSection = document.getElementById('tagsSection');
    const container = this.modal.querySelector('[data-tab-content="tags"]');
    
    if (!tagsSection || !container) {
      console.warn('Tags section or container not found');
      return;
    }
    
    // If already embedded, don't do anything
    if (this.tagsEmbedded) {
      return;
    }
    
    // Move the tags section directly into the tab content (no wrapper)
    container.innerHTML = '';
    container.appendChild(tagsSection);
    
    // Show the tags section
    tagsSection.classList.remove('is-hidden');
    tagsSection.style.display = 'block';
    
    // Call render to populate it
    if (window.tagsManager && typeof window.tagsManager.renderInterface === 'function') {
      window.tagsManager.renderInterface();
      this.tagsEmbedded = true;
    } else {
      console.warn('Tags manager not available yet, retrying...');
      setTimeout(() => {
        if (!this.tagsEmbedded) {
          this.embedTagsSection();
        }
      }, 500);
    }
  }

  restoreSections() {
    // Move agents section back to its original location
    const agentsSection = document.getElementById('agentsSection');
    const agentsOriginalParent = document.querySelector('#content-area');
    
    if (agentsSection && agentsOriginalParent) {
      agentsSection.classList.add('is-hidden');
      agentsSection.style.display = '';
      // Move it back to original parent if it's currently in the modal
      const agentsTabContent = this.modal?.querySelector('[data-tab-content="agents"]');
      if (agentsTabContent && agentsSection.parentElement === agentsTabContent) {
        agentsOriginalParent.appendChild(agentsSection);
      }
    }
    this.agentsEmbedded = false;

    // Move tags section back to its original location
    const tagsSection = document.getElementById('tagsSection');
    const tagsOriginalParent = document.querySelector('#content-area');
    
    if (tagsSection && tagsOriginalParent) {
      tagsSection.classList.add('is-hidden');
      tagsSection.style.display = '';
      // Move it back to original parent if it's currently in the modal
      const tagsTabContent = this.modal?.querySelector('[data-tab-content="tags"]');
      if (tagsTabContent && tagsSection.parentElement === tagsTabContent) {
        tagsOriginalParent.appendChild(tagsSection);
      }
    }
    this.tagsEmbedded = false;
  }
  
  async verifyBraveApiKey() {
    const apiKeyInput = document.getElementById('braveApiKey');
    const statusEl = document.getElementById('braveApiKeyStatus');
    const verifyBtn = document.getElementById('verifyBraveApiBtn');
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      statusEl.innerHTML = '<span style="color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> Please enter an API key first</span>';
      return;
    }
    
    // Show loading state
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    statusEl.innerHTML = '<span style="color: #6b7280;"><i class="fas fa-circle-notch fa-spin"></i> Verifying API key...</span>';
    
    try {
      // Test the Brave API with a simple query
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=test&count=1`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      });
      
      if (response.ok) {
        statusEl.innerHTML = '<span style="color: #10b981;"><i class="fas fa-check-circle"></i> API key is valid!</span>';
      } else if (response.status === 401) {
        statusEl.innerHTML = '<span style="color: #ef4444;"><i class="fas fa-times-circle"></i> Invalid API key. Please check and try again.</span>';
      } else if (response.status === 429) {
        statusEl.innerHTML = '<span style="color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> Rate limit exceeded. Try again later.</span>';
      } else {
        statusEl.innerHTML = '<span style="color: #ef4444;"><i class="fas fa-times-circle"></i> Verification failed (Status: ' + response.status + ')</span>';
      }
    } catch (error) {
      console.error('API verification error:', error);
      statusEl.innerHTML = '<span style="color: #ef4444;"><i class="fas fa-times-circle"></i> Network error. Check your connection.</span>';
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
    }
  }

  async save() {
    try {
      // Collect form data
      const formData = {};
      this.modal.querySelectorAll('[data-tab-content="user-options"] input, [data-tab-content="user-options"] select').forEach(input => {
        if (input.name) {
          formData[input.name] = input.value;
        }
      });

      const response = await fetch('/api/settings/env', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        this.isDirty = false;
        this.showNotification('Settings saved successfully!', 'success');
        return true;
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Save failed:', error);
      this.showNotification('Failed to save settings', 'error');
      return false;
    }
  }

  autoSave() {
    // Debounce auto-save to avoid too many requests
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.save();
    }, 1000); // Save 1 second after last change
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `settings-notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      <span>${message}</span>
    `;
    
    // Add to header
    const header = this.modal.querySelector('.settings-modal-header');
    const existing = header.querySelector('.settings-notification');
    if (existing) {
      existing.remove();
    }
    header.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  open() {
    console.log('SettingsModal: Opening modal...');
    console.log('Modal element:', this.modal);
    console.log('Backdrop element:', this.backdrop);
    
    this.backdrop.classList.add('is-active');
    this.modal.classList.add('is-active');
    document.body.style.overflow = 'hidden';
    
    console.log('Modal classes after open:', this.modal.className);
    console.log('Backdrop classes after open:', this.backdrop.className);
    
    // Add escape key listener
    document.addEventListener('keydown', this.handleEscapeKey);
    
    // Dispatch event for integrations
    document.dispatchEvent(new CustomEvent('settingsModalOpened', { 
      detail: { tab: this.currentTab } 
    }));
    
    // Load fresh data when opening
    this.loadInitialData();
  }

  close() {
    // No need to confirm - auto-save handles it
    // Remove escape key listener
    document.removeEventListener('keydown', this.handleEscapeKey);

    // Restore sections before closing
    this.restoreSections();

    this.backdrop.classList.remove('is-active');
    this.modal.classList.remove('is-active');
    document.body.style.overflow = '';
  }

  // Agent management methods (to be connected with existing agent manager)
  editAgent(agentId) {
    console.log('Edit agent:', agentId);
    // TODO: Integrate with existing agent manager
  }

  deleteAgent(agentId) {
    if (confirm('Are you sure you want to delete this agent?')) {
      console.log('Delete agent:', agentId);
      // TODO: Integrate with existing agent manager
    }
  }
}

// Initialize and export
let settingsModalInstance = null;

export function initSettingsModal() {
  if (!settingsModalInstance) {
    settingsModalInstance = new SettingsModal();
    window.settingsModal = settingsModalInstance; // Make it globally accessible
  }
  return settingsModalInstance;
}

export function openSettingsModal() {
  if (!settingsModalInstance) {
    settingsModalInstance = initSettingsModal();
  }
  settingsModalInstance.open();
}

export default SettingsModal;
