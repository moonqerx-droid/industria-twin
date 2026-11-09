import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { deleteRun, getRunDetail } from "@/server/services/simulationService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "run:read");
  return json({ run: await getRunDetail(idSchema.parse((await ctx.params).id)) });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "run:delete");
  await deleteRun(idSchema.parse((await ctx.params).id));
  return json({ ok: true });
});
