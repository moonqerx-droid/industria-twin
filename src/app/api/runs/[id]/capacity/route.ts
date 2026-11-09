import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { adviceLimiter, enforce } from "@/server/rateLimit";
import { getCapacityCurve } from "@/server/services/advisorService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Кривая пропускной способности: показатели при спросе от 60% до 150% текущего (CRN, 10 репликаций на точку). */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "run:read");
  const id = idSchema.parse((await ctx.params).id);
  enforce(adviceLimiter, user.id);
  return json({ capacity: await getCapacityCurve(id) });
});
