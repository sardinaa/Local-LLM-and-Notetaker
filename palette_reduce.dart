import 'dart:io';
import 'dart:math';

class ColorValue {
  const ColorValue(this.r, this.g, this.b, this.a);
  final double r;
  final double g;
  final double b;
  final double a;

  double distanceTo(ColorValue other) {
    final dr = r - other.r;
    final dg = g - other.g;
    final db = b - other.b;
    final da = (a - other.a) * 255.0;
    return sqrt(dr * dr + dg * dg + db * db + da * da);
  }
}

ColorValue? parseColor(String raw) {
  var value = raw.trim().toLowerCase();
  if (value.startsWith('var(') || value.startsWith('calc(')) {
    return null;
  }
  if (value.startsWith('#')) {
    var hex = value.substring(1);
    if (hex.length == 3) {
      hex = hex.split('').map((ch) => '$ch$ch').join();
    }
    if (hex.length != 6) {
      return null;
    }
    final r = int.tryParse(hex.substring(0, 2), radix: 16);
    final g = int.tryParse(hex.substring(2, 4), radix: 16);
    final b = int.tryParse(hex.substring(4, 6), radix: 16);
    if (r == null || g == null || b == null) {
      return null;
    }
    return ColorValue(r.toDouble(), g.toDouble(), b.toDouble(), 1.0);
  }
  if (value.startsWith('rgb')) {
    final start = value.indexOf('(');
    final end = value.indexOf(')', start + 1);
    if (start == -1 || end == -1) {
      return null;
    }
    final inner = value.substring(start + 1, end);
    String colorsPart = inner;
    String? alphaPart;
    if (inner.contains('/')) {
      final parts = inner.split('/');
      if (parts.length >= 2) {
        colorsPart = parts[0].trim();
        alphaPart = parts[1].trim();
      }
    }
    final tokens = colorsPart
        .replaceAll(',', ' ')
        .split(RegExp(r'\s+'))
        .where((element) => element.isNotEmpty)
        .toList();
    if (tokens.length < 3) {
      return null;
    }
    final r = _parseColorComponent(tokens[0]);
    final g = _parseColorComponent(tokens[1]);
    final b = _parseColorComponent(tokens[2]);
    if (r == null || g == null || b == null) {
      return null;
    }
    double alpha = 1.0;
    if (alphaPart != null) {
      final parsed = _parseAlpha(alphaPart);
      if (parsed != null) {
        alpha = parsed;
      }
    } else if (tokens.length >= 4) {
      final parsed = _parseAlpha(tokens[3]);
      if (parsed != null) {
        alpha = parsed;
      }
    }
    return ColorValue(r, g, b, alpha.clamp(0.0, 1.0));
  }
  return null;
}

double? _parseColorComponent(String token) {
  final cleaned = token.trim();
  if (cleaned.isEmpty) {
    return null;
  }
  if (cleaned.endsWith('%')) {
    final value = double.tryParse(cleaned.substring(0, cleaned.length - 1));
    if (value == null) {
      return null;
    }
    return (value / 100.0) * 255.0;
  }
  final parsed = double.tryParse(cleaned);
  return parsed;
}

double? _parseAlpha(String token) {
  var cleaned = token.trim();
  if (cleaned.isEmpty) {
    return null;
  }
  if (cleaned.endsWith(')')) {
    cleaned = cleaned.substring(0, cleaned.length - 1).trim();
  }
  if (cleaned.endsWith('%')) {
    final value = double.tryParse(cleaned.substring(0, cleaned.length - 1));
    if (value == null) {
      return null;
    }
    return value / 100.0;
  }
  final parsed = double.tryParse(cleaned);
  return parsed;
}

void main() {
  const variablesPath = 'static/css/base/variables.scss';
  final variablesFile = File(variablesPath);
  if (!variablesFile.existsSync()) {
    stderr.writeln('variables.scss not found at $variablesPath');
    exit(1);
  }

  final content = variablesFile.readAsStringSync();
  final varRegex = RegExp(r'--([A-Za-z0-9\-_]+)\s*:\s*([^;]+);');
  final tokenColors = <String, ColorValue>{};
  for (final match in varRegex.allMatches(content)) {
    final name = match.group(1)!;
    final value = match.group(2)!;
    final color = parseColor(value);
    if (color != null) {
      tokenColors[name] = color;
    }
  }

  ColorValue requireColor(String value) {
    final color = parseColor(value);
    if (color == null) {
      throw FormatException('Invalid palette color: $value');
    }
    return color;
  }

  final palette = <String, ColorValue>{
    'color-white': requireColor('#ffffff'),
    'color-neutral-50': requireColor('#f8fafc'),
    'color-neutral-100': requireColor('#f1f5f9'),
    'color-neutral-200': requireColor('#e2e8f0'),
    'color-neutral-300': requireColor('#cbd5e1'),
    'color-neutral-400': requireColor('#94a3b8'),
    'color-neutral-500': requireColor('#64748b'),
    'color-neutral-700': requireColor('#334155'),
    'color-neutral-800': requireColor('#1f2937'),
    'color-neutral-900': requireColor('#111827'),
    'color-blue-700': requireColor('#1d4ed8'),
    'color-blue-600': requireColor('#2563eb'),
    'color-blue-500': requireColor('#3b82f6'),
    'color-blue-400': requireColor('#60a5fa'),
    'color-blue-200': requireColor('#bfdbfe'),
    'color-blue-100': requireColor('#dbeafe'),
    'color-blue-50': requireColor('#eff6ff'),
    'color-success-600': requireColor('#16a34a'),
    'color-success-100': requireColor('#dcfce7'),
    'color-danger-600': requireColor('#dc2626'),
    'color-danger-100': requireColor('#fee2e2'),
    'color-warning-500': requireColor('#f59e0b'),
    'color-warning-100': requireColor('#fef3c7'),
    'color-info-500': requireColor('#0ea5e9'),
    'color-info-100': requireColor('#e0f2fe'),
    'color-black-alpha-10': requireColor('rgba(17, 24, 39, 0.10)'),
    'color-black-alpha-20': requireColor('rgba(17, 24, 39, 0.20)'),
    'color-black-alpha-30': requireColor('rgba(17, 24, 39, 0.30)'),
    'color-black-alpha-45': requireColor('rgba(17, 24, 39, 0.45)'),
    'color-black-alpha-60': requireColor('rgba(17, 24, 39, 0.60)'),
    'color-white-alpha-20': requireColor('rgba(255, 255, 255, 0.20)'),
    'color-white-alpha-40': requireColor('rgba(255, 255, 255, 0.40)'),
    'color-white-alpha-60': requireColor('rgba(255, 255, 255, 0.60)'),
    'color-white-alpha-80': requireColor('rgba(255, 255, 255, 0.80)'),
    'color-white-alpha-95': requireColor('rgba(255, 255, 255, 0.95)'),
    'color-blue-alpha-05': requireColor('rgba(37, 99, 235, 0.05)'),
    'color-blue-alpha-10': requireColor('rgba(37, 99, 235, 0.10)'),
    'color-blue-alpha-20': requireColor('rgba(37, 99, 235, 0.20)'),
    'color-blue-alpha-30': requireColor('rgba(37, 99, 235, 0.30)'),
    'color-success-alpha-10': requireColor('rgba(22, 163, 74, 0.10)'),
    'color-success-alpha-20': requireColor('rgba(22, 163, 74, 0.20)'),
    'color-danger-alpha-10': requireColor('rgba(220, 38, 38, 0.10)'),
    'color-danger-alpha-20': requireColor('rgba(220, 38, 38, 0.20)'),
    'color-warning-alpha-15': requireColor('rgba(245, 158, 11, 0.15)'),
    'color-warning-alpha-30': requireColor('rgba(245, 158, 11, 0.30)'),
    'color-info-alpha-15': requireColor('rgba(14, 165, 233, 0.15)'),
  };

  final preserveTokens = <String>{
    ...palette.keys,
    'surface',
    'surface-1',
    'surface-2',
    'surface-3',
    'surface-4',
    'surface-hover',
    'surface-secondary',
    'surface-color',
    'surface-rgb',
    'text-color',
    'muted-text',
    'muted-text-strong',
    'accent-color',
    'primary-color',
    'primary-color-dark',
    'primary-hover',
    'primary-color-light',
    'primary-bg',
    'primary-rgb',
    'primary-color-rgb',
    'border-color',
    'border-light',
    'border-warning',
    'border-delimiter',
    'danger-color',
    'danger-color-dark',
    'danger-color-light',
    'success-color',
    'success-color-dark',
    'success-color-light',
    'warning-color',
    'warning-color-dark',
    'warning-color-light',
    'info-color',
    'info-color-light',
    'disabled-color',
    'shadow-1',
    'shadow-2',
    'shadow-3',
    'sidebar-bg',
    'sidebar-icon-color',
    'content-bg',
    'note-header-bg',
    'tree-item-hover',
    'vh',
    'font-family',
    'font-family-monospace',
    'radius-4',
    'radius-5',
    'radius-6',
    'radius-rounded',
    'space-2',
    'space-4',
    'space-6',
    'space-8',
    'gooey-radius',
    'text-muted',
    'background-color',
    'background-light',
    'background',
    'text-primary',
    'text-secondary',
    'text-tertiary',
    'text-warning',
    'bg-primary',
    'bg-secondary',
    'bg-tertiary',
    'bg-warning',
    'hover-bg',
    'hover-color',
    'code-bg',
    'code-text',
    'accent-warning',
    'card-bg',
    'cal-bg'
  };

  final manualOverrides = <String, String>{
    'color-3b82f6': 'color-blue-500',
    'color-2563eb': 'color-blue-600',
    'color-60a5fa': 'color-blue-400',
    'color-1d4ed8': 'color-blue-700',
    'color-1f2937': 'color-neutral-800',
    'color-111827': 'color-neutral-900',
    'color-ffffff': 'color-white',
    'color-f9fafb': 'color-neutral-50',
    'color-f8f9fa': 'color-neutral-100',
    'color-f3f4f6': 'color-neutral-100',
    'color-f5f7fa': 'color-neutral-100',
    'color-e5e7eb': 'color-neutral-200',
    'color-e2e8f0': 'color-neutral-200',
    'color-d1d5db': 'color-neutral-300',
    'color-cbd5e1': 'color-neutral-300',
    'color-94a3b8': 'color-neutral-400',
    'color-64748b': 'color-neutral-500',
    'color-334155': 'color-neutral-700',
    'color-4b5563': 'color-neutral-700',
    'color-222222': 'color-neutral-900',
    'color-2a2a2a': 'color-neutral-900',
    'color-333333': 'color-neutral-800',
    'color-444444': 'color-neutral-700',
    'color-555555': 'color-neutral-600',
    'color-666666': 'color-neutral-600',
    'color-777777': 'color-neutral-500',
    'color-888888': 'color-neutral-400',
    'color-999999': 'color-neutral-400',
    'color-a1a1a1': 'color-neutral-400',
    'color-b3d8ff': 'color-blue-100',
    'color-bfdbfe': 'color-blue-200',
    'color-90a4ae': 'color-neutral-500',
    'color-059669': 'color-success-600',
    'color-10b981': 'color-success-600',
    'color-24ac36': 'color-success-600',
    'color-27ae60': 'color-success-600',
    'color-34d399': 'color-success-100',
    'color-dcfce7': 'color-success-100',
    'color-00d4aa': 'color-success-600',
    'color-dc2626': 'color-danger-600',
    'color-e74c3c': 'color-danger-600',
    'color-f44336': 'color-danger-600',
    'color-fee2e2': 'color-danger-100',
    'color-fef2f2': 'color-danger-100',
    'color-f59e0b': 'color-warning-500',
    'color-f59e0b': 'color-warning-500',
    'color-fef3c7': 'color-warning-100',
    'color-ffc107': 'color-warning-500',
    'color-f59e0b': 'color-warning-500',
    'color-0ea5e9': 'color-info-500',
    'color-2196f3': 'color-blue-500',
    'color-007acc': 'color-blue-600',
    'color-007aff': 'color-blue-600',
    'color-007bff': 'color-blue-600',
    'color-4285f4': 'color-blue-500',
    'color-1da1f2': 'color-blue-500',
    'color-60a5fa': 'color-blue-400'
  };

  final mapping = <String, String>{};
  final skipped = <String>{};
  for (final entry in tokenColors.entries) {
    final token = entry.key;
    final color = entry.value;

    if (!token.startsWith('color-')) {
      continue;
    }
    if (preserveTokens.contains(token)) {
      continue;
    }

    if (manualOverrides.containsKey(token)) {
      mapping[token] = manualOverrides[token]!;
      continue;
    }

    var bestToken = '';
    var bestDistance = double.infinity;
    for (final paletteEntry in palette.entries) {
      final distance = color.distanceTo(paletteEntry.value);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestToken = paletteEntry.key;
      }
    }

    if (bestToken.isEmpty) {
      skipped.add(token);
      continue;
    }
    mapping[token] = bestToken;
  }

  if (skipped.isNotEmpty) {
    stderr.writeln('Skipped ${skipped.length} tokens (no mapping found)');
    for (final token in skipped.toList().take(20)) {
      stderr.writeln('  - $token');
    }
  }

  if (mapping.isEmpty) {
    stdout.writeln('No mappings required.');
    return;
  }

  final scssFiles = Directory('static')
      .listSync(recursive: true)
      .whereType<File>()
      .where((file) => file.path.endsWith('.scss'))
      .where((file) => !file.path.contains('static/css/base/variables.scss'));

  var updatedFiles = 0;
  for (final file in scssFiles) {
    var fileContent = file.readAsStringSync();
    var modified = false;
    mapping.forEach((oldToken, newToken) {
      final pattern = 'var(--$oldToken';
      if (fileContent.contains(pattern)) {
        fileContent = fileContent.replaceAll(pattern, 'var(--$newToken');
        modified = true;
      }
    });
    if (modified) {
      file.writeAsStringSync(fileContent);
      updatedFiles += 1;
    }
  }

  stdout.writeln('Updated files: $updatedFiles');
  stdout.writeln('Unique token remaps: ${mapping.length}');
}
