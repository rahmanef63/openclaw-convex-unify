// Heartbeat Tasks Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all enabled tasks
export const getEnabled = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

// Save task
export const save = mutation({
  args: {
    taskId: v.string(),
    description: v.string(),
    schedule: v.optional(v.string()),
    enabled: v.boolean(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    } else {
      const id = await ctx.db.insert("heartbeatTasks", {
        ...args,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.get(id);
    }
  },
});

// Mark task as run
export const markRun = mutation({
  args: {
    taskId: v.string(),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    
    if (task) {
      await ctx.db.patch(task._id, {
        lastRun: Date.now(),
        lastResult: args.result,
      });
    }
    return task;
  },
});

// Toggle task
export const toggle = mutation({
  args: {
    taskId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    
    if (task) {
      await ctx.db.patch(task._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      });
    }
    return task;
  },
});
