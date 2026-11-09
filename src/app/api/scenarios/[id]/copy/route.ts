import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { copyScenario } from "@/server/services/scenarioService";
import { idSchema, scenarioCopySchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "scenario:write");
  const id = idSchema.parse((await ctx.params).id);
  const text = await req.text();
  const body = scenarioCopySchema.parse(text ? JSON.parse(text) : {});
  return json({ scenario: await copyScenario(id, user.id, body.name) }, { status: 201 });
});
