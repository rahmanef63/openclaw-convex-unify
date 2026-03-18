import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DENY_PREFIX = "tidak berizin, silahkan kontak rahman dan katakan bahwa";

export const grant = mutation({
  args: {
    parentAgentId: v.string(),
    childAgentId: v.string(),
    relationType: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
    allowedTools: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agentDelegations")
      .withIndex("by_pair", (q) => q.eq("parentAgentId", args.parentAgentId).eq("childAgentId", args.childAgentId))
      .first();

    const payload = {
      relationType: args.relationType ?? "delegate",
      allowedSkills: args.allowedSkills,
      allowedTools: args.allowedTools,
      notes: args.notes,
      status: "active",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("agentDelegations", {
      parentAgentId: args.parentAgentId,
      childAgentId: args.childAgentId,
      ...payload,
      createdAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const revoke = mutation({
  args: { parentAgentId: v.string(), childAgentId: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentDelegations")
      .withIndex("by_pair", (q) => q.eq("parentAgentId", args.parentAgentId).eq("childAgentId", args.childAgentId))
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { status: "disabled", notes: args.notes, updatedAt: Date.now() });
    return await ctx.db.get(existing._id);
  },
});

export const listByParent = query({
  args: { parentAgentId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("agentDelegations")
      .withIndex("by_parent", (q) => q.eq("parentAgentId", args.parentAgentId))
      .collect(),
});

export const authorize = query({
  args: {
    parentAgentId: v.string(),
    childAgentId: v.string(),
    skill: v.optional(v.string()),
    tool: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentDelegations")
      .withIndex("by_pair", (q) => q.eq("parentAgentId", args.parentAgentId).eq("childAgentId", args.childAgentId))
      .first();

    if (!row || row.status !== "active") {
      return {
        allowed: false,
        message: `${DENY_PREFIX} akses delegasi ${args.parentAgentId} -> ${args.childAgentId} belum diaktifkan.`,
      };
    }

    if (args.skill && row.allowedSkills && row.allowedSkills.length > 0 && !row.allowedSkills.includes(args.skill)) {
      return {
        allowed: false,
        message: `${DENY_PREFIX} skill '${args.skill}' belum diizinkan untuk delegasi ${args.parentAgentId} -> ${args.childAgentId}.`,
      };
    }

    if (args.tool && row.allowedTools && row.allowedTools.length > 0 && !row.allowedTools.includes(args.tool)) {
      return {
        allowed: false,
        message: `${DENY_PREFIX} tool '${args.tool}' belum diizinkan untuk delegasi ${args.parentAgentId} -> ${args.childAgentId}.`,
      };
    }

    return { allowed: true, message: "ok", delegation: row };
  },
});
