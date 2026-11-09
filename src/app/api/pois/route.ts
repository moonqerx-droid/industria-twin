import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { listPois } from "@/server/services/tourService";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "model:read");
  return json({ pois: await listPois() });
});
