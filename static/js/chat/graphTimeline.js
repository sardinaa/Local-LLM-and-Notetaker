/**
 * LangGraph Timeline - Visual progress indicator for node-by-node execution
 */

const NODE_LABELS = {
  classify: 'Intent Classification',
  plan: 'Retrieval Planning',
  retrieve: 'Document Retrieval',
  reflect: 'Quality Reflection',
  web_search: 'Web Search',
  quality_check: 'Quality Check',
  refine: 'Refinement',
  answer: 'Answer Generation',
  answer_direct: 'Direct Answer'
};

export class GraphTimeline {
  constructor(container) {
    this.container = container;
    this.nodes = [];
    this.element = null;
    this.stepsList = null;
    this.bodyEl = null;
    this.toggleTextEl = null;
    this.toggleIconEl = null;
    this.isCollapsed = true;
    this.idSuffix = Math.random().toString(36).slice(2, 9);
    this.render();
  }
  
  render() {
    this.element = document.createElement('div');
    this.element.className = 'graph-timeline';
    const bodyId = `graph-timeline-body-${this.idSuffix}`;
    this.element.innerHTML = `
      <div class="graph-timeline__header" role="button" tabindex="0" aria-expanded="true" aria-controls="${bodyId}">
        <div class="graph-timeline__heading">
          <span class="graph-timeline__indicator"></span>
          <span class="graph-timeline__title">Processing steps</span>
        </div>
        <div class="graph-timeline__toggle" aria-hidden="true">
          <span class="graph-timeline__toggle-text">Hide</span>
          <svg class="graph-timeline__toggle-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M2 5l4 4 4-4" />
          </svg>
        </div>
      </div>
      <div class="graph-timeline__body" id="${bodyId}">
        <ol class="graph-timeline__steps"></ol>
      </div>
    `;
    
    this.stepsList = this.element.querySelector('.graph-timeline__steps');
    this.bodyEl = this.element.querySelector('.graph-timeline__body');
    this.toggleTextEl = this.element.querySelector('.graph-timeline__toggle-text');
    this.toggleIconEl = this.element.querySelector('.graph-timeline__toggle-icon');
  this.container.appendChild(this.element);
  this.container.classList.add('graph-timeline-host');
    
    const header = this.element.querySelector('.graph-timeline__header');
    const toggle = () => this.toggleCollapsed();
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        toggle();
      }
    });
    
    this.applyCollapsedState();
  }
  
  applyCollapsedState() {
    const collapsed = this.isCollapsed;
    if (this.bodyEl) {
      if (collapsed) {
        this.bodyEl.hidden = true;
        this.bodyEl.setAttribute('aria-hidden', 'true');
        this.bodyEl.style.display = '';
        if (this.container) {
          this.container.classList.remove('graph-timeline--expanded');
        }
      } else {
        this.bodyEl.hidden = false;
        this.bodyEl.removeAttribute('aria-hidden');
        this.bodyEl.style.display = '';
        // Trigger reflow so parent bubble recalculates height
        void this.bodyEl.offsetHeight;
        if (this.container) {
          this.container.classList.add('graph-timeline--expanded');
        }
      }
    }
    this.element.classList.toggle('graph-timeline--collapsed', collapsed);
    const header = this.element.querySelector('.graph-timeline__header');
    if (header) {
      header.setAttribute('aria-expanded', String(!collapsed));
    }
    if (this.toggleTextEl) {
      this.toggleTextEl.textContent = collapsed ? 'Show' : 'Hide';
    }
    if (!collapsed) {
      this.element.classList.remove('graph-timeline--has-updates');
    }
  }
  
  toggleCollapsed() {
    this.isCollapsed = !this.isCollapsed;
    this.applyCollapsedState();
  }
  
  addNode(nodeName, state = 'active') {
    const node = {
      name: nodeName,
      label: NODE_LABELS[nodeName] || nodeName,
      state: state,
      data: null,
      element: null
    };
    
    this.nodes.push(node);
    this.renderNode(node);
    return node;
  }
  
  updateNode(nodeName, data, state = 'completed') {
    const node = this.nodes.find(n => n.name === nodeName);
    if (node) {
      node.data = data;
      node.state = state;
      this.updateNodeElement(node);
    }
  }
  
  renderNode(node) {
    const nodeEl = document.createElement('li');
    nodeEl.className = 'timeline-step';
    nodeEl.dataset.state = node.state;
    nodeEl.innerHTML = `
      <span class="timeline-step__marker"></span>
      <div class="timeline-step__body">
        <div class="timeline-step__label">${node.label}</div>
        <div class="timeline-step__meta"></div>
      </div>
    `;
    
    node.element = nodeEl;
    this.stepsList.appendChild(nodeEl);
    const metaEl = node.element.querySelector('.timeline-step__meta');
    metaEl.style.display = 'none';
    
    if (this.isCollapsed) {
      this.element.classList.add('graph-timeline--has-updates');
    } else {
      nodeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  updateNodeElement(node) {
    if (!node.element) return;
    node.element.dataset.state = node.state;
    const metaEl = node.element.querySelector('.timeline-step__meta');
    const infoText = node.data ? this.formatNodeInfo(node.name, node.data) : '';
    if (infoText) {
      metaEl.textContent = infoText;
      metaEl.style.display = '';
    } else {
      metaEl.textContent = '';
      metaEl.style.display = 'none';
    }
    if (this.isCollapsed) {
      this.element.classList.add('graph-timeline--has-updates');
    }
  }
  
  formatNodeInfo(nodeName, data) {
    const info = [];
    
    switch (nodeName) {
      case 'classify':
        if (data.intent) info.push(`Intent: ${data.intent}`);
        if (data.confidence) info.push(`Confidence: ${(data.confidence * 100).toFixed(0)}%`);
        if (data.requires_multihop) info.push('Multi-hop required');
        break;
      
      case 'plan':
        if (data.scope) info.push(`Scope: ${data.scope}`);
        if (data.planned_chunks) info.push(`Planned chunks: ${data.planned_chunks}`);
        break;
      
      case 'retrieve':
        if (data.num_docs !== undefined) info.push(`Docs found: ${data.num_docs}`);
        if (data.iteration !== undefined) info.push(`Iteration: ${data.iteration + 1}`);
        break;
      
      case 'reflect':
        if (data.sufficient !== undefined) info.push(data.sufficient ? 'Context sufficient' : 'Needs more context');
        if (data.reasoning) info.push(data.reasoning);
        break;
      
      case 'web_search':
        if (data.num_results !== undefined) info.push(`Results: ${data.num_results}`);
        break;
      
      case 'quality_check':
        if (data.quality_score !== undefined) info.push(`Quality: ${(data.quality_score * 100).toFixed(0)}%`);
        if (data.strategy) info.push(`Strategy: ${data.strategy}`);
        break;
      
      case 'refine':
        if (data.refinement_count !== undefined) info.push(`Attempt #${data.refinement_count + 1}`);
        if (data.reasoning) info.push(data.reasoning);
        break;
      
      case 'answer':
      case 'answer_direct':
        if (data.answer_preview) info.push(`Preview: ${data.answer_preview}`);
        if (data.used_rag !== undefined) info.push(`RAG: ${data.used_rag ? 'yes' : 'no'}`);
        if (data.used_web_search !== undefined) info.push(`Web: ${data.used_web_search ? 'yes' : 'no'}`);
        break;
    }
    
    return info.join(' • ');
  }
  
  clear() {
    if (this.stepsList) {
      this.stepsList.innerHTML = '';
    }
    this.nodes = [];
    this.element.classList.remove('graph-timeline--has-updates');
  }
  
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.nodes = [];
    this.element = null;
    if (this.container) {
      this.container.classList.remove('graph-timeline-host', 'graph-timeline--expanded');
    }
  }
}

export function createTimeline(container) {
  return new GraphTimeline(container);
}
