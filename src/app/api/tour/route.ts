import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { getTourState } from "@/server/services/tourService";
import { idSchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "model:read");
  const runId = new URL(req.url).searchParams.get("runId");
  return json(await getTourState(runId ? idSchema.parse(runId) : null));
});
