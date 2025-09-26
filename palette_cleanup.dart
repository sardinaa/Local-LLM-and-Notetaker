import 'dart:io';

void main() {
  final replacements = <String, String>{
    'color-black-alpha-100': 'color-black-alpha-10',
    'color-black-alpha-102': 'color-black-alpha-10',
    'color-black-alpha-105': 'color-black-alpha-10',
    'color-black-alpha-205': 'color-black-alpha-20',
    'color-blue-500-5': 'color-blue-alpha-05',
    'color-blue-500-10': 'color-blue-alpha-10',
    'color-blue-500-15': 'color-blue-alpha-10',
    'color-blue-500-20': 'color-blue-alpha-20',
    'color-blue-500-30': 'color-blue-alpha-30',
    'color-blue-500-40': 'color-blue-alpha-30',
    'color-blue-500-50': 'color-blue-alpha-30',
    'color-blue-alpha-050': 'color-blue-alpha-05',
    'color-blue-alpha-105': 'color-blue-alpha-10',
    'color-success-alpha-205': 'color-success-alpha-20',
    'color-success-alpha-208': 'color-success-alpha-20',
    'color-info-alpha-152': 'color-info-alpha-15',
    'color-info-alpha-155': 'color-info-alpha-15',
    'color-white-alpha-200': 'color-white-alpha-20',
    'color-white-alpha-205': 'color-white-alpha-20',
    'color-white-alpha-805': 'color-white-alpha-80',
    'color-white-alpha-955': 'color-white-alpha-95',
    'color-white-alpha-957': 'color-white-alpha-95',
  };

  final dir = Directory('static');
  if (!dir.existsSync()) {
    stderr.writeln('static directory not found');
    exit(1);
  }

  final files = dir
      .listSync(recursive: true)
      .whereType<File>()
      .where((file) => file.path.endsWith('.scss'))
      .where((file) => !file.path.contains('static/css/base/variables.scss'));

  var updatedFiles = 0;
  for (final file in files) {
    var content = file.readAsStringSync();
    var modified = false;
    replacements.forEach((oldToken, newToken) {
      final pattern = 'var(--$oldToken';
      if (content.contains(pattern)) {
        content = content.replaceAll(pattern, 'var(--$newToken');
        modified = true;
      }
    });
    if (modified) {
      file.writeAsStringSync(content);
      updatedFiles += 1;
    }
  }

  stdout.writeln('Palette cleanup updated files: $updatedFiles');
}
