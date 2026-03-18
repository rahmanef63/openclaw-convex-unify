import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

export async function getCallerTenantId(ctx: AnyCtx): Promise<string | null> {
  // Deployment-scoped tenant context (self-hosted workaround until full auth context)
  const cfg = await (ctx as any).db.query("instanceConfig").first();
  return cfg?.tenantId ?? null;
}

export function assertTenant(argsTenantId: string, callerTenantId: string | null): void {
  if (!callerTenantId) return; // development mode
  if (argsTenantId !== callerTenantId) {
    throw new Error("FORBIDDEN: tenant mismatch");
  }
}

export async function requireTenant(ctx: AnyCtx, argsTenantId: string): Promise<string> {
  const caller = await getCallerTenantId(ctx);
  assertTenant(argsTenantId, caller);
  return caller ?? argsTenantId;
}
