// Prisma 7 (generator `runtime = "workerd"`) copies the *fast* query-compiler
// WASM (~3.3 MB) into the generated client and loads it with a real
// `import ... from "./query_compiler_fast_bg.wasm?module"` (the only form
// Cloudflare Workers allow — runtime `new WebAssembly.Module(bytes)` is blocked).
//
// The "small" variant is ~1.58 MB and API-compatible. Drop the small glue + wasm
// into the generated client and repoint every reference (import + importName)
// from `_fast_bg` to `_small_bg` — the name must match the wasm's own embedded
// import module name. Runs from `postinstall` / `db:generate`, after
// `prisma generate`.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gen = join(root, "apps", "web", "src", "generated", "prisma");
const internal = join(gen, "internal");
const classFile = join(internal, "class.ts");

if (!existsSync(classFile)) {
  console.log("[patch-prisma-compiler] generated workerd client not found, skipping");
  process.exit(0);
}

let src = readFileSync(classFile, "utf8");
if (!src.includes("query_compiler_fast_bg")) {
  console.log("[patch-prisma-compiler] already patched / unexpected layout, skipping");
  process.exit(0);
}

// 1. small glue JS (defines the wbindgen imports the wasm needs)
writeFileSync(
  join(internal, "query_compiler_small_bg.js"),
  readFileSync(require.resolve("@prisma/client/runtime/query_compiler_small_bg.sqlite.js"), "utf8"),
);

// 2. small wasm bytes (decode the base64 module Prisma ships)
const b64 = readFileSync(
  require.resolve("@prisma/client/runtime/query_compiler_small_bg.sqlite.wasm-base64.mjs"),
  "utf8",
).match(/"([A-Za-z0-9+/=]+)"/)?.[1];
if (!b64) {
  console.error("[patch-prisma-compiler] could not read small wasm base64 — leaving fast variant");
  process.exit(0);
}
const bytes = Buffer.from(b64, "base64");
writeFileSync(join(internal, "query_compiler_small_bg.wasm"), bytes);

// 3. repoint class.ts and drop the now-unused fast files
writeFileSync(classFile, src.replaceAll("query_compiler_fast_bg", "query_compiler_small_bg"));
for (const f of ["query_compiler_fast_bg.js", "query_compiler_fast_bg.wasm"]) {
  rmSync(join(internal, f), { force: true });
}

console.log(
  `[patch-prisma-compiler] query compiler fast -> small (${(bytes.length / 1024 / 1024).toFixed(2)} MB wasm)`,
);
