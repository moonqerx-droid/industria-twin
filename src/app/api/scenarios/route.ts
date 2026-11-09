import { requireUser } from "@/server/auth/session";
import { handler, json, parseJson } from "@/server/http";
import { createScenario, listScenarios } from "@/server/services/scenarioService";
import { scenarioCreateSchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "scenario:read");
  return json({ scenarios: await listScenarios() });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser(req, "scenario:write");
  const input = await parseJson(req, scenarioCreateSchema);
  return json({ scenario: await createScenario(input, user.id) }, { status: 201 });
});
