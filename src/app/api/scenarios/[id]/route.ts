import { audit } from "@/server/services/auditService";
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
  const user = await requireUser(req, "scenario:write");
  const id = idSchema.parse((await ctx.params).id);
  const input = await parseJson(req, scenarioUpdateSchema);
  const scenario = await updateScenario(id, input);
  await audit(user, "scenario.update", {
    entityType: "scenario",
    entityId: id,
    details: `${scenario.name}${input.parameters ? ": параметры изменены" : ""}`,
  });
  return json({ scenario });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "scenario:delete");
  const id = idSchema.parse((await ctx.params).id);
  await deleteScenario(id);
  await audit(user, "scenario.delete", { entityType: "scenario", entityId: id });
  return json({ ok: true });
});
