import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { handler, json } from "@/server/http";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "users:read");
  const users = await prisma.user.findMany({
    select: { id: true, login: true, displayName: true, roleId: true, isActive: true, createdAt: true, lastLoginAt: true },
    orderBy: { login: "asc" },
  });
  return json({ users });
});
