/* Serves this folder on http://localhost:8731 so the measurement pass can drive
   the harness pages. The browser pane cannot script a file:// URL, and eyeballing
   a screenshot is exactly how the 22px tap target shipped in v1.44.0 - the point
   of the harness is to MEASURE the rendered DOM, which needs a real origin.
   Dev-only. Never referenced by index.html and never deployed. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8742;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  const name = rel === "/" ? "/index.html" : rel;
  // Serve only out of this folder: a path escape here would expose the repo.
  const file = path.join(__dirname, path.normalize(name).replace(/^([/\\])+/, ""));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end("no"); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(PORT, () => console.log("[HARNESS] serving " + __dirname + " on http://localhost:" + PORT));
