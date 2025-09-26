import * as Utils from './utils.js';
import { CalendarStore } from './store.js';
import { CalendarApp } from './app.js';

// Expose for legacy consumers
window.CalendarUtils = window.CalendarUtils || Utils;
window.CalendarStoreModule = window.CalendarStoreModule || { CalendarStore };
window.CalendarApp = window.CalendarApp || CalendarApp;

// Auto-init when present
document.addEventListener('DOMContentLoaded', ()=>{
  const root = document.getElementById('calendarRoot');
  if (root) {
    window.calendarApp = new CalendarApp('calendarRoot');
  }
});
