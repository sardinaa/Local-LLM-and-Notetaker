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
    this.modelsInitialized = false;
    this.modelsLoading = false;
    this.modelDownloadController = null;
    this.modelDownloadReader = null;
    this.modelDownloadActive = false;
    this.activeDownloadModelName = null;
    this.modelSearchValue = '';
    this.modelFilter = '';
    this.allModels = [];
    this.remoteSearchState = { query: '', normalized: '', status: 'idle', results: [], error: null };
    this.remoteSearchTimer = null;
    this.remoteSearchController = null;
    this.knownSizeTokens = new Set(['mini', 'small', 'medium', 'large', 'base', 'nano', 'micro', 'tiny', 'xl', 'xxl', 'huge', 'giant', 'standard']);
  this.modelDetailsCache = Object.create(null);
    
    // Bind escape key handler
    this.handleEscapeKey = this.handleEscapeKey.bind(this);
    this.handleModelDownloadSubmit = this.handleModelDownloadSubmit.bind(this);
    this.cancelActiveModelDownload = this.cancelActiveModelDownload.bind(this);
    this.handleModelSearchInput = this.handleModelSearchInput.bind(this);
    this.handleRemoteDownloadClick = this.handleRemoteDownloadClick.bind(this);
    
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
        <div class="settings-modal-header">
          <h2>Settings</h2>
          <button class="close-btn" aria-label="Close settings modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="settings-content-wrapper">
          <div class="settings-tabs">
            <button class="tab-button active" data-tab="user-options">
              <i class="fas fa-cog"></i> User Options
            </button>
            <button class="tab-button" data-tab="models">
              <i class="fas fa-layer-group"></i> Models
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
            ${this.getModelsTabHTML()}
            ${this.getAgentsTabHTML()}
            ${this.getTagsTabHTML()}
          </div>
        </div>
      </div>
    `;
  }

  getUserOptionsTabHTML() {
    return `
      <div class="settings-tab-content active" data-tab-content="user-options">
        <div class="settings-tab-inner settings-tab-inner--user">

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
      </div>
    `;
  }

  getModelsTabHTML() {
    return `
      <div class="settings-tab-content" data-tab-content="models">
        <div class="settings-models-tab">
          <div class="models-card models-list-card">
            <div class="models-card-header">
              <div>
                <h3 class="section-title">Model Management</h3>
                <p class="section-description">Download new models or manage the ones already installed through Ollama.</p>
              </div>
              <div class="models-card-actions">
                <button type="button" id="settingsModelCancelDownloadBtn" class="btn-secondary models-cancel-btn" disabled>
                  <i class="fas fa-stop"></i>
                  <span>Cancel</span>
                </button>
                <button type="button" id="settingsRefreshModelsBtn" class="btn-secondary">
                  <i class="fas fa-sync-alt"></i>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <form id="settingsModelDownloadForm" class="models-download-form model-search">
              <input type="text" id="settingsModelNameInput" name="model" placeholder="Search or type model to download" aria-label="Search or type model to download" autocomplete="off" required>
              <button type="submit" class="download-btn" title="Download model">
                <i class="fas fa-download"></i>
              </button>
            </form>
            <div class="models-download-status" id="settingsModelDownloadStatus">Enter a model name to start downloading.</div>
            <div class="models-download-progress" id="settingsModelDownloadProgress">
              <div class="models-download-progress-bar" id="settingsModelDownloadProgressBar"></div>
            </div>

            <div class="models-inline-message" id="settingsModelsMessage"></div>
            <div class="models-list" id="settingsModelsLocalList">
              <div class="models-empty">Loading models...</div>
            </div>

            <div class="models-remote-section">
              <div class="models-remote-header">
                <span><i class="fas fa-cloud"></i> Remote Libraries</span>
                <span class="models-remote-hint">Pull models from Ollama or Hugging Face</span>
              </div>
              <div class="models-remote-status" id="settingsModelsRemoteStatus"></div>
              <div class="model-remote-results" id="settingsModelsRemoteResults"></div>
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
    } else if (tabName === 'models') {
      this.ensureModelsTabInitialized();
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
    const modelSelects = this.modal.querySelectorAll('.model-select');

    try {
      const response = await fetch('/api/ollama/models');
      if (!response.ok) {
        throw new Error('Failed to load models');
      }

      const payload = await response.json();
      const models = Array.isArray(payload.models) ? payload.models : [];

      modelSelects.forEach((select) => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- Select a model --</option>';

        models.forEach((model) => {
          if (!model || !model.name) {
            return;
          }
          const option = document.createElement('option');
          option.value = model.name;
          option.textContent = model.name;
          select.appendChild(option);
        });

        if (currentValue && models.some((model) => model.name === currentValue)) {
          select.value = currentValue;
        }
      });
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      modelSelects.forEach((select) => {
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

  ensureModelsTabInitialized() {
    if (this.modelsInitialized) {
      this.loadModelsList();
      return;
    }

    this.modelsListEl = this.modal.querySelector('#settingsModelsLocalList');
    this.modelsMessageEl = this.modal.querySelector('#settingsModelsMessage');
    this.modelDownloadStatusEl = this.modal.querySelector('#settingsModelDownloadStatus');
    this.modelDownloadProgressBar = this.modal.querySelector('#settingsModelDownloadProgressBar');
    this.modelDownloadProgressWrap = this.modal.querySelector('#settingsModelDownloadProgress');
    this.modelNameInput = this.modal.querySelector('#settingsModelNameInput');
    this.modelDownloadForm = this.modal.querySelector('#settingsModelDownloadForm');
    this.modelDownloadCancelBtn = this.modal.querySelector('#settingsModelCancelDownloadBtn');
    this.modelDownloadSubmitBtn = this.modal.querySelector('#settingsModelDownloadForm button[type="submit"]');
    this.refreshModelsBtn = this.modal.querySelector('#settingsRefreshModelsBtn');
    this.remoteResultsEl = this.modal.querySelector('#settingsModelsRemoteResults');
    this.remoteStatusEl = this.modal.querySelector('#settingsModelsRemoteStatus');

    if (this.modelDownloadForm) {
      this.modelDownloadForm.addEventListener('submit', this.handleModelDownloadSubmit);
    }

    if (this.modelDownloadCancelBtn) {
      this.modelDownloadCancelBtn.addEventListener('click', this.cancelActiveModelDownload);
    }

    if (this.refreshModelsBtn) {
      this.refreshModelsBtn.addEventListener('click', () => this.loadModelsList(true));
    }

    if (this.modelNameInput) {
      this.modelNameInput.addEventListener('input', this.handleModelSearchInput);
    }

    if (this.modelsListEl) {
      this.modelsListEl.addEventListener('click', (event) => {
        const refreshBtn = event.target.closest('[data-model-info-refresh]');
        if (refreshBtn) {
          event.preventDefault();
          const encodedModel = refreshBtn.dataset.modelInfoRefresh;
          if (encodedModel) {
            let modelLabel = '';
            try {
              modelLabel = decodeURIComponent(encodedModel);
            } catch (_) {
              modelLabel = encodedModel;
            }
            this.queueModelDetailsFetch(modelLabel, { force: true });
          }
          return;
        }

        const deleteBtn = event.target.closest('[data-delete-model]');
        if (!deleteBtn) {
          return;
        }
        event.preventDefault();
        const encoded = deleteBtn.dataset.deleteModel;
        if (!encoded) {
          return;
        }
        const modelName = decodeURIComponent(encoded);
        this.deleteModel(modelName);
      });
    }

    if (this.remoteResultsEl) {
      this.remoteResultsEl.addEventListener('click', this.handleRemoteDownloadClick);
    }

    this.modelsInitialized = true;
    this.updateRemoteSearchUI();
    this.loadModelsList(true);
  }

  setModelsMessage(message, type = 'info') {
    if (!this.modelsMessageEl) {
      return;
    }
    const baseClass = 'models-inline-message';
    this.modelsMessageEl.className = `${baseClass}${message ? ` ${baseClass}--${type}` : ''}`;
    this.modelsMessageEl.textContent = message || '';
  }

  async loadModelsList(showSpinner = false) {
    if (!this.modelsListEl || this.modelsLoading) {
      return;
    }

    this.modelsLoading = true;

    if (showSpinner) {
      this.modelsListEl.innerHTML = '<div class="models-empty"><i class="fas fa-circle-notch fa-spin"></i> Loading models...</div>';
    }

    try {
      const response = await fetch('/api/ollama/models');
      if (!response.ok) {
        throw new Error('Failed to load models');
      }
      const payload = await response.json();
      const models = payload.models || [];
      this.allModels = Array.isArray(models) ? models : [];
  this.pruneModelDetailsCache();
      this.renderModelsList();
      this.setModelsMessage('');
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      this.allModels = [];
      this.modelsListEl.innerHTML = '<div class="models-empty">Unable to load models. Ensure Ollama is running.</div>';
      this.setModelsMessage('Failed to load models. Check that the Ollama service is running.', 'error');
    } finally {
      this.modelsLoading = false;
    }
  }

  renderModelsList(models) {
    if (!this.modelsListEl) {
      return;
    }

    const source = Array.isArray(models) ? models : this.allModels;
    const filter = (this.modelFilter || '').trim();
    const filtered = filter
      ? source.filter((model) => (model?.name || '').toLowerCase().includes(filter))
      : source;

    if (!filtered.length) {
      if (filter) {
        this.modelsListEl.innerHTML = `<div class="models-empty">No local models match "${this.escapeHtml(filter)}".</div>`;
      } else {
        this.modelsListEl.innerHTML = '<div class="models-empty">No Ollama models installed yet.</div>';
      }
      return;
    }

    const items = filtered.map((model) => {
      const rawName = typeof model?.name === 'string' && model.name ? model.name : 'unknown';
      const displayName = this.escapeHtml(rawName);
      const encodedName = rawName !== 'unknown' ? encodeURIComponent(rawName) : '';
      const detailSection = this.composeInstalledModelDetails(rawName, model);

      const deleteButton = encodedName
        ? `<button type="button" class="remote-download-btn installed-delete-btn" data-delete-model="${encodedName}" title="Delete model">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>`
        : '';

      return `
        <div class="models-list-item" data-model-name="${displayName}">
          <div class="models-list-header">
            <div class="models-list-name">${displayName}</div>
            <div class="models-list-actions">
              ${deleteButton}
            </div>
          </div>
          ${detailSection}
        </div>
      `;
    }).join('');

    this.modelsListEl.innerHTML = items;
  }

  composeInstalledModelDetails(rawName, model) {
    const normalizedKey = this.getNormalizedModelKey(rawName);
    const baseChips = this.buildInstalledModelChips(model, null);

    if (!normalizedKey) {
      if (!baseChips.length) {
        return '';
      }
      return `<div class="models-list-body">${this.renderInstalledChips(baseChips)}</div>`;
    }

    let detailState = this.modelDetailsCache[normalizedKey];
    if (!detailState) {
      this.queueModelDetailsFetch(rawName);
      detailState = this.modelDetailsCache[normalizedKey];
    }

    if (!detailState || detailState.status === 'loading') {
      const chipsHtml = this.renderInstalledChips(baseChips);
      return `
        <div class="models-list-body">
          ${chipsHtml}
          <div class="models-list-info models-list-info--loading">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Loading model info…</span>
          </div>
        </div>
      `;
    }

    if (detailState.status === 'error') {
      const chipsHtml = this.renderInstalledChips(baseChips);
      const encoded = encodeURIComponent(rawName);
      return `
        <div class="models-list-body">
          ${chipsHtml}
          <div class="models-list-info models-list-info--error">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${this.escapeHtml(detailState.error || 'Failed to load model info.')}</span>
            <button type="button" class="remote-download-btn models-info-refresh-btn" data-model-info-refresh="${encoded}">
              <i class="fas fa-sync-alt"></i>
              <span>Retry</span>
            </button>
          </div>
        </div>
      `;
    }

    const data = detailState.data && typeof detailState.data === 'object' ? detailState.data : null;
    const chips = this.buildInstalledModelChips(model, data);
    const chipsHtml = this.renderInstalledChips(chips);
    const infoRows = this.buildInstalledModelInfoRows(data);
    const infoHtml = infoRows.length ? this.renderInstalledInfoRows(infoRows) : '';

    if (!chipsHtml && !infoHtml) {
      return '<div class="models-list-body models-list-body--empty">No additional metadata available.</div>';
    }

    return `<div class="models-list-body">${chipsHtml}${infoHtml}</div>`;
  }

  renderInstalledChips(chips) {
    if (!Array.isArray(chips) || !chips.length) {
      return '';
    }
    return `<div class="models-list-chips">${chips.join('')}</div>`;
  }

  renderInstalledInfoRows(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return '';
    }

    const content = rows.map((row) => {
      const label = this.escapeHtml(row.label || '');
      const value = this.escapeHtml(row.value || '');
      const titleAttr = row.title ? ` title="${this.escapeHtml(row.title)}"` : '';
      return `
        <div class="models-list-info-row">
          <dt>${label}</dt>
          <dd${titleAttr}>${value}</dd>
        </div>
      `;
    }).join('');

    return `<dl class="models-list-info">${content}</dl>`;
  }

  buildInstalledModelChips(model, detailData) {
    const chips = [];
    const seen = new Set();
    const addChip = (label, value) => {
      if (value === undefined || value === null) {
        return;
      }
      let text = typeof value === 'string' ? value.trim() : String(value);
      if (!text) {
        return;
      }
      if (label) {
        text = `${label}: ${text}`;
      }
      const sanitized = this.escapeHtml(text);
      if (seen.has(sanitized)) {
        return;
      }
      seen.add(sanitized);
      chips.push(`<span class="models-list-chip">${sanitized}</span>`);
    };

    const sizeLabel = this.formatModelSize(model?.size);
    if (sizeLabel && sizeLabel !== 'Unknown size') {
      addChip('Size', sizeLabel);
    }

    const modifiedLabel = this.formatModelModifiedLabel(model);
    if (modifiedLabel) {
      addChip('', modifiedLabel);
    }

    const details = detailData && typeof detailData === 'object' ? detailData : null;
    const detailObj = details && typeof details.details === 'object' ? details.details : null;
    const meta = this.collectModelMetadata(detailData);

    if (detailObj) {
      addChip('Params', detailObj.parameter_size || detailObj.parameters);
      addChip('Quant', detailObj.quantization_level || detailObj.quantization);
      addChip('Family', Array.isArray(detailObj.families) ? detailObj.families.join(', ') : detailObj.family);
      addChip('Architecture', detailObj.architecture);
      addChip('Format', detailObj.format || detailObj.model_format);
    }

    if (details) {
      addChip('Model', details.model && details.model !== model?.name ? details.model : '');
    }

    if (Array.isArray(meta.capabilitiesArray)) {
      addChip('Capabilities', meta.capabilitiesArray.join(', '));
    } else if (meta.capabilitiesText) {
      addChip('Capabilities', meta.capabilitiesText);
    }

    addChip('Context', meta.contextLength);
    addChip('Embedding', meta.embeddingLength);

    return chips;
  }

  buildInstalledModelInfoRows(detailData) {
    if (!detailData || typeof detailData !== 'object') {
      return [];
    }

    const rows = [];

    const addRow = (label, value, options = {}) => {
      if (value === undefined || value === null) {
        return;
      }
      let text = typeof value === 'string' ? value.trim() : String(value);
      if (!text) {
        return;
      }
      const original = text;
      if (options.truncate && text.length > options.truncate) {
        text = `${text.slice(0, options.truncate - 1)}…`;
      }
      const title = options.title !== undefined ? String(options.title) : original;
      rows.push({ label, value: text, title });
    };

    const meta = this.collectModelMetadata(detailData);

    if (Array.isArray(meta.capabilitiesArray) && meta.capabilitiesArray.length) {
      addRow('Capabilities', meta.capabilitiesArray.join(', '));
    } else if (meta.capabilitiesText) {
      addRow('Capabilities', meta.capabilitiesText);
    }

    return rows;
  }

  collectModelMetadata(detailData) {
    const emptyMeta = {
      contextLength: null,
      embeddingLength: null,
      capabilitiesArray: null,
      capabilitiesText: null
    };

    if (!detailData || typeof detailData !== 'object') {
      return emptyMeta;
    }

    const sources = [];
    const pushSource = (candidate) => {
      if (candidate && typeof candidate === 'object') {
        sources.push(candidate);
      }
    };

    pushSource(detailData);
    pushSource(detailData.details);

    const modelInfo = detailData.model_info;
    pushSource(modelInfo);
    if (modelInfo && typeof modelInfo === 'object') {
      pushSource(modelInfo.details);
      pushSource(modelInfo.parameters);
      pushSource(modelInfo.config);
      pushSource(modelInfo.metadata);
    }

    pushSource(detailData.config);
    pushSource(detailData.metadata);
    pushSource(detailData.parameters);
    pushSource(detailData.projector_info);
    pushSource(detailData.training);
    pushSource(detailData.extra);

    const normalizeKey = (key) => (typeof key === 'string' ? key.toLowerCase() : String(key).toLowerCase());

    const pickValue = (...keys) => {
      if (!keys.length) {
        return null;
      }

      const targets = keys.map((key) => normalizeKey(key));

      const matchesKey = (candidateKey) => {
        const normalized = normalizeKey(candidateKey);
        return targets.some((target) => normalized === target || normalized.endsWith(`.${target}`) || normalized.includes(target));
      };

      const resolveCandidate = (candidate) => {
        if (candidate === undefined || candidate === null) {
          return null;
        }
        if (typeof candidate === 'string') {
          const trimmed = candidate.trim();
          return trimmed || null;
        }
        if (typeof candidate === 'number') {
          return Number.isNaN(candidate) ? null : candidate;
        }
        if (Array.isArray(candidate)) {
          return candidate.length ? candidate : null;
        }
        if (typeof candidate === 'object') {
          if ('value' in candidate && candidate.value !== undefined) {
            return candidate.value;
          }
          if ('default' in candidate && candidate.default !== undefined) {
            return candidate.default;
          }
          if (Object.keys(candidate).length) {
            return candidate;
          }
          return null;
        }
        return candidate;
      };

      for (const source of sources) {
        if (!source || typeof source !== 'object') {
          continue;
        }

        const visited = new WeakSet();
        const stack = [{ keyPath: '', value: source }];

        while (stack.length) {
          const current = stack.pop();
          if (!current) {
            continue;
          }

          const { keyPath, value } = current;
          if (!value || typeof value !== 'object') {
            continue;
          }

          if (visited.has(value)) {
            continue;
          }
          visited.add(value);

          const entries = Array.isArray(value)
            ? value.map((item, index) => ({ key: String(index), value: item }))
            : Object.entries(value).map(([key, val]) => ({ key, value: val }));

          for (const { key, value: entryValue } of entries) {
            const combinedKey = keyPath ? `${keyPath}.${key}` : key;

            if (matchesKey(combinedKey) || matchesKey(key)) {
              const resolved = resolveCandidate(entryValue);
              if (resolved !== null && resolved !== undefined) {
                return resolved;
              }
            }

            if (entryValue && typeof entryValue === 'object') {
              stack.push({ keyPath: combinedKey, value: entryValue });
            }
          }
        }
      }

      return null;
    };

    const normalizeNumeric = (value) => {
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
        return trimmed;
      }
      return null;
    };

  const contextRaw = pickValue('context_length', 'context_window', 'ctx_len', 'max_context_length');
  const embeddingRaw = pickValue('embedding_length', 'embedding_dimensions', 'embedding_size');
  const capabilitiesRaw = pickValue('capabilities', 'features', 'abilities');

    const capabilitiesResult = (() => {
      if (Array.isArray(capabilitiesRaw)) {
        const formatted = capabilitiesRaw
          .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
          .filter((item) => !!item);
        if (formatted.length) {
          return { array: formatted, text: formatted.join(', ') };
        }
        return { array: null, text: null };
      }
      if (capabilitiesRaw && typeof capabilitiesRaw === 'object') {
        const entries = Object.entries(capabilitiesRaw)
          .filter(([, value]) => Boolean(value))
          .map(([key]) => String(key).trim())
          .filter((key) => !!key);
        if (entries.length) {
          return { array: entries, text: entries.join(', ') };
        }
        return { array: null, text: null };
      }
      if (typeof capabilitiesRaw === 'string') {
        const trimmed = capabilitiesRaw.trim();
        if (!trimmed) {
          return { array: null, text: null };
        }
        const parts = trimmed.split(/[;,/]/).map((part) => part.trim()).filter((part) => !!part);
        if (parts.length > 1) {
          return { array: parts, text: parts.join(', ') };
        }
        return { array: null, text: parts[0] || trimmed };
      }
      if (capabilitiesRaw !== undefined && capabilitiesRaw !== null) {
        const cast = String(capabilitiesRaw).trim();
        if (cast) {
          return { array: null, text: cast };
        }
      }
      return { array: null, text: null };
    })();

    return {
      contextLength: normalizeNumeric(contextRaw),
      embeddingLength: normalizeNumeric(embeddingRaw),
      capabilitiesArray: capabilitiesResult.array,
      capabilitiesText: capabilitiesResult.text
    };
  }

  formatModelModifiedLabel(model) {
    if (!model || !model.modified_at) {
      return '';
    }
    try {
      const modifiedDate = new Date(model.modified_at);
      if (Number.isNaN(modifiedDate.getTime())) {
        return '';
      }
      return `Updated ${modifiedDate.toLocaleString()}`;
    } catch (error) {
      console.warn('Failed to parse model modified date', error);
      return '';
    }
  }

  getNormalizedModelKey(modelName) {
    if (typeof modelName !== 'string') {
      return '';
    }
    return modelName.trim().toLowerCase();
  }

  pruneModelDetailsCache() {
    const validKeys = new Set();
    if (Array.isArray(this.allModels)) {
      this.allModels.forEach((model) => {
        const key = this.getNormalizedModelKey(model?.name);
        if (key) {
          validKeys.add(key);
        }
      });
    }

    Object.keys(this.modelDetailsCache).forEach((key) => {
      if (!validKeys.has(key)) {
        delete this.modelDetailsCache[key];
      }
    });
  }

  queueModelDetailsFetch(modelName, options = {}) {
    const { force = false } = options;
    const normalizedKey = this.getNormalizedModelKey(modelName);
    if (!normalizedKey) {
      return;
    }

    const existing = this.modelDetailsCache[normalizedKey];
    if (!force && existing && (existing.status === 'loading' || existing.status === 'success')) {
      return;
    }

    this.modelDetailsCache[normalizedKey] = { status: 'loading' };

    const encodedName = encodeURIComponent(modelName);
    fetch(`/api/ollama/models/${encodedName}/info`)
      .then(async (response) => {
        if (!response.ok) {
          let errorMessage = `Request failed with status ${response.status}`;
          try {
            const payload = await response.json();
            errorMessage = payload?.error || payload?.detail || errorMessage;
          } catch (_) {
            const text = await response.text();
            if (text) {
              errorMessage = text;
            }
          }
          throw new Error(errorMessage);
        }
        return response.json();
      })
      .then((payload) => {
        const detailData = payload?.data && typeof payload.data === 'object' ? payload.data : null;
        this.modelDetailsCache[normalizedKey] = { status: 'success', data: detailData };
        this.renderModelsList();
      })
      .catch((error) => {
        this.modelDetailsCache[normalizedKey] = { status: 'error', error: error?.message || 'Failed to load model info.' };
        this.renderModelsList();
      });
  }

  handleModelSearchInput(event) {
    const value = event?.target?.value ?? '';
    this.modelSearchValue = value.trim();
    this.modelFilter = this.modelSearchValue.toLowerCase();

    if (this.modelSearchValue.length >= 2) {
      this.scheduleRemoteCatalogSearch(this.modelSearchValue);
    } else {
      this.resetRemoteSearchState();
    }

    this.renderModelsList();
    this.updateRemoteSearchUI();
  }

  scheduleRemoteCatalogSearch(rawQuery) {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) {
      this.resetRemoteSearchState();
      return;
    }

    if (this.remoteSearchTimer) {
      clearTimeout(this.remoteSearchTimer);
      this.remoteSearchTimer = null;
    }

    if (this.remoteSearchController) {
      try {
        this.remoteSearchController.abort();
      } catch (_) {
        /* ignore */
      }
      this.remoteSearchController = null;
    }

    this.remoteSearchState = {
      query: trimmed,
      normalized: trimmed.toLowerCase(),
      status: 'loading',
      results: [],
      error: null
    };

    this.updateRemoteSearchUI();

    this.remoteSearchTimer = window.setTimeout(() => {
      this.fetchRemoteCatalog(trimmed);
    }, 250);
  }

  async fetchRemoteCatalog(rawQuery) {
    const query = (rawQuery || '').trim();
    if (!query) {
      return;
    }

    const controller = new AbortController();
    this.remoteSearchController = controller;

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/ollama/catalog/search?${params.toString()}`, {
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      if (controller.signal.aborted) {
        return;
      }

      const payloadQuery = (payload?.query || query).trim();
      const normalized = payloadQuery.toLowerCase();
      if (normalized !== this.remoteSearchState.normalized) {
        return;
      }

      const results = Array.isArray(payload?.results) ? payload.results : [];
      this.remoteSearchState = {
        query: payloadQuery,
        normalized,
        status: 'success',
        results,
        error: null
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error?.name === 'AbortError') {
        return;
      }
      const normalized = query.toLowerCase();
      if (normalized !== this.remoteSearchState.normalized) {
        return;
      }
      this.remoteSearchState = {
        query,
        normalized,
        status: 'error',
        results: [],
        error: error?.message || 'Search failed'
      };
    } finally {
      if (this.remoteSearchController === controller) {
        this.remoteSearchController = null;
      }
      this.updateRemoteSearchUI();
    }
  }

  resetRemoteSearchState() {
    if (this.remoteSearchTimer) {
      clearTimeout(this.remoteSearchTimer);
      this.remoteSearchTimer = null;
    }

    if (this.remoteSearchController) {
      try {
        this.remoteSearchController.abort();
      } catch (_) {
        /* ignore */
      }
      this.remoteSearchController = null;
    }

    this.remoteSearchState = { query: '', normalized: '', status: 'idle', results: [], error: null };
  }

  updateRemoteSearchUI() {
    if (!this.remoteStatusEl || !this.remoteResultsEl) {
      return;
    }

    const baseClass = 'models-remote-status';
    const query = (this.modelSearchValue || '').trim();
    const normalized = query.toLowerCase();

    if (query.length < 2) {
      this.remoteResultsEl.innerHTML = '';
      this.remoteStatusEl.className = baseClass;
      this.remoteStatusEl.textContent = '';
      return;
    }

    if (this.remoteSearchState.normalized !== normalized) {
      this.remoteResultsEl.innerHTML = '';
      this.remoteStatusEl.className = baseClass;
      this.remoteStatusEl.textContent = 'Searching remote libraries...';
      return;
    }

    if (this.remoteSearchState.status === 'loading') {
      this.remoteResultsEl.innerHTML = '';
      this.remoteStatusEl.className = baseClass;
      this.remoteStatusEl.textContent = 'Searching remote libraries...';
      return;
    }

    if (this.remoteSearchState.status === 'error') {
      this.remoteResultsEl.innerHTML = '';
      this.remoteStatusEl.className = `${baseClass} error`;
      this.remoteStatusEl.textContent = this.remoteSearchState.error || 'Search failed.';
      return;
    }

    if (this.remoteSearchState.status === 'success') {
      if (this.remoteSearchState.results.length > 0) {
        this.remoteResultsEl.innerHTML = this.remoteSearchState.results.map((result) => this.renderRemoteResult(result)).join('');
        this.remoteStatusEl.className = baseClass;
        this.remoteStatusEl.textContent = '';
        return;
      }

      this.remoteResultsEl.innerHTML = '';
      this.remoteStatusEl.className = `${baseClass} empty`;
      this.remoteStatusEl.textContent = 'No remote models found.';
      return;
    }

    this.remoteResultsEl.innerHTML = '';
    this.remoteStatusEl.className = baseClass;
    this.remoteStatusEl.textContent = '';
  }

  handleRemoteDownloadClick(event) {
    const anchor = event.target.closest('a');
    if (anchor) {
      return;
    }

    const button = event.target.closest('.remote-download-btn');
    if (button) {
      event.preventDefault();
      const encoded = button.dataset.remoteDownload;
      if (!encoded) {
        return;
      }
      const finalName = this.composeRemoteModelName(encoded, button.dataset.remoteSize || '');
      if (!finalName) {
        return;
      }
      this.startModelDownload(finalName);
      return;
    }

    const item = event.target.closest('.model-item.remote');
    if (!item) {
      return;
    }
    const hasSizes = item.dataset.remoteHasSizes === '1';
    if (hasSizes) {
      return;
    }
    event.preventDefault();
    const encoded = item.dataset.remoteModel;
    if (!encoded) {
      return;
    }
    const finalName = this.composeRemoteModelName(encoded, '');
    if (!finalName) {
      return;
    }
    this.startModelDownload(finalName);
  }

  renderRemoteResult(result) {
    const provider = typeof result?.provider === 'string' ? result.provider.toLowerCase() : 'ollama';
    const baseName = typeof result?.name === 'string' ? result.name.trim() : '';
    const displayNameRaw = typeof result?.display_name === 'string' ? result.display_name.trim() : '';
    const rawName = displayNameRaw || baseName;
    if (!rawName && !baseName) {
      return '';
    }

    const encodedName = encodeURIComponent(baseName || rawName);
    const displayName = this.escapeHtml(rawName || baseName);
    const description = result?.description
      ? `<div class="model-remote-description">${this.escapeHtml(result.description)}</div>`
      : '';

    const capabilityChips = Array.isArray(result?.capabilities)
      ? result.capabilities.filter(Boolean).map((cap) => `<span class="remote-meta-chip remote-capability">${this.escapeHtml(cap)}</span>`)
      : [];

    const stats = (result?.stats && typeof result.stats === 'object') ? result.stats : {};
    const statChips = [];
    const statLabelMap = {
      pulls: (value) => `${value} pulls`,
      tags: (value) => `${value} tags`,
      updated: (value) => `Updated ${value}`,
      likes: (value) => `${value} likes`,
      downloads: (value) => `${value} downloads`,
    };
    Object.entries(stats).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      const toText = statLabelMap[key];
      const rendered = toText ? toText(value) : `${key}: ${value}`;
      const trimmed = typeof rendered === 'string' ? rendered.trim() : rendered;
      if (trimmed) {
        statChips.push(`<span class="remote-meta-chip">${this.escapeHtml(String(trimmed))}</span>`);
      }
    });

    const providerLabel = provider === 'huggingface' ? 'Hugging Face' : 'Ollama';
    const providerChip = `<span class="remote-meta-chip remote-provider remote-provider-${provider}">${this.escapeHtml(providerLabel)}</span>`;

    const metaHtmlParts = [providerChip, ...capabilityChips, ...statChips];
    const metaHtml = metaHtmlParts.length ? `<div class="model-remote-meta">${metaHtmlParts.join('')}</div>` : '';

    const sizeOptions = [];
    if (Array.isArray(result?.sizes)) {
      const seen = new Set();
      result.sizes.forEach((size) => {
        if (typeof size !== 'string') {
          return;
        }
        const trimmed = size.trim();
        if (!trimmed) {
          return;
        }
        const normalized = this.normalizeModelSizeSuffix(trimmed);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        sizeOptions.push({
          display: trimmed,
          dataset: encodeURIComponent(trimmed)
        });
      });
    }

    const hasSizes = sizeOptions.length > 0;

    const downloadButtons = hasSizes
      ? `<div class="remote-download-options">
            ${sizeOptions.map((option) => `
                <button class="remote-download-btn" data-remote-download="${encodedName}" data-remote-size="${option.dataset}" title="Pull ${this.escapeHtml(option.display)} model">
                  <i class="fas fa-download"></i>
                  <span>${this.escapeHtml(option.display)}</span>
                </button>
            `).join('')}
        </div>`
      : `<div class="remote-download-options">
            <button class="remote-download-btn" data-remote-download="${encodedName}" title="Pull model">
              <i class="fas fa-download"></i>
              <span>Pull</span>
            </button>
        </div>`;

    const url = result?.url ? this.escapeHtml(result.url) : '';
    const actionsHtml = url
      ? `<div class="remote-item-actions"><a class="remote-view-link" href="${url}" target="_blank" rel="noopener noreferrer" title="View on ${this.escapeHtml(providerLabel)}"><i class="fas fa-external-link-alt"></i></a></div>`
      : '<div class="remote-item-actions"></div>';

    return `
      <div class="model-item remote" data-remote-model="${encodedName}"${hasSizes ? ' data-remote-has-sizes="1"' : ''}>
        <div class="remote-item-header">
          <div class="model-name">${displayName}</div>
          ${actionsHtml}
        </div>
        ${description}
        ${metaHtml}
        ${downloadButtons}
      </div>
    `;
  }

  formatModelSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) {
      return 'Unknown size';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const precision = unitIndex === 0 ? 0 : value >= 100 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
  }

  escapeHtml(value) {
    const str = String(value ?? '');
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (match) => map[match]);
  }

  normalizeModelSizeSuffix(size) {
    if (size === undefined || size === null) {
      return '';
    }
    return String(size)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  isLikelySizeToken(token) {
    if (!token) {
      return false;
    }
    if (/\d/.test(token)) {
      return true;
    }
    return this.knownSizeTokens.has(token);
  }

  composeRemoteModelName(encodedName, encodedSize) {
    let base;
    try {
      base = decodeURIComponent(encodedName || '');
    } catch (_) {
      base = encodedName || '';
    }
    base = base.trim();
    if (!base) {
      return '';
    }

    let sizeValue = '';
    if (encodedSize) {
      try {
        sizeValue = decodeURIComponent(encodedSize);
      } catch (_) {
        sizeValue = encodedSize;
      }
    }

    const normalizedSize = this.normalizeModelSizeSuffix(sizeValue);
    if (!normalizedSize) {
      return base;
    }

    const finalSizeValue = sizeValue || normalizedSize;

    const lowerBase = base.toLowerCase();
    if (lowerBase.endsWith(`:${normalizedSize}`)) {
      return base;
    }

    const lastColon = base.lastIndexOf(':');
    if (lastColon !== -1) {
      const suffix = base.slice(lastColon + 1);
      const normalizedSuffix = this.normalizeModelSizeSuffix(suffix);
      if (this.isLikelySizeToken(normalizedSuffix)) {
        return `${base.slice(0, lastColon)}:${finalSizeValue}`;
      }
    }

    return `${base}:${finalSizeValue}`;
  }

  async deleteModel(modelName) {
    if (!modelName) {
      return;
    }

    const confirmed = window.confirm(`Delete model "${modelName}"?`);
    if (!confirmed) {
      return;
    }

    this.setModelsMessage(`Deleting ${modelName}...`, 'info');

    try {
      const response = await fetch(`/api/ollama/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete model.';
        try {
          const payload = await response.json();
          errorMessage = payload.error || payload.detail || errorMessage;
        } catch (err) {
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      this.setModelsMessage(`Deleted ${modelName}.`, 'success');
      if (modelName) {
        const key = modelName.toLowerCase();
        if (key && Object.prototype.hasOwnProperty.call(this.modelDetailsCache, key)) {
          delete this.modelDetailsCache[key];
        }
      }
      await this.loadModelsList(true);
      await this.loadAvailableModels();
    } catch (error) {
      console.error('Failed to delete model:', error);
      this.setModelsMessage(error.message || 'Failed to delete model.', 'error');
    }
  }

  async handleModelDownloadSubmit(event) {
    event.preventDefault();

    if (!this.modelNameInput) {
      return;
    }

    const modelName = this.modelNameInput.value.trim();
    if (!modelName) {
      this.updateModelDownloadStatus('Please enter a model name.', 'error');
      return;
    }

    await this.startModelDownload(modelName);
  }

  async startModelDownload(modelName) {
    const trimmedName = (modelName || '').trim();
    if (!trimmedName) {
      this.updateModelDownloadStatus('Please enter a model name.', 'error');
      return;
    }

    if (this.modelDownloadActive) {
      this.updateModelDownloadStatus('Another download is already running. Cancel it before starting a new one.', 'warn');
      return;
    }

    this.activeDownloadModelName = trimmedName;
    if (this.modelNameInput) {
      this.modelNameInput.value = trimmedName;
    }
    this.setModelDownloadActive(true);
    this.resetModelDownloadProgress();
    this.updateModelDownloadStatus('Requesting download...', 'info', 0);

    try {
      const controller = new AbortController();
      this.modelDownloadController = controller;

      const response = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: trimmedName }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        let errorMessage = 'Failed to start download.';
        try {
          const payload = await response.json();
          errorMessage = payload.error || payload.detail || errorMessage;
        } catch (err) {
          try {
            const text = await response.text();
            if (text) {
              errorMessage = text;
            }
          } catch (_) {
            /* ignore */
          }
        }
        throw new Error(errorMessage);
      }

      await this.processModelDownloadStream(response);
    } catch (error) {
      if (error.name === 'AbortError') {
        this.updateModelDownloadStatus('Download cancelled.', 'warn');
      } else {
        console.error('Model download failed:', error);
        this.updateModelDownloadStatus(error.message || 'Download failed.', 'error');
      }
    } finally {
      if (this.modelDownloadReader) {
        try {
          await this.modelDownloadReader.cancel();
        } catch (_) {
          /* ignore */
        }
      }
      this.modelDownloadReader = null;
      this.modelDownloadController = null;
      this.setModelDownloadActive(false);
      this.activeDownloadModelName = null;
    }
  }

  async processModelDownloadStream(response) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    this.modelDownloadReader = reader;

    let buffer = '';
    let encounteredError = false;
    let downloadSucceeded = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) {
            continue;
          }

          const data = this.parseDownloadJsonChunk(trimmed);
          if (!data) {
            continue;
          }

          if (data.error) {
            encounteredError = true;
            this.updateModelDownloadStatus(data.error || 'Download failed.', 'error', null);
            break;
          }

          let percent = null;
          if (typeof data.completed === 'number' && typeof data.total === 'number' && data.total > 0) {
            percent = Math.max(0, Math.min(100, (data.completed / data.total) * 100));
            this.updateModelDownloadStatus(data.status || 'Downloading...', 'info', percent);
          } else if (data.status) {
            this.updateModelDownloadStatus(data.status, 'info');
          }

          if (data.status && typeof data.status === 'string' && data.status.toLowerCase() === 'success') {
            downloadSucceeded = true;
            this.updateModelDownloadStatus('Download complete.', 'success', 100);
            if (data.digest) {
              this.setModelsMessage(`Downloaded ${this.activeDownloadModelName || 'model'} (${data.digest.slice(0, 12)}…)`, 'success');
            } else {
              this.setModelsMessage('Model downloaded successfully.', 'success');
            }
            break;
          }
        }

        if (encounteredError || downloadSucceeded) {
          break;
        }
      }

      if (!encounteredError && !downloadSucceeded && buffer.trim()) {
        const trailing = this.parseDownloadJsonChunk(buffer.trim());
        if (trailing) {
          if (trailing.error) {
            encounteredError = true;
            this.updateModelDownloadStatus(trailing.error || 'Download failed.', 'error', null);
          } else if (trailing.status && typeof trailing.status === 'string' && trailing.status.toLowerCase() === 'success') {
            downloadSucceeded = true;
            this.updateModelDownloadStatus('Download complete.', 'success', 100);
            this.setModelsMessage('Model downloaded successfully.', 'success');
          }
        }
      }

      if (downloadSucceeded) {
        await this.loadModelsList(true);
        await this.loadAvailableModels();
      } else if (encounteredError) {
        this.setModelsMessage('Model download failed.', 'error');
        this.resetModelDownloadProgress();
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {
        /* ignore */
      }
      this.modelDownloadReader = null;
    }
  }

  updateModelDownloadStatus(message, type = 'info', progress) {
    if (typeof progress === 'number') {
      this.updateModelDownloadProgress(progress);
    } else if (progress === null) {
      this.updateModelDownloadProgress(null);
    }

    if (this.modelDownloadStatusEl) {
      const base = 'models-download-status';
      this.modelDownloadStatusEl.className = `${base} ${base}--${type}`;

      if (typeof progress === 'number') {
        const formatted = progress >= 100 || progress <= 0 ? progress.toFixed(0) : progress.toFixed(1);
        this.modelDownloadStatusEl.textContent = `${message} (${formatted}%)`;
      } else {
        this.modelDownloadStatusEl.textContent = message;
      }
    }
  }

  updateModelDownloadProgress(progress) {
    if (!this.modelDownloadProgressBar || !this.modelDownloadProgressWrap) {
      return;
    }

    if (typeof progress === 'number') {
      const bounded = Math.max(0, Math.min(100, progress));
      this.modelDownloadProgressWrap.classList.add('is-active');
      this.modelDownloadProgressBar.style.width = `${bounded}%`;
    } else {
      this.modelDownloadProgressWrap.classList.remove('is-active');
      this.modelDownloadProgressBar.style.width = '0%';
    }
  }

  resetModelDownloadProgress() {
    this.updateModelDownloadProgress(null);
  }

  setModelDownloadActive(active) {
    this.modelDownloadActive = active;
    if (this.modelDownloadSubmitBtn) {
      this.modelDownloadSubmitBtn.disabled = active;
    }
    if (this.modelNameInput) {
      this.modelNameInput.disabled = active;
    }
    if (this.modelDownloadCancelBtn) {
      this.modelDownloadCancelBtn.disabled = !active;
      this.modelDownloadCancelBtn.classList.toggle('is-visible', active);
    }
  }

  cancelActiveModelDownload(event, options = {}) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const { silent = false, skipDelete = false } = options;
    const modelName = this.activeDownloadModelName;

    if (this.modelDownloadController) {
      try {
        this.modelDownloadController.abort();
      } catch (_) {
        /* ignore */
      }
    }

    if (this.modelDownloadReader) {
      try {
        this.modelDownloadReader.cancel();
      } catch (_) {
        /* ignore */
      }
    }

    this.modelDownloadController = null;
    this.modelDownloadReader = null;
    this.setModelDownloadActive(false);
    this.resetModelDownloadProgress();

    if (!silent) {
      this.updateModelDownloadStatus('Download cancelled.', 'warn');
    }

    if (!skipDelete && modelName) {
      fetch(`/api/ollama/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }

    this.activeDownloadModelName = null;
  }

  normalizeNdjsonLine(rawLine) {
    if (!rawLine) {
      return '';
    }

    let trimmed = typeof rawLine === 'string' ? rawLine.trim() : String(rawLine).trim();
    if (!trimmed) {
      return '';
    }

    const binaryMatch = trimmed.match(/^b(['"])([\s\S]*)\1$/);
    if (binaryMatch) {
      trimmed = binaryMatch[2];
    }

    let didStrip = true;
    while (didStrip && trimmed.length > 1) {
      didStrip = false;

      if (trimmed.startsWith("b'") || trimmed.startsWith('b"')) {
        trimmed = trimmed.slice(2);
        didStrip = true;
        continue;
      }

      if (trimmed.startsWith('b{') || trimmed.startsWith('b[')) {
        trimmed = trimmed.slice(1);
        didStrip = true;
      }

      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        trimmed = trimmed.slice(1, -1);
        didStrip = true;
      }
    }

    trimmed = trimmed
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\u0000/g, '')
      .trim();

    const braceStart = trimmed.indexOf('{');
    const braceEnd = trimmed.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      trimmed = trimmed.slice(braceStart, braceEnd + 1).trim();
    }

    return trimmed;
  }

  parseDownloadJsonChunk(rawLine) {
    if (!rawLine) {
      return null;
    }

    const normalized = this.normalizeNdjsonLine(rawLine);
    if (!normalized) {
      return null;
    }

    const attempts = [normalized];
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = normalized.slice(firstBrace, lastBrace + 1).trim();
      if (slice && slice !== normalized) {
        attempts.push(slice);
      }
    }

    for (const candidate of attempts) {
      try {
        return JSON.parse(candidate);
      } catch (_) {
        /* ignore */
      }
    }

    return null;
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
        if (window.showSuccess) {
          window.showSuccess('Settings saved successfully!');
        }
        return true;
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Save failed:', error);
      if (window.showError) {
        window.showError('Failed to save settings');
      }
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
