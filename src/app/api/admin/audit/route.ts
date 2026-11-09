import { requireUser } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { listAudit } from "@/server/services/auditService";
import { auditQuerySchema } from "@/server/validation/schemas";

export const GET = handler(async (req: Request) => {
  await requireUser(req, "audit:read");
  const url = new URL(req.url);
  const q = auditQuerySchema.parse({ limit: url.searchParams.get("limit") ?? undefined, action: url.searchParams.get("action") ?? undefined });
  return json({ entries: await listAudit(q) });
});
