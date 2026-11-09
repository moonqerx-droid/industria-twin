import { isStationId } from "@/domain/model/demoData";
import { requireUser } from "@/server/auth/session";
import { handler, json, notFound } from "@/server/http";
import { getRunDetail, resolveRunId } from "@/server/services/simulationService";
import { idSchema } from "@/server/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Метрики одного участка в выбранном (или последнем базовом) прогоне. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireUser(req, "run:read");
  const stationId = idSchema.parse((await ctx.params).id);
  if (!isStationId(stationId)) throw notFound("Участок");
  const runParam = new URL(req.url).searchParams.get("runId");
  const runId = await resolveRunId(runParam ? idSchema.parse(runParam) : null);
  if (!runId) return json({ stationId, run: null, station: null });
  const run = await getRunDetail(runId);
  const station = run.stations.find((s) => s.stationId === stationId) ?? null;
  return json({
    stationId,
    run: { id: run.id, scenarioName: run.scenarioName, createdAt: run.createdAt, replications: run.replications },
    station,
    rank: run.ranking.find((r) => r.stationId === stationId) ?? null,
  });
});
