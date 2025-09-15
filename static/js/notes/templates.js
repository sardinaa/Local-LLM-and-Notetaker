// Templates module for Notes
import { NotesAPI } from './api.js';

export async function listTemplates() {
  return NotesAPI.listTemplates();
}

export function bindTemplateInsert(btn, getEditorValue, setEditorValue) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const templates = await listTemplates();
    // Simple example: append first template's content if available
    const first = templates?.[0];
    if (!first) return;
    const current = getEditorValue();
    setEditorValue(`${current}\n\n${first.content || ''}`);
  });
}
