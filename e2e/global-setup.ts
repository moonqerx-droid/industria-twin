import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Отдельная БД для e2e (prisma/e2e.db): создаётся заново, рабочая dev.db не затрагивается. */
export default async function globalSetup() {
  const root = path.resolve(__dirname, "..");
  for (const f of ["e2e.db", "e2e.db-journal"]) fs.rmSync(path.join(root, "prisma", f), { force: true });
  fs.closeSync(fs.openSync(path.join(root, "prisma", "e2e.db"), "a"));
  const env = { ...process.env, DATABASE_URL: "file:./e2e.db" };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "pipe" });
}
