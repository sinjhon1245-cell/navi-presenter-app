// 개발용 정적 서버: public/ 폴더를 http://localhost:3000 에서 보여 줘요. 배포(Vercel)에는 쓰지 않아요.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

createServer(async (req, res) => {
  let file;
  try {
    let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path.endsWith("/")) path += "index.html";
    file = normalize(join(root, path));
  } catch (e) { file = ""; }
  if (!file.startsWith(root)) { res.writeHead(400).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("없는 파일이에요");
  }
}).listen(port, () => console.log("수업 내비: http://localhost:" + port));
