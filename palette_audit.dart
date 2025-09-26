import 'dart:io';

class UsageInfo {
  UsageInfo(this.count, this.samplePath);
  int count;
  String samplePath;
}

void main() {
  final usage = <String, UsageInfo>{};
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
  final regex = RegExp(r"var\(--([a-zA-Z0-9\-_]+)");
  for (final file in files) {
    final content = file.readAsStringSync();
    for (final match in regex.allMatches(content)) {
      final name = match.group(1)!;
      usage.update(
        name,
        (info) => UsageInfo(info.count + 1, info.samplePath),
        ifAbsent: () => UsageInfo(1, file.path),
      );
    }
  }
  final entries = usage.entries.toList()
    ..sort((a, b) => a.key.compareTo(b.key));
  for (final entry in entries) {
    print('${entry.key}: ${entry.value.count} -> ${entry.value.samplePath}');
  }
}
