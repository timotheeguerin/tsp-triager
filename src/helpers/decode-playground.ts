#!/usr/bin/env npx tsx
/**
 * Helper script: Decode a TypeSpec playground URL.
 *
 * Usage:
 *   npx tsx src/helpers/decode-playground.ts <playground-url>
 *
 * Outputs the decoded TypeSpec code to stdout.
 * If the URL has no content parameter or decoding fails, exits with code 1.
 */
import lzutf8 from "lzutf8";

function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: decode-playground.ts <playground-url>");
    process.exit(1);
  }

  try {
    const parsed = new URL(url);
    const compressed = parsed.searchParams.get("c");
    if (!compressed) {
      console.error("No 'c' (content) parameter found in URL");
      process.exit(1);
    }

    const code = lzutf8.decompress(compressed, { inputEncoding: "Base64" }) as string;
    console.log(code);
  } catch (e) {
    console.error("Failed to decode:", (e as Error).message);
    process.exit(1);
  }
}

main();
