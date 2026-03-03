/**
 * memories.ts — Long-term agent memory
 *
 * FK: userId → userProfiles._id (optional)
 * Ref: agentId → agents.agentId (string)
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant } from "./tenantGuard";

/** Simpan memory baru. */
export const save = mutation({
  args: {
    agentId:    v.optional(v.string()),
    userId:     v.optional(v.id("userProfiles")),
    category:   v.string(),  // preference|fact|event|decision|lesson
    key:        v.string(),
    value:      v.string(),
    context:    v.optional(v.string()),
    importance: v.optional(v.number()),  // 1–10
    source:     v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("memories", {
      ...args,
      createdAt:   now,
      accessCount: 0,
    });
    return ctx.db.get(id);
  },
});

/** Upsert memory (by agentId + key) — tidak duplikat. */
export const upsert = mutation({
  args: {
    agentId:    v.optional(v.string()),
    userId:     v.optional(v.id("userProfiles")),
    category:   v.string(),
    key:        v.string(),
    value:      v.string(),
    context:    v.optional(v.string()),
    importance: v.optional(v.number()),
    source:     v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Cari existing by key (dan agentId jika ada)
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .filter((q) =>
        args.agentId
          ? q.eq(q.field("agentId"), args.agentId)
          : q.eq(q.field("agentId"), undefined)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value:          args.value,
        context:        args.context,
        importance:     args.importance,
        lastAccessedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("memories", {
      ...args,
      createdAt:   now,
      accessCount: 0,
    });
  },
});

/** Ambil memories by category (per agent atau per user). */
export const getByCategory = query({
  args: {
    agentId:  v.optional(v.string()),
    userId:   v.optional(v.id("userProfiles")),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.agentId) {
      return ctx.db
        .query("memories")
        .withIndex("by_agent_category", (q) =>
          q.eq("agentId", args.agentId).eq("category", args.category)
        )
        .collect();
    }
    return ctx.db
      .query("memories")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", args.userId).eq("category", args.category)
      )
      .collect();
  },
});

/** Ambil semua memories untuk satu agent. */
export const getByAgent = query({
  args: {
    agentId: v.string(),
    limit:   v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("memories")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 100),
});

/** Ambil semua memories untuk satu user. */
export const getAllForUser = query({
  args: { userId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, args) =>
    ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect(),
});

/** Simple search by key atau value. */
export const search = query({
  args: {
    searchTerm: v.string(),
    agentId:    v.optional(v.string()),
    limit:      v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = args.agentId
      ? await ctx.db
          .query("memories")
          .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
          .collect()
      : await ctx.db.query("memories").collect();

    const term = args.searchTerm.toLowerCase();
    return all
      .filter(
        (m) =>
          m.key.toLowerCase().includes(term) ||
          m.value.toLowerCase().includes(term)
      )
      .slice(0, args.limit ?? 10);
  },
});

/** Update lastAccessedAt saat memory dibaca. */
export const touch = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    const mem = await ctx.db.get(args.id);
    if (!mem) return;
    await ctx.db.patch(args.id, {
      lastAccessedAt: Date.now(),
      accessCount:    (mem.accessCount ?? 0) + 1,
    });
  },
});

/** Hapus memory. */
export const remove = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});

// Tenant-guarded memory save (recommended path)
export const saveScoped = mutation({
  args: {
    tenantId: v.string(),
    agentId: v.string(),
    userId: v.optional(v.id("userProfiles")),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    context: v.optional(v.string()),
    importance: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenantId = await requireTenant(ctx, args.tenantId);
    const now = Date.now();
    const id = await ctx.db.insert("memories", {
      ...args,
      tenantId,
      createdAt: now,
      accessCount: 0,
    });
    return await ctx.db.get(id);
  },
});

export const getByAgentScoped = query({
  args: {
    tenantId: v.string(),
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireTenant(ctx, args.tenantId);
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 100);
    return rows.filter((r) => r.tenantId === args.tenantId);
  },
});
