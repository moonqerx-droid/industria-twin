import { audit } from "@/server/services/auditService";
import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { enforce, simulationLimiter } from "@/server/rateLimit";
import { runScenarioSimulation } from "@/server/services/simulationService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "simulation:run");
  const id = idSchema.parse((await ctx.params).id);
  enforce(simulationLimiter, user.id);
  const run = await runScenarioSimulation(id, user.id);
  await audit(user, "simulation.run", {
    entityType: "run",
    entityId: run.id,
    details: `${run.scenarioName}: ${run.replications} репл., ${run.durationMs} мс`,
  });
  return json({ run }, { status: 201 });
});
