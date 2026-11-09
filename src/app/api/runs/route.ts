import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { listRuns } from "@/server/services/simulationService";
import { idSchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "run:read");
  const url = new URL(req.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return json({
    runs: await listRuns({
      scenarioId: scenarioId ? idSchema.parse(scenarioId) : undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    }),
  });
});
