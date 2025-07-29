import fs from "fs";
import path from "path";

function walk(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full, callback);
    else if (full.endsWith(".ts")) callback(full);
  });
}

walk("src", (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(/from\s+["'](.+?)\.ts["']/g, 'from "$1"');
  fs.writeFileSync(filePath, updated);
});
