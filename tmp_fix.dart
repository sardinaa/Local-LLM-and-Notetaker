import 'dart:io';

void main() {
  final file = File('static/css/base/variables.scss');
  final content = file.readAsStringSync();
  const oldBlock = '  /* Misc surfaces */\n  --code-bg: var(--surface-3);\n  --code-text: var(--color-neutral-800);\n  --bg-primary: var(--color-blue-50);\n  --bg-secondary: var(--surface-3);\n  --bg-tertiary: var(--surface-4);\n  --bg-warning: var(--color-warning-100);\n  --content-bg: var(--surface-2);\n\n  /* Effects */';
  const newBlock = '  /* Misc surfaces */\n  --code-bg: var(--surface-3);\n  --code-text: var(--color-neutral-800);\n\n  /* Effects */';
  if (!content.contains(oldBlock)) {
    stderr.writeln('Expected block not found in variables.scss');
    exit(1);
  }
  final updated = content.replaceFirst(oldBlock, newBlock);
  file.writeAsStringSync(updated);
}
