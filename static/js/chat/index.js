// Public surface for chat modules (no auto-init yet)
import * as api from './api.js';
import * as state from './state.js';
import * as dom from './dom.js';
import * as render from './render.js';
import * as sources from './sources.js';
import * as events from './events.js';
import controller from './controller.js';
import * as agentsUI from './agents_ui.js';

window.ChatModules = { api, state, dom, render, sources, events, controller, agentsUI };

export { api, state, dom, render, sources, events, controller, agentsUI };
