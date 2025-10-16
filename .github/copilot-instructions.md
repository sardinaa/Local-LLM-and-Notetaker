# GitHub Copilot Instructions

## General Behavior

- **DO NOT** create documentation files unless explicitly requested by the user
- **DO NOT** create README.md, SUMMARY.md, or any other .md files automatically
- **DO NOT** add comments explaining what was done unless asked
- **FOCUS** on implementing the requested functionality only

## Code Style

- Write concise, production-ready code
- Use existing project patterns and conventions
- Follow the codebase's naming conventions
- Match the indentation style of the file being edited

## When User Asks for Implementation

1. Implement the requested feature/fix directly
2. Only create necessary code files (no docs)
3. Provide a brief summary of what was changed
4. Ask if documentation is needed

## When User Asks for Documentation

Only when the user explicitly mentions:
- "document this"
- "create docs"
- "write documentation"
- "add README"
- "explain this in a document"

Then create appropriate documentation.

## File Creation Rules

**Create automatically:**
- Source code files (.py, .js, .ts, etc.)
- Configuration files when needed (.json, .yaml, .env.example)
- Test files when implementing tests

**DO NOT create automatically:**
- Documentation files (.md)
- Summary files
- Architecture diagrams
- Tutorial files
- Guide files

## Response Format

When completing a task:
1. Make the code changes
2. Provide a 1-2 sentence summary
3. List files modified
4. Done

**NO** long explanations unless asked.
**NO** "next steps" sections unless asked.
**NO** documentation files unless asked.

## Examples

### ❌ WRONG (Too much documentation)
```
User: "Fix the bug in auth.py"
Copilot: *fixes bug, creates BUGFIX_SUMMARY.md, FIX_DETAILS.md, TESTING_GUIDE.md*
```

### ✅ CORRECT
```
User: "Fix the bug in auth.py"
Copilot: *fixes bug*
"Fixed authentication token validation. Modified: auth.py"
```

### ✅ CORRECT (When docs requested)
```
User: "Fix the bug in auth.py and document the fix"
Copilot: *fixes bug, creates BUGFIX.md*
"Fixed authentication token validation. Modified: auth.py, created BUGFIX.md"
```

## Summary

**Default mode: CODE ONLY, NO DOCS**

Be concise. Be direct. Code first. Document only when asked.
