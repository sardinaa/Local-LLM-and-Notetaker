import "dart:io";

class ColorInfo {
  ColorInfo(this.canonical, this.definition);
  final String canonical;
  final String definition;
}

void main(List<String> args) {
  if (args.isNotEmpty && args[0] == "--find") {
    if (args.length < 3) {
      stderr.writeln("Usage: dart color_replacer.dart --find <file> <substring>");
      exit(1);
    }
    final path = args[1];
    final needle = args[2];
    final file = File(path);
    if (!file.existsSync()) {
      stderr.writeln("File not found: $path");
      exit(1);
    }
    final lines = file.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].contains(needle)) {
        stdout.writeln("${i + 1}:${lines[i]}");
      }
    }
    return;
  }

  const varsPath = "static/css/base/variables.scss";
  final varsFile = File(varsPath);

  if (!varsFile.existsSync()) {
    stderr.writeln("variables.scss not found at $varsPath");
    exit(1);
  }

  final existingContent = varsFile.readAsStringSync();
  final valueToName = <String, String>{};
  final usedNames = <String>{};
  final varRegex = RegExp(r"--([A-Za-z0-9\-_]+)\s*:\s*([^;]+);");

  for (final match in varRegex.allMatches(existingContent)) {
    final name = match.group(1)!.trim();
    final valueRaw = match.group(2)!.trim();
    final colorInfo = parseColor(valueRaw);
    if (colorInfo == null) {
      continue;
    }
    valueToName.putIfAbsent(colorInfo.canonical, () => name);
    usedNames.add(name);
  }

  final newDefinitions = <String, String>{};

  final staticDir = Directory("static");
  if (!staticDir.existsSync()) {
    stderr.writeln("static directory not found");
    exit(1);
  }

  final scssFiles = staticDir
      .listSync(recursive: true)
      .whereType<File>()
      .where((file) => file.path.endsWith(".scss"));

  for (final file in scssFiles) {
    final relativePath = file.path.replaceAll("\\", "/");
    if (relativePath == varsPath) {
      continue;
    }
    final original = file.readAsStringSync();
    final updated = processContent(original, valueToName, usedNames, newDefinitions);
    if (updated != original) {
      file.writeAsStringSync(updated);
    }
  }

  if (newDefinitions.isNotEmpty) {
    final buffer = StringBuffer()..writeln("  /* Auto-generated color tokens */");
    final entries = newDefinitions.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    for (final entry in entries) {
      buffer.writeln("  --${entry.key}: ${entry.value};");
    }
    buffer.writeln();

    final original = varsFile.readAsStringSync();
    final insertIndex = original.lastIndexOf("}");
    if (insertIndex == -1) {
      stderr.writeln("Could not find closing brace in $varsPath");
      exit(1);
    }
    final updated = original.substring(0, insertIndex) +
        buffer.toString() +
        original.substring(insertIndex);
    varsFile.writeAsStringSync(updated);
  }

  tidyVariablesFile(varsFile);
}

String processContent(
  String content,
  Map<String, String> valueToName,
  Set<String> usedNames,
  Map<String, String> newDefinitions,
) {
  var updated = content;

  final hexRegex = RegExp(r"#[0-9A-Fa-f]{3,6}");
  updated = updated.replaceAllMapped(hexRegex, (match) {
    final token = match.group(0)!;
    final colorInfo = parseColor(token);
    if (colorInfo == null) {
      return token;
    }
    final varName = ensureVarName(
      colorInfo,
      valueToName,
      usedNames,
      newDefinitions,
    );
    return "var(--$varName)";
  });

  final rgbRegex = RegExp(r"rgba?\([^)]*\)");
  updated = updated.replaceAllMapped(rgbRegex, (match) {
    final token = match.group(0)!;
    final colorInfo = parseColor(token);
    if (colorInfo == null) {
      return token;
    }
    final varName = ensureVarName(
      colorInfo,
      valueToName,
      usedNames,
      newDefinitions,
    );
    return "var(--$varName)";
  });

  return updated;
}

String ensureVarName(
  ColorInfo info,
  Map<String, String> valueToName,
  Set<String> usedNames,
  Map<String, String> newDefinitions,
) {
  final existing = valueToName[info.canonical];
  if (existing != null) {
    return existing;
  }

  final base = generateName(info);
  var name = base;
  var counter = 2;
  while (usedNames.contains(name)) {
    name = "$base-$counter";
    counter += 1;
  }
  usedNames.add(name);
  valueToName[info.canonical] = name;
  newDefinitions.putIfAbsent(name, () => info.definition);
  return name;
}

String generateName(ColorInfo info) {
  if (info.canonical.startsWith("#")) {
    final hex = info.canonical.substring(1);
    return "color-$hex";
  }
  var sanitized =
      info.canonical.replaceAll(RegExp(r"[^a-z0-9]+"), "-").replaceAll(RegExp(r"-+"), "-");
  sanitized = sanitized.replaceAll(RegExp(r"^-+|-+$"), "");
  return sanitized.isEmpty ? "color-token" : "color-$sanitized";
}

ColorInfo? parseColor(String value) {
  final trimmed = value.trim();

  if (trimmed.startsWith("#")) {
    final match = RegExp(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$").firstMatch(trimmed);
    if (match == null) {
      return null;
    }
    var hex = match.group(1)!.toLowerCase();
    if (hex.length == 3) {
      hex = hex.split("").map((ch) => "$ch$ch").join();
    }
    return ColorInfo("#$hex", "#$hex");
  }

  var lower = trimmed.toLowerCase();
  if (lower.startsWith("rgb(") || lower.startsWith("rgba(")) {
    if (lower.contains("var(")) {
      return null;
    }
    var normalized = lower;
    normalized = normalized.replaceAll(RegExp(r"\s+"), " ");
    normalized = normalized.replaceAll(RegExp(r"\s*,\s*"), ", ");
    normalized = normalized.replaceAll(RegExp(r"\s*/\s*"), " / ");
    normalized = normalized.replaceAll("( ", "(");
    normalized = normalized.replaceAll(" )", ")");
    normalized = normalized.replaceAll(" ,", ",");
    normalized = normalized.replaceAllMapped(
      RegExp(r"(?<=[,(/ ])\.(\d)"),
      (match) => "0.${match.group(1)}",
    );
    normalized = normalized.trim();
    return ColorInfo(normalized, normalized);
  }

  return null;
}

void tidyVariablesFile(File file) {
  final content = file.readAsStringSync();
  final regex = RegExp(r"rgba?\([^;]+\)");
  final tidied = content.replaceAllMapped(regex, (match) {
    var value = match.group(0)!;
    value = value.replaceAll(RegExp(r"\s+"), " ");
    value = value.replaceAll(RegExp(r"\s*,\s*"), ", ");
    value = value.replaceAll(RegExp(r"\s*/\s*"), " / ");
    value = value.replaceAll("( ", "(");
    value = value.replaceAll(" )", ")");
    value = value.replaceAllMapped(
      RegExp(r"(?<=[(, /])\.(\d)"),
      (m) => "0.${m.group(1)}",
    );
    return value.trim();
  });
  if (tidied != content) {
    file.writeAsStringSync(tidied);
  }
}
