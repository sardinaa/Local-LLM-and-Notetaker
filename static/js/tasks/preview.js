import { parseTaskDate } from './dates.js';

export function formatPreviewText(preview) {
  let html = `<strong>Título:</strong> ${preview.title || 'Sin título'}<br>`;

  if (preview.description) {
    html += `<strong>Descripción:</strong> ${preview.description}<br>`;
  }

  if (preview.due_date) {
    const d = parseTaskDate(preview.due_date);
    html += `<strong>Fecha:</strong> ${d ? d.toLocaleString('es-ES') : preview.due_date}<br>`;
  }

  if (preview.priority) {
    const priorityEmoji = {
      urgente: '🔥',
      alta: '🔴',
      media: '🟡',
      baja: '🟢',
    };
    html += `<strong>Prioridad:</strong> ${priorityEmoji[preview.priority] || ''} ${preview.priority}<br>`;
  }

  if (preview.tags && preview.tags.length > 0) {
    html += `<strong>Etiquetas:</strong> ${preview.tags.map((tag) => `#${tag}`).join(', ')}<br>`;
  }

  if (preview.repeat_pattern) {
    html += `<strong>Repetición:</strong> ${preview.repeat_pattern}<br>`;
  }

  return html;
}

