/**
 * LangGraph Toggle Manager
 * Allows switching between traditional 3-stage RAG and LangGraph adaptive RAG
 */
export default class LangGraphToggle {
    constructor() {
        this.useLangGraph = false;
        this._initialized = false;
    }

    addToggle() {
        const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
        const leftButtonsContainer = plusMenuContent || document.querySelector('.input-buttons-left');
        
        if (!leftButtonsContainer || document.getElementById('langGraphToggleContainer')) {
            return;
        }

        // Create container for toggle switch
        const container = document.createElement('div');
        container.id = 'langGraphToggleContainer';
        container.className = 'langgraph-toggle-container chat-plus-menu-btn';
        container.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; user-select: none;';
        
        // Create label
        const label = document.createElement('span');
        label.textContent = 'Adaptive RAG';
        label.style.cssText = 'font-size: 13px; color: var(--text-color, #333);';
        
        // Create toggle switch
        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'langgraph-switch';
        toggleSwitch.style.cssText = 'position: relative; display: inline-block; width: 44px; height: 24px; margin: 0;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'langGraphCheckbox';
        checkbox.style.cssText = 'opacity: 0; width: 0; height: 0;';
        checkbox.onchange = () => this.toggle();
        
        const slider = document.createElement('span');
        slider.className = 'langgraph-slider';
        slider.style.cssText = `
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: 0.3s;
            border-radius: 24px;
        `;
        
        // Create slider knob
        const knob = document.createElement('span');
        knob.style.cssText = `
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        `;
        slider.appendChild(knob);
        
        toggleSwitch.appendChild(checkbox);
        toggleSwitch.appendChild(slider);
        
        container.appendChild(label);
        container.appendChild(toggleSwitch);
        container.title = 'Toggle LangGraph adaptive RAG (experimental)';
        container.onclick = (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                // Don't manually call onchange - it will fire automatically
            }
        };
        
        leftButtonsContainer.appendChild(container);
    }

    toggle() {
        this.useLangGraph = !this.useLangGraph;
        const checkbox = document.getElementById('langGraphCheckbox');
        const slider = document.querySelector('.langgraph-slider');
        const knob = slider ? slider.querySelector('span') : null;
        const container = document.getElementById('langGraphToggleContainer');
        
        if (this.useLangGraph) {
            if (slider) {
                slider.style.backgroundColor = 'var(--success-color, #28a745)';
            }
            if (knob) {
                knob.style.transform = 'translateX(20px)';
            }
            if (container) {
                container.title = 'Adaptive RAG ENABLED (experimental)';
            }
            console.log('🔀 LangGraph Adaptive RAG: ENABLED');
        } else {
            if (slider) {
                slider.style.backgroundColor = '#ccc';
            }
            if (knob) {
                knob.style.transform = 'translateX(0)';
            }
            if (container) {
                container.title = 'Toggle LangGraph adaptive RAG (experimental)';
            }
            console.log('🔀 LangGraph Adaptive RAG: DISABLED');
        }
        
        const chatPlusMenu = document.getElementById('chatPlusMenu');
        if (chatPlusMenu) {
            chatPlusMenu.classList.remove('open');
        }
    }

    isEnabled() {
        return this.useLangGraph;
    }

    async init() {
        if (this._initialized) return this;
        
        const start = () => {
            this.addToggle();
            this._initialized = true;
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
        
        return this;
    }
}

let instance = null;

export async function initLangGraphToggle() {
    if (!instance) {
        instance = new LangGraphToggle();
        await instance.init();
    }
    return instance;
}

export function getToggle() {
    return instance;
}

export function isLangGraphEnabled() {
    return instance ? instance.isEnabled() : false;
}

try {
    window.isLangGraphEnabled = () => isLangGraphEnabled();
} catch {}
