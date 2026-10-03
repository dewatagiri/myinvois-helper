// Bundles widget/widget.js (+ MCP Apps client) into one self-contained dist/widget.html
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = await build({ entryPoints: ["widget/widget.js"], bundle: true, minify: true, format: "iife", write: false, target: "es2020" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/widget.html", readFileSync("widget/template.html", "utf8").replace("/*__BUNDLE__*/", () => js));
console.log("dist/widget.html", (js.length / 1024).toFixed(1), "KB js");
