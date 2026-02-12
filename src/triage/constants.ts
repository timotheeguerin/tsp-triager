import { join, resolve } from "node:path";

export const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
export const VERIFY_SCRIPT = join(PROJECT_ROOT, "src", "helpers", "verify-repro.ts");
export const DECODE_SCRIPT = join(PROJECT_ROOT, "src", "helpers", "decode-playground.ts");
export const INSTRUCTIONS_FILE = join(PROJECT_ROOT, "triage-instructions.md");

export const EXCLUDED_LABELS = [
  "emitter:client:python",
  "emitter:client:csharp",
  "emitter:client:java",
  "emitter:client:js",
  "feature",
  "emitter-framework",
];

export const KNOWN_EMITTERS = [
  "@typespec/openapi3",
  "@typespec/openapi",
  "@typespec/json-schema",
  "@typespec/protobuf",
  "@typespec/xml",
  "@typespec/http-server-csharp",
  "@typespec/http-server-js",
  "@typespec/http-client-csharp",
  "@typespec/http-client-java",
  "@typespec/http-client-js",
  "@typespec/http-client-python",
];

export const DEFAULT_MODEL = "claude-sonnet-4";
export const DEFAULT_CONCURRENCY = 1;
export const DEFAULT_REPO = "microsoft/typespec";
