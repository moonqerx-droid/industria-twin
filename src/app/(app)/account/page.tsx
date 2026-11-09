import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Учётная запись" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <>
      <PageHeader title="Учётная запись" description="Данные входа и смена пароля." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="Профиль">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Логин</dt>
            <dd>{user.login}</dd>
            <dt className="text-muted">Псевдоним</dt>
            <dd>{user.displayName}</dd>
            <dt className="text-muted">Роль</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
          </dl>
          <p className="mt-4 text-xs text-faint">
            Система хранит только логин, псевдоним и хеш пароля. Изменить псевдоним, роль или удалить учётную запись может администратор.
          </p>
        </Panel>
        <Panel title="Смена пароля">
          <PasswordForm />
        </Panel>
      </div>
    </>
  );
}
