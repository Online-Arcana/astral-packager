import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const siteOnly = process.argv.includes("--site");

const js = (source) => source.replaceAll(/(from\s+["'][^"']+)\.ts(["'])/gu, "$1.js$2");

const copySrc = async (target, include) => {
  await mkdir(target, { recursive: true });
  for (const name of await readdir(new URL("../src/", import.meta.url))) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts") || !include(name)) continue;
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
    const out = name.replace(/\.ts$/u, ".js");
    await writeFile(new URL(out, target), js(source));
  }
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (!siteOnly) {
  await copySrc(dist, (name) => name !== "web.ts");
  await cp(new URL("../src/index.d.ts", import.meta.url), new URL("index.d.ts", dist));
  await chmod(new URL("bin.js", dist), 0o755);
}

const site = new URL("site/", dist);
await mkdir(site, { recursive: true });
await cp(new URL("../public/index.html", import.meta.url), new URL("index.html", site));
await cp(new URL("../public/style.css", import.meta.url), new URL("style.css", site));
await copySrc(site, (name) => name !== "bin.ts" && name !== "index.ts" && name !== "web.ts");
await writeFile(new URL("app.js", site), js(await readFile(new URL("../src/web.ts", import.meta.url), "utf8")));
console.log(`Built ${siteOnly ? "site" : "package and site"}.`);
