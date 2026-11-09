import { getUserFromRequest } from "@/server/auth/session";
import { handler, json, unauthorized } from "@/server/http";

export const GET = handler(async (req: Request) => {
  const user = await getUserFromRequest(req);
  if (!user) throw unauthorized();
  return json({ user: { login: user.login, displayName: user.displayName, role: user.role } });
});
