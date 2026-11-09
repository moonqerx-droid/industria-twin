import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Создаёт изолированную тестовую БД prisma/test.db (отдельный файл, рабочая dev.db не затрагивается),
 * применяет миграции (migrate deploy) и заполняет демонстрационными данными.
 */
export default async function setup() {
  const root = path.resolve(__dirname, "../..");
  for (const f of ["test.db", "test.db-journal"]) fs.rmSync(path.join(root, "prisma", f), { force: true });
  fs.closeSync(fs.openSync(path.join(root, "prisma", "test.db"), "a"));
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "pipe" });
}
