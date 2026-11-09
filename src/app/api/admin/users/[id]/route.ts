import { requireUser } from "@/server/auth/session";
import { handler, json, parseJson } from "@/server/http";
import { deleteUser, updateUser } from "@/server/services/userService";
import { idSchema, userUpdateSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "users:write");
  const id = idSchema.parse((await ctx.params).id);
  const input = await parseJson(req, userUpdateSchema);
  return json({ user: await updateUser(user, id, input) });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "users:write");
  await deleteUser(user, idSchema.parse((await ctx.params).id));
  return json({ ok: true });
});
