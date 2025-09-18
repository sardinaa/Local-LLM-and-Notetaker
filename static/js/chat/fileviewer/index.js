// Entry point for chat file viewer modules
import FileViewerRedesigned from './controller.js';

const GLOBAL_INSTANCE_KEY = '__chatFileViewerInstance';
const GLOBAL_STYLE_FLAG = '__chatFileViewerAnimationsInjected';

let instance = null;
let styleInjected = false;

function readInstance() {
  if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, GLOBAL_INSTANCE_KEY)) {
    instance = window[GLOBAL_INSTANCE_KEY];
  }
  return instance;
}

function writeInstance(value) {
  instance = value;
  if (typeof window !== 'undefined') {
    window[GLOBAL_INSTANCE_KEY] = value;
  }
}

function ensureNamespace() {
  if (typeof window === 'undefined') return null;
  window.FileViewerRedesigned = window.FileViewerRedesigned || {};
  return window.FileViewerRedesigned;
}

function exposeGlobals() {
  const ns = ensureNamespace();
  if (!ns) return;

  const descriptor = Object.getOwnPropertyDescriptor(ns, 'instance');
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(ns, 'instance', {
      configurable: true,
      get: () => readInstance(),
      set: (value) => writeInstance(value),
    });
  }

  ns.init = init;
  ns.getInstance = getInstance;
}

function injectAnimations() {
  if (styleInjected) return;
  if (typeof window !== 'undefined' && window[GLOBAL_STYLE_FLAG]) {
    styleInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
  if (typeof window !== 'undefined') {
    window[GLOBAL_STYLE_FLAG] = true;
  }
}

export function init() {
  let current = readInstance();
  if (!current) {
    current = new FileViewerRedesigned();
    writeInstance(current);
  } else {
    writeInstance(current);
  }
  injectAnimations();
  return current;
}

export function getInstance() {
  return readInstance();
}

exposeGlobals();

export { FileViewerRedesigned };
