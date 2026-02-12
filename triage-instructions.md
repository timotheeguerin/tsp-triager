# TypeSpec Issue Triage Instructions

You are triaging a GitHub issue from the microsoft/typespec repository.
Your job is to analyze the issue and produce a JSON triage result.

## Known Emitter Packages

The following emitter packages are available in microsoft/typespec:
{{KNOWN_EMITTERS}}

## Your Tasks

### 1. Classify the issue
- First, check if this is a documentation bug:
  - If the issue is primarily about incorrect, missing, or unclear documentation → category = "docs-bug"
  - Look for keywords like "docs", "documentation", "readme", "website", "tutorial", "guide", "example"
  - Issues about typos, broken links, or outdated docs should be "docs-bug"
  - Documentation bugs are less critical than code bugs, so separate them
- If not a docs bug, then:
  - If it has the "bug" label → category = "bug"
  - If it has the "feature-request" or "feature" label → category = "feature-request"
  - Otherwise, analyze the content:
    - Title starting with "[Bug]" or body containing "Describe the bug" + "Reproduction" → "bug"
    - Keywords like "error", "crash", "broken", "regression", "doesn't work" → lean "bug"
    - Keywords like "feature", "proposal", "suggestion", "enhancement" → "feature-request"
    - If unclear → "unknown"

### 2. Detect emitter involvement
Check if the issue mentions or requires a specific TypeSpec emitter:
- Look for labels like "emitter:openapi3", "emitter:json-schema", "emitter:protobuf", etc.
- Look for mentions in the title or body like "OpenAPI", "JSON Schema", "Protobuf", etc.
- Map to the correct package from the known emitters list above
- Set the "emitter" field to the emitter package name (e.g., "@typespec/openapi3") or null if no emitter is involved

### 3. Extract a reproduction (only for bugs, skip for docs-bug and feature-request)
Look for TypeSpec reproduction code in the issue body and comments:

**a) Playground links**: Look for URLs like `https://typespec.io/playground?...`
   - If found, decode using: `npx tsx {{DECODE_SCRIPT}} "<url>"`
   - This outputs the TypeSpec source code to stdout

**b) TypeSpec code blocks**: Look for fenced code blocks with ```typespec or ```tsp language tags.
   - Also check unlabeled code blocks that contain TypeSpec keywords (import, model, op, namespace, using, interface, enum, union, scalar, decorators with @)

**c) Important**: Skip code blocks tagged as other languages (yaml, python, json, js, ts, csharp, bash, shell, etc.) unless they clearly contain TypeSpec code.

Prefer playground links over code blocks (they're more likely to be complete).

### 4. Verify the reproduction (only if you found repro code)
Save the repro TypeSpec code to a temp file and verify it compiles:

```bash
cat > ./temp/triage-{{ISSUE_NUMBER}}.tsp << 'TYPESPEC_EOF'
<repro code here>
TYPESPEC_EOF

# If an emitter is involved, ALWAYS pass it to the verify script:
npx tsx {{VERIFY_SCRIPT}} ./temp/triage-{{ISSUE_NUMBER}}.tsp --emitter <emitter-package-name>

# Otherwise, just compile without an emitter:
npx tsx {{VERIFY_SCRIPT}} ./temp/triage-{{ISSUE_NUMBER}}.tsp
```

The verify script outputs JSON: `{ "success": boolean, "diagnostics": string, "exitCode": number }`

**IMPORTANT: Always run the emitter.** If the issue references an emitter (from labels, title, or body), you MUST pass `--emitter <package-name>` to the verify script. This ensures emitter-specific bugs are caught. The verify script will install the emitter package and run it.

Interpret the compile result:
- **success=true, and bug IS about compilation errors**: The bug may be fixed → verification = "fixed"
- **success=false, errors match the described bug**: → verification = "still-reproduces"
- **success=false, errors are unrelated** (broken/incomplete snippet): → verification = "compile-error"
- **success=true, but the bug is about incorrect output** (wrong OpenAPI spec, wrong generated code, etc.): → verification = "not-verified" — note this in reproDescription

### 5. Detailed repro description (reproDescription)
For bugs that involve more than just a compilation error, write a **detailed markdown description** in the `reproDescription` field. This should include:

- What the bug is about (e.g., incorrect emitter output, wrong behavior, IDE issue)
- What the expected behavior should be (from the issue)
- What the actual behavior is (what you observed or what the issue reports)
- If the bug is about emitter output: describe what the emitter should generate vs what it actually generates
- If the bug cannot be verified by compilation alone, explain why and what manual steps would be needed
- If you ran the emitter and it succeeded, note that the emitter ran without errors but the output needs manual review

Keep this field null for straightforward compilation bugs where the compiler output tells the whole story.

### 6. If no repro found, try to create one
If the issue describes a bug but has no repro, try writing minimal TypeSpec code that demonstrates it.
Then verify with the same helper. If successful: reproSource = "generated", reproStatus = "generated".
If you can't create a working repro after a few attempts: reproStatus = "unable-to-repro".

### 7. Output
After completing analysis, output your result as a JSON file.
Write the result to: {{RESULTS_DIR}}/issue-{{ISSUE_NUMBER}}.json

The JSON must match this schema exactly:
```json
{
  "number": {{ISSUE_NUMBER}},
  "title": "{{ISSUE_TITLE}}",
  "url": "{{ISSUE_URL}}",
  "author": "{{ISSUE_AUTHOR}}",
  "createdAt": "{{ISSUE_CREATED_AT}}",
  "labels": {{ISSUE_LABELS}},
  "category": "bug|feature-request|docs-bug|unknown",
  "reproStatus": "has-repro|missing|generated|unable-to-repro",
  "reproSource": "code-block|playground-link|generated|null",
  "reproCode": "the TypeSpec code or null",
  "emitter": "emitter package name (e.g., @typespec/openapi3) or null",
  "compilerOptions": { "emit": ["@typespec/openapi3"] } | null,
  "verification": "still-reproduces|fixed|compile-error|not-verified",
  "compilerOutput": "compiler output string or null",
  "suggestedAction": "one of the suggested actions below",
  "playgroundLink": null,
  "reproDescription": "detailed markdown description of the repro findings, or null"
}
```

**compilerOptions**: Set this when you have repro code. Include `emit` with the list of emitters used for verification. Set to null if no repro code.

**playgroundLink**: Always set to null — the aggregation script will compute this automatically from reproCode and compilerOptions.

**reproDescription**: A markdown string with detailed findings for non-trivial bugs. Set to null for simple compilation bugs.

Suggested actions:
- "Bug confirmed — still reproduces with latest compiler."
- "May be fixed — no longer reproduces with latest compiler. Consider closing."
- "Repro code has errors unrelated to the bug. Needs manual review."
- "Missing reproduction. Needs repro from reporter."
- "Could not verify — needs manual review."
- "Feature request — not a bug."
- "Documentation bug — lower priority than code bugs."
- "Unclassified issue — needs manual review."
