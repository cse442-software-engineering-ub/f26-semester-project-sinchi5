import { cp, mkdir } from "node:fs/promises";
await mkdir("dist/api", { recursive: true });
for (const path of ["index.php", ".htaccess", "lib"]) {
  await cp(`backend/${path}`, `dist/api/${path}`, { recursive: true });
}
