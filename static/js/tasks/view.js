import { parseTaskDate } from './dates.js';

export function updateCountsUI(tasks, els) {
  const counts = { today: 0, tomorrow: 0, next7days: 0, completed: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const next7days = new Date(today);
  next7days.setDate(today.getDate() + 7);

  (tasks || []).forEach((task) => {
    if (task.status === 'completed') {
      counts.completed++;
      return;
    }

    if (task.due_date) {
      const dueDate = parseTaskDate(task.due_date);
      if (dueDate && !isNaN(dueDate)) {
        const d = new Date(dueDate);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) counts.today++;
        else if (d.getTime() === tomorrow.getTime()) counts.tomorrow++;
        else if (d <= next7days) counts.next7days++;
        else counts.next7days++;
      } else {
        counts.today++;
      }
    } else {
      counts.today++;
    }
  });

  if (els?.today) els.today.textContent = counts.today;
  if (els?.tomorrow) els.tomorrow.textContent = counts.tomorrow;
  if (els?.next7days) els.next7days.textContent = counts.next7days;
  if (els?.completed) els.completed.textContent = counts.completed;
}

export function setDateTimeDisplay(task, container) {
  if (!container) return;
  const dateSpan = container.querySelector('.task-date');
  const timeSpan = container.querySelector('.task-time');
  if (!dateSpan || !timeSpan) return;

  if (task?.due_date) {
    const dueDate = new Date(task.due_date);
    dateSpan.textContent = dueDate.toLocaleDateString('es-ES');
    timeSpan.textContent = dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } else {
    dateSpan.textContent = 'Sin fecha';
    timeSpan.textContent = '';
  }
}

