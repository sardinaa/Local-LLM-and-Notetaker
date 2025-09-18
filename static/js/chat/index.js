// Public surface for chat modules with auto-initialization
import * as api from './api.js';
import * as state from './state.js';
import * as dom from './dom.js';
import * as render from './render.js';
import * as sources from './sources.js';
import * as events from './events.js';
import controller from './controller.js';
import * as agentsUI from './agents_ui.js';
import * as fileviewer from './fileviewer/index.js';
import * as docActions from './document_action/index.js';
import * as ui from './ui.js';

window.ChatModules = { api, state, dom, render, sources, events, controller, agentsUI, fileviewer, docActions, ui };

// Auto-initialization pattern (similar to other modules)
(function bootstrap() {
  if (!window.__USE_CHAT_MODULES__) return;
  
  // Initialize fileviewer module when DOM is ready
  function initChatModules() {
    try {
      if (fileviewer && typeof fileviewer.init === 'function') {
        const fileViewerInstance = fileviewer.init();
        console.log('[chat] FileViewer initialized successfully:', fileViewerInstance);
      }
      if (ui && typeof ui.init === 'function') {
        ui.init();
        console.log('[chat] UI initialized');
      }
      if (docActions && typeof docActions.init === 'function') {
        docActions.init().then((manager) => {
          console.log('[chat] DocumentActions initialized', manager);
        }).catch((error) => {
          console.error('[chat] Failed to initialize DocumentActions:', error);
        });
      }
    } catch (error) {
      console.error('[chat] Failed to initialize FileViewer:', error);
    }
  }
  
  // Defer to next tick to ensure DOM is ready if loaded at <head>
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatModules);
  } else {
    initChatModules();
  }
})();

export { api, state, dom, render, sources, events, controller, agentsUI, fileviewer, docActions, ui };
