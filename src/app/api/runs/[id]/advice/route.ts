import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { adviceLimiter, enforce } from "@/server/rateLimit";
import { getAdvice } from "@/server/services/advisorService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Советник по ресурсам: варианты «+1 ресурс» для параметров прогона, оценённые парным сравнением (CRN). */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "run:read");
  const id = idSchema.parse((await ctx.params).id);
  enforce(adviceLimiter, user.id);
  return json({ advice: await getAdvice(id) });
});
