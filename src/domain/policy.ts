export type Role = "finance_analyst" | "finance_approver" | "administrator" | "demo_guest";

export function can(role: Role, action: "create_order" | "ingest_payment" | "reconcile" | "approve" | "administer"): boolean {
  const grants: Record<typeof action, Role[]> = {
    create_order: ["finance_analyst", "finance_approver", "administrator", "demo_guest"],
    ingest_payment: ["finance_analyst", "finance_approver", "administrator", "demo_guest"],
    reconcile: ["finance_analyst", "finance_approver", "administrator", "demo_guest"],
    approve: ["finance_approver", "administrator"],
    administer: ["administrator"],
  };
  return grants[action].includes(role);
}

export function requirePermission(role: Role, action: Parameters<typeof can>[1]) {
  if (!can(role, action)) throw new AuthorizationError(`Role ${role} cannot perform ${action}`);
}

export class AuthorizationError extends Error {
  readonly status = 403;
}
