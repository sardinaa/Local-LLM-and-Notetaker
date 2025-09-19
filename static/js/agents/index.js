import { init as initManager } from './manager.js';

function bootstrap() {
  if (!window.__USE_AGENTS_MODULES__) return;
  initManager().catch((error) => console.error('[agents] initialization failed', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

export { initManager as init };
