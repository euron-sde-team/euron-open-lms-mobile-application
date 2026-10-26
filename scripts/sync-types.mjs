#!/usr/bin/env node
/**
 * Copies the API contract from a euron-open-lms checkout into src/api/vendor:
 *   packages/types/src/*.ts                       -> src/api/vendor/types/
 *   packages/api-client/src/{errors,pagination,upload}.ts and the learner endpoint
 *   groups (core, catalog, learning, assessments, commerce, helpers) -> src/api/vendor/client/
 * The admin and authoring groups are left out: this app is the learner client.
 *
 *   node scripts/sync-types.mjs [path-to-euron-open-lms]          copy
 *   node scripts/sync-types.mjs --check [path-to-euron-open-lms]  fail if anything differs
 *
 * The LMS checkout defaults to ../euron-open-lms. The commit it was copied from is written
 * to src/api/vendor/SOURCE so a reviewer can see which server version the app targets.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const lms = resolve(args.find((a) => !a.startsWith("--")) ?? join(root, "..", "euron-open-lms"));
const out = join(root, "src/api/vendor");

if (!existsSync(join(lms, "packages/types/src"))) {
  console.error(`euron-open-lms not found at ${lms}. Pass its path: node scripts/sync-types.mjs <path>`);
  process.exit(check ? 0 : 1);
}

const HEADER = "// Copied from euron-open-lms by scripts/sync-types.mjs. Do not edit: change it there and run `pnpm sync-types`.\n";
const ENDPOINTS = ["helpers", "core", "catalog", "learning", "assessments", "commerce"];
const CLIENT = ["errors", "pagination", "upload"];

/**
 * Rewrites the package import to the vendored copy, and the web transport (`./http`) to
 * the app's own native one in src/api/http.ts.
 */
function rewrite(src, depth) {
  const up = "../".repeat(depth);
  return (
    HEADER +
    src
      .replace(/from "@open-lms\/types"/g, `from "${up}types"`)
      .replace(/from "\.\.?\/http"/g, `from "${up}../http"`)
  );
}

const files = new Map();
for (const f of readdirSync(join(lms, "packages/types/src")).filter((f) => f.endsWith(".ts"))) {
  files.set(`types/${f}`, rewrite(readFileSync(join(lms, "packages/types/src", f), "utf8"), 0));
}
for (const f of CLIENT) {
  files.set(`client/${f}.ts`, rewrite(readFileSync(join(lms, "packages/api-client/src", `${f}.ts`), "utf8"), 1));
}
for (const f of ENDPOINTS) {
  files.set(`client/endpoints/${f}.ts`, rewrite(readFileSync(join(lms, "packages/api-client/src/endpoints", `${f}.ts`), "utf8"), 2));
}

let commit = "unknown";
try {
  commit = execFileSync("git", ["-C", lms, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["-C", lms, "status", "--porcelain", "packages/types", "packages/api-client"], { encoding: "utf8" }).trim();
  if (dirty) commit += " (with uncommitted changes)";
} catch {
  /* not a git checkout */
}

if (check) {
  const drift = [];
  for (const [rel, content] of files) {
    const p = join(out, rel);
    if (!existsSync(p) || readFileSync(p, "utf8") !== content) drift.push(rel);
  }
  if (drift.length) {
    console.error(`API contract drift against ${lms}:\n  ${drift.join("\n  ")}\nRun: pnpm sync-types`);
    process.exit(1);
  }
  console.log(`api contract: in sync with euron-open-lms ${commit} (${files.size} files)`);
} else {
  rmSync(out, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const p = join(out, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  writeFileSync(join(out, "SOURCE"), `euron-open-lms ${commit}\n`);
  console.log(`copied ${files.size} files from euron-open-lms ${commit}`);
}
