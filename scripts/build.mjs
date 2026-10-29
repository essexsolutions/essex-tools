// Minifies every .js / .css in src/ into the repo root, keeping the same
// file name. The root files are what jsDelivr serves
// (cdn.jsdelivr.net/gh/essexsolutions/essex-tools@vX.Y.Z/<file>), so the
// public URLs never change. Edit src/, never the root copies.
//
//   node scripts/build.mjs          write the minified files
//   node scripts/build.mjs --check  exit 1 if any root file is stale
//
// Run automatically by .github/workflows/minify.yml on every push to main
// that touches src/ (it commits the result back), and by `npm run build`.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { transform } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const srcDir = join(root, "src");
const check = process.argv.includes("--check");

// Lowest syntax level the minifier may emit. Sources that use newer syntax
// are transformed down to it; nothing older is "upgraded" past it.
const target = "es2020";

const files = (await readdir(srcDir)).filter((f) => [".js", ".css"].includes(extname(f))).sort();

let stale = [];
for (const file of files) {
  const source = await readFile(join(srcDir, file), "utf8");
  const loader = extname(file).slice(1); // "js" | "css"
  const banner = `/*! essexsolutions/essex-tools ${file} - generated from src/${file}; edit the source, not this file */`;

  const { code, warnings } = await transform(source, {
    loader,
    minify: true,
    target,
    charset: "utf8",
    legalComments: "none",
    banner,
  });
  for (const w of warnings) console.warn(`${file}: ${w.text}`);

  const out = join(root, file);
  const current = await readFile(out, "utf8").catch(() => null);
  const kb = (n) => (n / 1024).toFixed(1).padStart(6) + " kB";

  if (check) {
    if (current !== code) stale.push(file);
    continue;
  }
  if (current === code) {
    console.log(`  unchanged  ${basename(file)}`);
    continue;
  }
  await writeFile(out, code);
  console.log(`  wrote      ${basename(file).padEnd(28)} ${kb(source.length)} -> ${kb(code.length)}`);
}

if (check) {
  if (stale.length) {
    console.error(`Stale minified files (run \`npm run build\`):\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`All ${files.length} minified files are up to date.`);
}
