import { requireUser } from "@/server/auth/session";
import { handler, json, parseJson } from "@/server/http";
import { createUser, listUsers } from "@/server/services/userService";
import { userCreateSchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "users:read");
  return json({ users: await listUsers() });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser(req, "users:write");
  const input = await parseJson(req, userCreateSchema);
  return json({ user: await createUser(user, input) }, { status: 201 });
});
