import 'dart:io';

void main() {
  final lines = File('static/css/base/variables.scss').readAsLinesSync();
  final limit = lines.length < 200 ? lines.length : 200;
  for (var i = 0; i < limit; i++) {
    print(lines[i]);
  }
}
