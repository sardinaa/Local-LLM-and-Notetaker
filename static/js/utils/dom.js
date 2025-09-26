export const show = (el) => { if (el) el.classList.remove('is-hidden'); };
export const hide = (el) => { if (el) el.classList.add('is-hidden'); };
export const toggle = (el, on) => { if (!el) return; el.classList.toggle('is-hidden', on === false ? false : !on ? el.classList.contains('is-hidden') : !on); };

