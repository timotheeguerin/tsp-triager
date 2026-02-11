#!/usr/bin/env npx tsx
/**
 * Helper script: Verify a TypeSpec repro by compiling it.
 *
 * Usage:
 *   npx tsx src/helpers/verify-repro.ts <tsp-file-or-code>
 *
 * If the argument is a file path that exists, it reads from that file.
 * Otherwise, it treats the argument as inline TypeSpec code.
 *
 * It creates a temp project, installs dependencies via npm, compiles
 * using the installed tsp CLI, and outputs a JSON result to stdout:
 * {
 *   "success": boolean,        // true if compilation succeeded (exit code 0)
 *   "diagnostics": string,     // compiler output
 *   "exitCode": number
 * }
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function detectImports(code: string): string[] {
  const deps: string[] = [];
  const importRe = /import\s+"([^"]+)"/g;
  let match;
  while ((match = importRe.exec(code)) !== null) {
    deps.push(match[1]);
  }
  return deps;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: verify-repro.ts <tsp-file-or-code>");
    process.exit(1);
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

    // Build package.json based on imports
    const imports = detectImports(code);
    const deps: Record<string, string> = {
      "@typespec/compiler": "latest",
    };
    for (const imp of imports) {
      if (imp.startsWith("@")) {
        deps[imp] = "latest";
      }
    }

    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: deps }, null, 2),
    );

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
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Compile using locally installed tsp
    const tspBin = join(tempDir, "node_modules", ".bin", "tsp");
    try {
      const output = execSync(`"${tspBin}" compile main.tsp`, {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });
      const result = {
        success: true,
        diagnostics: output || "(compiled successfully, no diagnostics)",
        exitCode: 0,
      };
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; status?: number };
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      const result = {
        success: false,
        diagnostics: output,
        exitCode: err.status ?? 1,
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
