import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { getReplay } from "@/server/services/simulationService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "run:read");
  return json(await getReplay(idSchema.parse((await ctx.params).id)));
});
