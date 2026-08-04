import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL("../dist/site/", import.meta.url).pathname);
const types = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"]]);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) throw new Error("Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": types.get(extname(file)) ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(4768, "127.0.0.1", () => console.log("http://127.0.0.1:4768"));
