# TypeSpec Issue Triage Instructions

You are triaging a GitHub issue from the microsoft/typespec repository.
Your job is to analyze the issue and produce a JSON triage result.

## Your Tasks

### 1. Classify the issue
- First, check if this is a documentation bug:
  - If the issue is primarily about incorrect, missing, or unclear documentation → category = "docs-bug"
  - Look for keywords like "docs", "documentation", "readme", "website", "tutorial", "guide", "example"
  - Issues about typos, broken links, or outdated docs should be "docs-bug"
  - Documentation bugs are less critical than code bugs, so separate them
- If not a docs bug, then:
  - If it has the "bug" label → category = "bug"
  - If it has the "feature-request" label → category = "feature-request"
  - Otherwise, analyze the content:
    - Title starting with "[Bug]" or body containing "Describe the bug" + "Reproduction" → "bug"
    - Keywords like "error", "crash", "broken", "regression", "doesn't work" → lean "bug"
    - Keywords like "feature", "proposal", "suggestion", "enhancement" → "feature-request"
    - If unclear → "unknown"

### 2. Detect emitter involvement
Check if the issue mentions or requires a specific TypeSpec emitter:
- Look for labels like "emitter:openapi3", "emitter:json-schema", "emitter:protobuf", etc.
- Look for mentions in the title or body like "OpenAPI", "JSON Schema", "Protobuf", etc.
- Common emitters: @typespec/openapi3, @typespec/openapi, @typespec/json-schema, @typespec/protobuf, @typespec/http
- Set the "emitter" field to the emitter package name (e.g., "@typespec/openapi3") or null if no emitter is involved

### 3. Extract a reproduction (only for bugs, skip for docs-bug)
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

# If an emitter is involved, pass it to the verify script:
npx tsx {{VERIFY_SCRIPT}} ./temp/triage-{{ISSUE_NUMBER}}.tsp --emitter <emitter-name>

# Otherwise, just compile without an emitter:
npx tsx {{VERIFY_SCRIPT}} ./temp/triage-{{ISSUE_NUMBER}}.tsp
```

The verify script outputs JSON: `{ "success": boolean, "diagnostics": string, "exitCode": number }`

**Important: Not all bugs are about compilation errors.** Many bugs are about incorrect emitter output (e.g., wrong OpenAPI spec, missing fields in generated output, incorrect decorators behavior). Read the issue carefully to understand what the expected vs actual behavior is:

- If the bug is about a **compilation error or diagnostic message**: check if the compiler produces the described error.
- If the bug is about **incorrect emitter output** (e.g., wrong OpenAPI, wrong JSON Schema): a successful compilation does NOT mean the bug is fixed. In this case, set verification = "not-verified" and suggestedAction = "Bug is about emitter output, not compilation. Needs manual review of emitter output." unless you can also run the emitter and check its output.
- If the bug is about **runtime behavior**, **IDE features**, **tooling**, or **documentation**: set verification = "not-verified" since these can't be verified by compilation alone.

Interpret the compile result:
- **success=true, but bug is about emitter output or runtime behavior**: → verification = "not-verified" (compilation alone can't verify this)
- **success=true, and bug IS about compilation errors**: The bug may be fixed → verification = "fixed"
- **success=false, errors match the described bug**: → verification = "still-reproduces"
- **success=false, errors are unrelated** (broken/incomplete snippet): → verification = "compile-error"

### 5. If no repro found, try to create one
If the issue describes a bug but has no repro, try writing minimal TypeSpec code that demonstrates it.
Then verify with the same helper. If successful: reproSource = "generated", reproStatus = "generated".
If you can't create a working repro after a few attempts: reproStatus = "unable-to-repro".

### 6. Output
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
  "verification": "still-reproduces|fixed|compile-error|not-verified",
  "compilerOutput": "compiler output string or null",
  "suggestedAction": "one of the suggested actions below"
}
```

Suggested actions:
- "Bug confirmed — still reproduces with latest compiler."
- "May be fixed — no longer reproduces with latest compiler. Consider closing."
- "Repro code has errors unrelated to the bug. Needs manual review."
- "Missing reproduction. Needs repro from reporter."
- "Could not verify — needs manual review."
- "Feature request — not a bug."
- "Documentation bug — lower priority than code bugs."
- "Unclassified issue — needs manual review."
