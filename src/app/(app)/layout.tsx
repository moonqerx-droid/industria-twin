import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/auth/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role, roleLabel: ROLE_LABELS[user.role] }}>
      {children}
    </AppShell>
  );
}
