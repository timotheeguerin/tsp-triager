#!/usr/bin/env npx tsx
/**
 * Helper script: Verify a TypeSpec repro by compiling it.
 *
 * Usage:
 *   npx tsx src/helpers/verify-repro.ts <tsp-file-or-code> [--emitter <emitter-name>]
 *
 * If the first argument is a file path that exists, it reads from that file.
 * Otherwise, it treats the argument as inline TypeSpec code.
 *
 * The optional --emitter flag specifies an emitter to use (e.g., @typespec/openapi3).
 * If specified, the emitter package is installed and configured in tspconfig.yaml.
 *
 * It creates a temp project, installs dependencies via npm, compiles
 * using the installed tsp CLI, and outputs a JSON result to stdout:
 * {
 *   "success": boolean,        // true if compilation succeeded (exit code 0)
 *   "diagnostics": string,     // compiler output
 *   "exitCode": number,
 *   "emitterOutput": { [filename: string]: string } | null  // emitter output files (if any)
 * }
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

function detectImports(code: string): string[] {
  const deps: string[] = [];
  const importRe = /import\s+"([^"]+)"/g;
  let match;
  while ((match = importRe.exec(code)) !== null) {
    if (match[1]) {
      deps.push(match[1]);
    }
  }
  return deps;
}

function collectOutputFiles(dir: string, base: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = relative(base, fullPath);
    if (statSync(fullPath).isDirectory()) {
      Object.assign(files, collectOutputFiles(fullPath, base));
    } else {
      try {
        const content = readFileSync(fullPath, "utf-8");
        // Only include text files under 50KB
        if (content.length < 50_000) {
          files[relPath] = content;
        }
      } catch {
        // skip binary files
      }
    }
  }
  return files;
}

function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: verify-repro.ts <tsp-file-or-code> [--emitter <emitter-name>]");
    process.exit(1);
  }

  const input = args[0];
  let emitter: string | null = null;

  // Check for --emitter flag
  const emitterIndex = args.indexOf("--emitter");
  if (emitterIndex !== -1 && emitterIndex + 1 < args.length) {
    emitter = args[emitterIndex + 1];
  }

  let code: string;
  if (existsSync(input)) {
    code = readFileSync(input, "utf-8");
  } else {
    code = input;
  }

  const tempDir = join(tmpdir(), `triage-verify-${Date.now()}`);

  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "main.tsp"), code);

    // Build package.json based on imports and emitter
    const imports = detectImports(code);
    const deps: Record<string, string> = {
      "@typespec/compiler": "latest",
    };
    for (const imp of imports) {
      if (imp.startsWith("@")) {
        deps[imp] = "latest";
      }
    }
    // Add emitter if specified
    if (emitter) {
      deps[emitter] = "latest";
    }

    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: deps }, null, 2),
    );

    // Create tspconfig.yaml if emitter is specified
    const outputDir = join(tempDir, "tsp-output");
    if (emitter) {
      const tspConfig = `emit:
  - "${emitter}"
options:
  "${emitter}":
    emitter-output-dir: "${outputDir}"
`;
      writeFileSync(join(tempDir, "tspconfig.yaml"), tspConfig);
    }

    // Install dependencies via npm
    try {
      execSync("npm install --no-audit --no-fund", {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 120_000,
        stdio: "pipe",
      });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      const result = {
        success: false,
        diagnostics: `Install failed: ${err.stderr ?? err.stdout ?? "unknown error"}`,
        exitCode: -1,
        emitterOutput: null,
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Compile using locally installed tsp
    const tspBin = join(tempDir, "node_modules", ".bin", "tsp");
    try {
      const compileCmd = emitter ? `"${tspBin}" compile .` : `"${tspBin}" compile main.tsp`;
      const output = execSync(compileCmd, {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      // Collect emitter output files if an emitter was used
      const emitterOutput = emitter ? collectOutputFiles(outputDir, outputDir) : null;

      const result = {
        success: true,
        diagnostics: output || "(compiled successfully, no diagnostics)",
        exitCode: 0,
        emitterOutput,
      };
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; status?: number };
      const output = (err.stdout ?? "") + (err.stderr ?? "");

      // Still try to collect partial emitter output
      const emitterOutput = emitter ? collectOutputFiles(outputDir, outputDir) : null;

      const result = {
        success: false,
        diagnostics: output,
        exitCode: err.status ?? 1,
        emitterOutput,
      };
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

main();
