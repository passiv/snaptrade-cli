import fs from "fs/promises";
import path from "path";

async function copyAndRewrite(dir, outDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await fs.mkdir(outDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(dir, entry.name);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      await copyAndRewrite(srcPath, outPath);
    } else if (entry.name.endsWith(".ts")) {
      let content = await fs.readFile(srcPath, "utf8");
      content = content.replace(/from\s+["'](.+?)\.ts["']/g, 'from "$1.js"');
      await fs.writeFile(outPath, content);
    } else {
      await fs.copyFile(srcPath, outPath);
    }
  }
}

await fs.rm("./build", { recursive: true, force: true });
await copyAndRewrite("./src", "./build");
