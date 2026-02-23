// Memory Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Save memory
export const save = mutation({
  args: {
    userId: v.optional(v.id("userProfiles")),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    context: v.optional(v.string()),
    importance: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("memories", {
      ...args,
      createdAt: now,
      accessCount: 0,
    });
    return await ctx.db.get(id);
  },
});

// Get memories by category
export const getByCategory = query({
  args: {
    userId: v.optional(v.id("userProfiles")),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("memories")
      .withIndex("by_user_category", (q) => 
        q.eq("userId", args.userId).eq("category", args.category)
      );
    return await query.collect();
  },
});

// Search memories
export const search = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Simple search - in production, use full-text search
    const memories = await ctx.db.query("memories").collect();
    const term = args.searchTerm.toLowerCase();
    return memories
      .filter(m => 
        m.key.toLowerCase().includes(term) || 
        m.value.toLowerCase().includes(term)
      )
      .slice(0, args.limit || 10);
  },
});

// Get all memories for a user
export const getAllForUser = query({
  args: { userId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Delete memory
export const remove = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});
