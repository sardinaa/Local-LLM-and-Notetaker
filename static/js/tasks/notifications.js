export function notify(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `task-notification task-notification-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'task-slide-out 0.25s ease';
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

