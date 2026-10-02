import fs from "fs";
import path from "path";

export function moduleFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? moduleFiles(fullPath) : [fullPath];
    })
    .filter((file) => file.endsWith(".ts"));
}
