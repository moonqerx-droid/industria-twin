import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { getProductionModel } from "@/server/services/modelService";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "model:read");
  return json(await getProductionModel());
});
