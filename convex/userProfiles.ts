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
    labels: v.optional(v.array(v.string())),
    profession: v.optional(v.string()),
    profileUrls: v.optional(v.array(v.object({
      type: v.string(),
      url: v.string(),
    }))),
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
        labels: args.labels,
        profession: args.profession,
        profileUrls: args.profileUrls,
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(id);
    }
    
    return user;
  },
});

// List users (admin helper)
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("userProfiles").order("desc").take(args.limit ?? 200);
  },
});

// Find users by name keyword (case-insensitive contains)
export const findByName = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = args.q.toLowerCase().trim();
    const all = await ctx.db.query("userProfiles").collect();
    return all
      .filter((u) => (u.name || "").toLowerCase().includes(q) || (u.nickname || "").toLowerCase().includes(q))
      .slice(0, args.limit ?? 50);
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
    labels: v.optional(v.array(v.string())),
    profession: v.optional(v.string()),
    profileUrls: v.optional(v.array(v.object({
      type: v.string(),
      url: v.string(),
    }))),
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


// Admin patch (allows phone/email normalization)
export const adminPatch = mutation({
  args: {
    id: v.id("userProfiles"),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    preferences: v.optional(v.any()),
    labels: v.optional(v.array(v.string())),
    profession: v.optional(v.string()),
    profileUrls: v.optional(v.array(v.object({
      type: v.string(),
      url: v.string(),
    }))),
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
