import { audit } from "@/server/services/auditService";
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
  const scenario = await copyScenario(id, user.id, body.name);
  await audit(user, "scenario.copy", { entityType: "scenario", entityId: scenario.id, details: `${scenario.name} ← ${id}` });
  return json({ scenario }, { status: 201 });
});
