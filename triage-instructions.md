# TypeSpec Issue Triage Instructions

You are triaging a GitHub issue from the microsoft/typespec repository.
Your job is to analyze the issue and produce a JSON triage result.

## Learn TypeSpec First

Before triaging, you should understand the TypeSpec language. Read the documentation at https://typespec.io to understand:
- TypeSpec syntax: models, operations, namespaces, decorators, scalars, unions, enums, interfaces
- How emitters work (they take TypeSpec and produce output like OpenAPI, Protobuf, JSON Schema, etc.)
- Common decorators like `@service`, `@route`, `@encode`, `@field`, etc.
- The `import` statement for bringing in library packages

## Known Emitter Packages

The following emitter packages are available in microsoft/typespec:
{{KNOWN_EMITTERS}}

## Area Labels

The area labels used to categorize issues are defined in the TypeSpec repository at:
https://github.com/microsoft/typespec/blob/main/eng/common/config/labels.ts

Fetch this file to see the full list of `AreaLabels`. Use these label names when guessing the area for an issue.

## Your Tasks

### 1. Classify the issue
- If it has the "bug" label → category = "bug"
- If it has the "feature-request" or "feature" label → category = "feature-request"
- If the issue is primarily about documentation → category = "docs-bug"
- Otherwise, analyze the content:
  - Title starting with "[Bug]" or body containing "Describe the bug" + "Reproduction" → "bug"
  - Keywords like "error", "crash", "broken", "regression" → lean "bug"
  - Keywords like "feature", "proposal", "suggestion" → "feature-request"
  - If unclear → "unknown"

### 2. Detect emitter involvement
Check if the issue mentions or requires a specific TypeSpec emitter:
- Look for labels like "emitter:openapi3", "emitter:json-schema", "emitter:protobuf", etc.
- Look for mentions in the title or body like "OpenAPI", "JSON Schema", "Protobuf", etc.
- Map to the correct package from the known emitters list above
- Set the "emitter" field to the emitter package name (e.g., "@typespec/openapi3") or null if no emitter is involved

### 3. Guess the area (for issues with `needs-area` label)
If the issue has the `needs-area` label, or has no area label at all, guess which area it belongs to.

First, fetch the area labels from https://github.com/microsoft/typespec/blob/main/eng/common/config/labels.ts to get the current list of valid area labels.

Then pick the best match based on:
- The emitter involved (e.g., if emitter is `@typespec/openapi3` → the openapi3 area label)
- Keywords in the title/body (e.g., "compiler" → compiler area, "IDE" → ide area, etc.)
- If the issue already has an area label, don't guess — leave `suggestedArea` as null.

Set `suggestedArea` to the best matching area label, or null if you can't determine it.

### 4. Extract a reproduction (only for bugs)

**Skip for feature requests and docs bugs**: If category is `"feature-request"` or `"docs-bug"`, set `reproStatus = "n/a"`, `reproSource = null`, `reproCode = null`, `verification = "not-verified"`, and skip verification entirely.

For bugs, look for TypeSpec reproduction code in the issue body and comments:

**a) Playground links**: Look for URLs like `https://typespec.io/playground?...`
   - They may appear as markdown links `[text](https://typespec.io/playground?...)` OR as HTML anchor tags `<a href="https://typespec.io/playground?...">...</a>`
   - If found, decode using: `npx tsx {{DECODE_SCRIPT}} "<url>"`
   - This outputs the TypeSpec source code to stdout

**b) TypeSpec code blocks**: Look for fenced code blocks with ```typespec or ```tsp language tags.
   - Also check unlabeled code blocks that contain TypeSpec keywords (import, model, op, namespace, using, interface, enum, union, scalar, decorators with @)

**c) Important**: Skip code blocks tagged as other languages (yaml, python, json, js, ts, csharp, bash, shell, etc.) unless they clearly contain TypeSpec code or the repro for a different input(like openapi3 to typespec converter).

Prefer playground links over code blocks (they're more likely to be complete).

**reproStatus rules**:
- `"has-repro"` — reproduction code was found **in the issue itself** (code block or playground link)
- `"generated"` — you wrote the reproduction code yourself because the issue didn't include one
- `"missing"` — no repro was found and you couldn't create one (bugs only)
- `"unable-to-repro"` — you tried to create a repro but failed after multiple attempts
- `"n/a"` — not applicable (feature requests, docs bugs)

Do NOT set `"has-repro"` if you wrote the code yourself — that is `"generated"`.

### 5. Verify the reproduction (only if you found repro code)
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

The verify script outputs JSON:
```json
{
  "success": boolean,
  "diagnostics": string,
  "exitCode": number,
  "emitterOutput": { "filename": "content", ... } | null
}
```

**IMPORTANT: Always run the emitter.** If the issue references an emitter (from labels, title, or body), you MUST pass `--emitter <package-name>` to the verify script. The verify script will install the emitter, run it, and return the generated output files in the `emitterOutput` field.

**IMPORTANT: Check the emitter output.** When the verify script returns `emitterOutput`, you MUST inspect the generated files to verify whether the bug is present. For example:
- For @typespec/openapi3: check the generated OpenAPI JSON/YAML for the incorrect behavior described in the issue
- For @typespec/protobuf: check the generated .proto file for issues
- For @typespec/json-schema: check the generated JSON Schema

If you can see the bug in the emitter output, set verification = "still-reproduces" and include what you found in reproDescription.
If the emitter output looks correct (bug may be fixed), set verification = "fixed".

### 5a. Fix outdated reproductions

Older issues may have repro code that no longer compiles because the TypeSpec language or libraries have evolved. If the repro fails with errors unrelated to the reported bug, try to **fix** the repro:
- **Changed decorator names or signatures**: look up the current decorator API at https://typespec.io and update accordingly
- **Removed/renamed types or namespaces**: replace with the current equivalents
- **Changed import paths**: update `import` statements to match the current package structure
- **Missing `using` statements**: add any needed `using` directives

After fixing, re-run the verify script. If the fix works, use the updated code as the repro and set `reproSource` to `"generated"` (since you modified it). Note in `reproDescription` that the original repro was updated for the latest compiler.

### 5b. Minimize reproduction code

When a repro is large or includes unnecessary code, try to **reduce** it to the smallest code that still demonstrates the bug:
- Remove models, operations, or decorators not related to the bug
- Remove comments and unnecessary whitespace
- Simplify model names and property names
- Remove redundant imports
- Keep only the minimum structure needed to trigger the issue

A smaller repro makes it easier for developers to understand and fix the bug. Aim for under 30 lines when possible.

### 6. TypeSpec-specific knowledge for writing repros

When writing or fixing reproduction code, keep these TypeSpec rules in mind:

**General**:
- Every TypeSpec file that uses libraries needs `import` statements (e.g., `import "@typespec/http";`)
- Use `using` to bring namespaces into scope (e.g., `using TypeSpec.Http;`)
- A `@service` decorator is often needed for emitters to produce output

**Protobuf** (@typespec/protobuf):
- Models MUST be inside a namespace annotated with `@Protobuf.package`
- Example:
  ```typespec
  import "@typespec/protobuf";
  using TypeSpec.Protobuf;

  @package
  namespace MyPackage;

  model MyMessage {
    @field(1) id: string;
  }
  ```
- Without `@package`, the protobuf emitter produces no output

**OpenAPI3** (@typespec/openapi3):
- Typically needs `import "@typespec/http"` and `using TypeSpec.Http;`
- A `@service` decorator on a namespace helps the emitter produce a complete spec
- Example:
  ```typespec
  import "@typespec/http";
  using TypeSpec.Http;

  @service
  namespace Demo;

  model Foo {
    bar: string;
  }
  ```

### 7. Special case: OpenAPI3 converter bugs (tsp-openapi3 convert)

Some issues involve the `tsp-openapi3 convert` command which converts OpenAPI3 specs to TypeSpec. For these issues:

1. The reproduction is an **OpenAPI3 JSON or YAML file**, not TypeSpec code. Include a full valid openapi3 document if applicable.
2. To verify:
   - Write the OpenAPI file to a temp file
   - Install @typespec/openapi3: `npm install @typespec/openapi3@latest @typespec/compiler@latest`
   - Run the converter: `npx tsp-openapi3 convert <openapi-file>`
   - Check if the generated TypeSpec code is valid by compiling it

Set the emitter to `@typespec/openapi3` and note in reproDescription that this is a converter bug.

### 8. Detailed repro description (reproDescription)
For bugs that involve more than just a compilation error, write a **detailed markdown description** in the `reproDescription` field. This should include:

- What the bug is about
- What the expected behavior should be (from the issue)
- What the actual behavior is (what you observed)
- If the bug is about emitter output: quote the relevant parts of the emitter output that show the bug, and explain what it should look like instead
- If the bug cannot be verified (IDE, runtime, tooling): explain why

Keep this field null for straightforward compilation bugs where the compiler output tells the whole story.

### 9. If no repro found, try to create one
If the issue describes a bug but has no repro, try writing minimal TypeSpec code that demonstrates it.
Then verify with the same helper. If successful: reproSource = "generated", reproStatus = "generated".
If you can't create a working repro after a few attempts: reproStatus = "unable-to-repro".

### 10. Output
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
  "reproStatus": "has-repro|missing|generated|unable-to-repro|n/a",
  "reproSource": "code-block|playground-link|generated|null",
  "reproCode": "the TypeSpec code or null",
  "emitter": "emitter package name (e.g., @typespec/openapi3) or null",
  "compilerOptions": { "emit": ["@typespec/openapi3"] } | null,
  "verification": "still-reproduces|fixed|compile-error|not-verified",
  "compilerOutput": "compiler output string or null",
  "suggestedAction": "one of the suggested actions below",
  "playgroundLink": null,
  "reproDescription": "detailed markdown description of the repro findings, or null",
  "suggestedArea": "area label from the area labels list, or null",
  "triageDurationSeconds": 0,
  "model": "your model name (e.g., claude-sonnet-4, gpt-4, etc.)",
  "tokenUsage": { "input": 0, "output": 0 }
}
```

**triageDurationSeconds**: Record how long (in seconds) it took you to fully triage this issue, from first reading it to writing the result file. Use whole numbers.

**model**: Report the name/version of the AI model you are running as (e.g., "claude-sonnet-4", "gpt-4", etc.).

**tokenUsage**: If you can determine your token usage for this triage session, report the input and output token counts. If unknown, set both to 0.

**compilerOptions**: Set this when you have repro code. Include `emit` with the list of emitters used for verification. Set to null if no repro code.

**playgroundLink**: Always set to null — the aggregation script will compute this automatically from reproCode and compilerOptions.

**reproDescription**: A markdown string with detailed findings for non-trivial bugs. Set to null for simple compilation bugs.

**suggestedArea**: If the issue has `needs-area` label or no area label, set this to the best matching area label from the list above. Set to null if the issue already has an area label or you can't determine the area.

Suggested actions:
- "Bug confirmed — still reproduces with latest compiler."
- "May be fixed — no longer reproduces with latest compiler. Consider closing."
- "Repro code has errors unrelated to the bug. Needs manual review."
- "Missing reproduction. Needs repro from reporter."
- "Could not verify — needs manual review."
- "Feature request — not a bug."
- "Documentation bug — lower priority than code bugs."
- "Unclassified issue — needs manual review."
