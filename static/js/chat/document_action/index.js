import DocumentActionsManager, { init as initManager, getInstance } from './controller.js';

let initCalled = false;

export function init() {
  initCalled = true;
  return initManager();
}

export function getManager() {
  return getInstance();
}

export { DocumentActionsManager };

if (typeof window !== 'undefined') {
  window.ChatDocumentActions = window.ChatDocumentActions || {};
  window.ChatDocumentActions.init = init;
  window.ChatDocumentActions.getManager = getManager;
}
