import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function now() {
  return Date.now();
}

async function getInstanceTenantId(ctx: any): Promise<string | null> {
  const config = await ctx.db.query("instanceConfig").first();
  return config?.tenantId ?? null;
}

function enforceTenant(argsTenantId: string, instanceTenantId: string | null) {
  // Development mode: allow all if instance tenant not configured
  if (!instanceTenantId) return;
  if (argsTenantId !== instanceTenantId) {
    throw new Error("FORBIDDEN: tenant mismatch");
  }
}

// Admin function to set instance tenant config
export const setInstanceConfig = mutation({
  args: { tenantId: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("instanceConfig").first();
    const ts = now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        tenantId: args.tenantId,
        notes: args.notes,
        updatedAt: ts,
      });
      return { ok: true, id: existing._id, updated: true };
    }
    
    const id = await ctx.db.insert("instanceConfig", {
      tenantId: args.tenantId,
      notes: args.notes,
      createdAt: ts,
      updatedAt: ts,
    });
    return { ok: true, id, updated: false };
  },
});

export const getInstanceConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("instanceConfig").first();
  },
});

export const createItem = mutation({
  args: {
    tenantId: v.string(),
    key: v.string(),
    value: v.string(),
    metadata: v.optional(v.any()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instanceTenantId = await getInstanceTenantId(ctx);
    enforceTenant(args.tenantId, instanceTenantId);

    const existing = await ctx.db
      .query("tenantCrudItems")
      .withIndex("by_tenant_key", (q) => q.eq("tenantId", args.tenantId).eq("key", args.key))
      .first();

    if (existing && !existing.deletedAt) {
      throw new Error("CONFLICT: key already exists in this tenant");
    }

    const ts = now();
    if (existing && existing.deletedAt) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        metadata: args.metadata,
        createdBy: args.createdBy,
        updatedAt: ts,
        deletedAt: undefined,
      });
      return { ok: true, id: existing._id, upserted: true };
    }

    const id = await ctx.db.insert("tenantCrudItems", {
      tenantId: args.tenantId,
      key: args.key,
      value: args.value,
      metadata: args.metadata,
      createdBy: args.createdBy,
      createdAt: ts,
      updatedAt: ts,
    });

    return { ok: true, id, upserted: false };
  },
});

export const getItem = query({
  args: { tenantId: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const instanceTenantId = await getInstanceTenantId(ctx);
    enforceTenant(args.tenantId, instanceTenantId);

    const row = await ctx.db
      .query("tenantCrudItems")
      .withIndex("by_tenant_key", (q) => q.eq("tenantId", args.tenantId).eq("key", args.key))
      .first();

    if (!row || row.deletedAt) return null;
    return row;
  },
});

export const listItems = query({
  args: { tenantId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const instanceTenantId = await getInstanceTenantId(ctx);
    enforceTenant(args.tenantId, instanceTenantId);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("tenantCrudItems")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    return rows.filter((r) => !r.deletedAt).slice(0, limit);
  },
});

export const updateItem = mutation({
  args: {
    tenantId: v.string(),
    key: v.string(),
    value: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const instanceTenantId = await getInstanceTenantId(ctx);
    enforceTenant(args.tenantId, instanceTenantId);

    const row = await ctx.db
      .query("tenantCrudItems")
      .withIndex("by_tenant_key", (q) => q.eq("tenantId", args.tenantId).eq("key", args.key))
      .first();

    if (!row || row.deletedAt) throw new Error("NOT_FOUND");

    await ctx.db.patch(row._id, {
      value: args.value ?? row.value,
      metadata: args.metadata ?? row.metadata,
      updatedAt: now(),
    });

    return { ok: true, id: row._id };
  },
});

export const deleteItem = mutation({
  args: { tenantId: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const instanceTenantId = await getInstanceTenantId(ctx);
    enforceTenant(args.tenantId, instanceTenantId);

    const row = await ctx.db
      .query("tenantCrudItems")
      .withIndex("by_tenant_key", (q) => q.eq("tenantId", args.tenantId).eq("key", args.key))
      .first();

    if (!row || row.deletedAt) return { ok: true, deleted: false };

    await ctx.db.patch(row._id, { deletedAt: now(), updatedAt: now() });
    return { ok: true, deleted: true };
  },
});
