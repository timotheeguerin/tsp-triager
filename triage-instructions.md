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

### 3. Extract a reproduction (only for bugs, skip for docs-bug and feature-request)
Look for TypeSpec reproduction code in the issue body and comments:

**a) Playground links**: Look for URLs like `https://typespec.io/playground?...`
   - If found, decode using: `npx tsx {{DECODE_SCRIPT}} "<url>"`
   - This outputs the TypeSpec source code to stdout

**b) TypeSpec code blocks**: Look for fenced code blocks with ```typespec or ```tsp language tags.
   - Also check unlabeled code blocks that contain TypeSpec keywords (import, model, op, namespace, using, interface, enum, union, scalar, decorators with @)

**c) Important**: Skip code blocks tagged as other languages (yaml, python, json, js, ts, csharp, bash, shell, etc.) unless they clearly contain TypeSpec code or the repro for a different input(like openapi3 to typespec converter).

Prefer playground links over code blocks (they're more likely to be complete).

**reproStatus rules**:
- `"has-repro"` — reproduction code was found **in the issue itself** (code block or playground link)
- `"generated"` — you wrote the reproduction code yourself because the issue didn't include one
- `"missing"` — no repro was found and you couldn't create one
- `"unable-to-repro"` — you tried to create a repro but failed after multiple attempts

Do NOT set `"has-repro"` if you wrote the code yourself — that is `"generated"`.

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

### 5. TypeSpec-specific knowledge for writing repros

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

### 6. Special case: OpenAPI3 converter bugs (tsp-openapi3 convert)

Some issues involve the `tsp-openapi3 convert` command which converts OpenAPI3 specs to TypeSpec. For these issues:

1. The reproduction is an **OpenAPI3 JSON or YAML file**, not TypeSpec code. Include a full valid openapi3 document if applicable.
2. To verify:
   - Write the OpenAPI file to a temp file
   - Install @typespec/openapi3: `npm install @typespec/openapi3@latest @typespec/compiler@latest`
   - Run the converter: `npx tsp-openapi3 convert <openapi-file>`
   - Check if the generated TypeSpec code is valid by compiling it

Set the emitter to `@typespec/openapi3` and note in reproDescription that this is a converter bug.

### 7. Detailed repro description (reproDescription)
For bugs that involve more than just a compilation error, write a **detailed markdown description** in the `reproDescription` field. This should include:

- What the bug is about
- What the expected behavior should be (from the issue)
- What the actual behavior is (what you observed)
- If the bug is about emitter output: quote the relevant parts of the emitter output that show the bug, and explain what it should look like instead
- If the bug cannot be verified (IDE, runtime, tooling): explain why

Keep this field null for straightforward compilation bugs where the compiler output tells the whole story.

### 8. If no repro found, try to create one
If the issue describes a bug but has no repro, try writing minimal TypeSpec code that demonstrates it.
Then verify with the same helper. If successful: reproSource = "generated", reproStatus = "generated".
If you can't create a working repro after a few attempts: reproStatus = "unable-to-repro".

### 9. Output
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
