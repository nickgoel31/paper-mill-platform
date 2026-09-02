// Prisma 7's generated client hard-codes the "fast" WASM query compiler
// (~4.3 MB base64). On Cloudflare Workers that pushes the bundle past the
// 3 MiB free-plan limit. The "small" variant (~2.1 MB) is API-compatible, so
// rewrite the generated loader to use it. Runs from `postinstall`, after
// `prisma generate`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "apps", "web", "src", "generated", "prisma", "internal", "class.ts");

if (!existsSync(target)) {
  console.log("[patch-prisma-compiler] generated client not found, skipping");
  process.exit(0);
}

const src = readFileSync(target, "utf8");
const patched = src.replaceAll("query_compiler_fast_bg.", "query_compiler_small_bg.");

if (patched === src) {
  console.log("[patch-prisma-compiler] nothing to patch (already small or layout changed)");
} else {
  writeFileSync(target, patched);
  console.log("[patch-prisma-compiler] switched WASM query compiler: fast -> small");
}
