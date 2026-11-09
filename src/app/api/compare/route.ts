import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { compareRuns } from "@/server/services/comparisonService";
import { compareQuerySchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "run:read");
  const url = new URL(req.url);
  const q = compareQuerySchema.parse({ baseline: url.searchParams.get("baseline") ?? "", runs: url.searchParams.get("runs") ?? "" });
  return json(await compareRuns(q.baseline, q.runs));
});
