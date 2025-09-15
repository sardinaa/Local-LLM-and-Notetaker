// DOM helpers specific to Jobs feature
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function on(el, evt, handler) {
  if (!el) return;
  el.addEventListener(evt, handler);
}

