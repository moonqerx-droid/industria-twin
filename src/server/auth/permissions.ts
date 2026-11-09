import type { RoleId } from "./token";

/** Матрица прав: чтение доступно всем ролям, изменение — по таблице. */
export const PERMISSIONS = {
  "model:read": ["admin", "engineer", "viewer"],
  "scenario:read": ["admin", "engineer", "viewer"],
  "scenario:write": ["admin", "engineer"],
  "scenario:delete": ["admin", "engineer"],
  "simulation:run": ["admin", "engineer"],
  "run:read": ["admin", "engineer", "viewer"],
  "run:delete": ["admin"],
  "users:read": ["admin"],
  "users:write": ["admin"],
  "audit:read": ["admin"],
} as const satisfies Record<string, readonly RoleId[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: RoleId, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly RoleId[]).includes(role);
}

export const ROLE_LABELS: Record<RoleId, string> = {
  admin: "Администратор",
  engineer: "Инженер-технолог",
  viewer: "Наблюдатель",
};
