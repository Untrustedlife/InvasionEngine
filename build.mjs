import { build } from "esbuild";
import {
  mkdir,
  rm,
  cp,
  readdir,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\\scripts$/, "");
const out = join(root, "dist");

const exists = async (p) => !!(await stat(p).catch(() => null));
const copyIfExists = async (rel) => {
  const src = join(root, rel);
  if (await exists(src)) {
    const dst = join(out, rel);
    await mkdir(dirname(dst), { recursive: true }).catch(() => {});
    await cp(src, dst, { recursive: true });
    console.log("Copied", rel);
  }
};

console.log("Clean dist/");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

//Bundle JS, preserving "src/Main.js" path in dist so existing HTML keeps working.
await build({
  entryPoints: [
    join(root, "src/Main.js"),
    join(root, "src/editor/MapEditor.js"),
  ],
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: false,
  outdir: out,
  outbase: root, //keep folder structure (sist/src/Main.js)
  entryNames: "[dir]/[name]",
  chunkNames: "chunks/[name]-[hash]",
});
console.log("Bundled JS");

//Copy common asset folders if present
await copyIfExists("audio");
await copyIfExists("sfx");
await copyIfExists("images");
await copyIfExists("img");
await copyIfExists("assets");
await copyIfExists("styles");
await copyIfExists("css");

//Copy HTML files and ensure we have dist/index.html
const htmlFiles = (await readdir(root)).filter((f) =>
  f.toLowerCase().endsWith(".html")
);
let indexWritten = false;

for (const f of htmlFiles) {
  const src = join(root, f);
  const dst = join(out, f);
  await cp(src, dst);
  if (f.toLowerCase() === "index.html") {
    indexWritten = true;
  }
}

//If there was no index.html, use RealmChildInvasionGameController.html as index.
//Otherwise, create a minimal index.html that loads dist/src/Main.js.
if (!indexWritten) {
  const controller = htmlFiles.find(
    (f) => f.toLowerCase() === "realmchildinvasiongamecontroller.html"
  );
  if (controller) {
    const src = await readFile(join(root, controller), "utf8");
    await writeFile(join(out, "index.html"), src);
    console.log("Created dist/index.html from", controller);
  } else {
    const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Realmchild Invasion</title>
<style>html,body{height:100%;margin:0;background:#0b1322}#root,canvas{height:100%;width:100%;display:block}</style>
<body>
<canvas id="view"></canvas>
<script type="module" src="./src/Main.js"></script>
</body>
</html>`;
    await writeFile(join(out, "index.html"), html);
    console.log("Created minimal dist/index.html");
  }
}

console.log("Build complete -> dist/");
