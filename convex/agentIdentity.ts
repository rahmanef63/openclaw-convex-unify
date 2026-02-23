// Agent Identity Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Save agent identity (SOUL.md, IDENTITY.md)
export const save = mutation({
  args: {
    agentId: v.string(),
    name: v.optional(v.string()),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatar: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    identityContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentIdentity")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        version: existing.version + 1,
        updatedAt: Date.now(),
      });
      return await ctx.db.get(existing._id);
    } else {
      const id = await ctx.db.insert("agentIdentity", {
        ...args,
        version: 1,
        updatedAt: Date.now(),
      });
      return await ctx.db.get(id);
    }
  },
});

// Get agent identity
export const get = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentIdentity")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});
