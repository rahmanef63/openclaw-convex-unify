/**
 * heartbeatTasks.ts — Periodic task management
 * Ref: agentId → agents.agentId (string)
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Ambil semua task yang enabled (untuk satu agent atau semua). */
export const getEnabled = query({
  args: { agentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.agentId) {
      return ctx.db
        .query("heartbeatTasks")
        .withIndex("by_agent_enabled", (q) =>
          q.eq("agentId", args.agentId).eq("enabled", true)
        )
        .collect();
    }
    return ctx.db
      .query("heartbeatTasks")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

/** Semua tasks untuk satu agent. */
export const getByAgent = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("heartbeatTasks")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect(),
});

/** Upsert task (by taskId). */
export const save = mutation({
  args: {
    taskId:      v.string(),
    agentId:     v.optional(v.string()),
    description: v.string(),
    schedule:    v.optional(v.string()),
    enabled:     v.boolean(),
    config:      v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("heartbeatTasks", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.get(id);
  },
});

/** Catat hasil run task. */
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
        lastRun:    Date.now(),
        lastResult: args.result,
        updatedAt:  Date.now(),
      });
    }
    return task;
  },
});

/** Enable / disable task. */
export const toggle = mutation({
  args: {
    taskId:  v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("heartbeatTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    if (task) {
      await ctx.db.patch(task._id, {
        enabled:   args.enabled,
        updatedAt: Date.now(),
      });
    }
    return task;
  },
});
