export async function initNotes(ctrl, task) {
  const holderId = 'taskNotesEditor';
  const container = document.getElementById(holderId);
  if (!container) return;

  try {
    if (ctrl.notesEditor && typeof ctrl.notesEditor.destroy === 'function') {
      await ctrl.notesEditor.destroy();
    }
  } catch (_) {}
  ctrl.notesEditor = null;
  container.innerHTML = '';

  try {
    if (typeof window.EditorJS !== 'undefined') {
      ctrl.notesEditor = new window.EditorJS({
        holder: holderId,
        data: task?.notes || { blocks: [] },
        tools: {
          header: window.Header ? { class: window.Header, config: { levels: [2, 3], defaultLevel: 2 } } : undefined,
          paragraph: window.Paragraph ? { class: window.Paragraph } : undefined,
          checklist: window.Checklist ? { class: window.Checklist } : undefined,
        },
        placeholder: 'Agregar notas...',
        onChange: () => ctrl.scheduleAutoSave && ctrl.scheduleAutoSave(),
      });
      await ctrl.notesEditor.isReady;
      return;
    }
  } catch (e) {
    // fall through to fallback
  }

  // Fallback: simple textarea
  const text = task?.notes?.blocks?.[0]?.data?.text || '';
  container.innerHTML = `<textarea class="fallback-textarea" placeholder="Agregar notas...">${escapeHtml(text)}</textarea>`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

