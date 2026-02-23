// User Profile Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get user by phone
export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

// Get or create user
export const getOrCreate = mutation({
  args: {
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user = null;
    
    if (args.phone) {
      user = await ctx.db
        .query("userProfiles")
        .withIndex("by_phone", (q) => q.eq("phone", args.phone))
        .first();
    }
    
    if (!user && args.email) {
      user = await ctx.db
        .query("userProfiles")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
    }
    
    if (!user) {
      const now = Date.now();
      const id = await ctx.db.insert("userProfiles", {
        phone: args.phone,
        email: args.email,
        name: args.name,
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(id);
    }
    
    return user;
  },
});

// Update user
export const update = mutation({
  args: {
    id: v.id("userProfiles"),
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    preferences: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});
