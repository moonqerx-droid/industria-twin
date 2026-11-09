import { requireUser } from "@/server/auth/session";
import { handler, json, parseJson } from "@/server/http";
import { deleteScenario, getScenario, updateScenario } from "@/server/services/scenarioService";
import { idSchema, scenarioUpdateSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "scenario:read");
  const id = idSchema.parse((await ctx.params).id);
  return json({ scenario: await getScenario(id) });
});

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "scenario:write");
  const id = idSchema.parse((await ctx.params).id);
  const input = await parseJson(req, scenarioUpdateSchema);
  return json({ scenario: await updateScenario(id, input) });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "scenario:delete");
  const id = idSchema.parse((await ctx.params).id);
  await deleteScenario(id);
  return json({ ok: true });
});
