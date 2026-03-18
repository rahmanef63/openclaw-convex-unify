import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    userId: v.id("userProfiles"),
    channel: v.string(),
    externalUserId: v.string(),
    verified: v.optional(v.boolean()),
    confidence: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("userIdentities")
      .withIndex("by_channel_external", (q) =>
        q.eq("channel", args.channel).eq("externalUserId", args.externalUserId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        verified: args.verified,
        confidence: args.confidence,
        metadata: args.metadata,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("userIdentities", {
      userId: args.userId,
      channel: args.channel,
      externalUserId: args.externalUserId,
      verified: args.verified,
      confidence: args.confidence,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getByChannelExternal = query({
  args: { channel: v.string(), externalUserId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("userIdentities")
      .withIndex("by_channel_external", (q) =>
        q.eq("channel", args.channel).eq("externalUserId", args.externalUserId)
      )
      .first(),
});

export const mergeUsers = mutation({
  args: {
    fromUserId: v.id("userProfiles"),
    toUserId: v.id("userProfiles"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.fromUserId === args.toUserId) {
      return { ok: false, reason: "same_user" };
    }

    const dryRun = args.dryRun ?? true;
    const result: Record<string, number> = {
      userIdentities: 0,
      sessions: 0,
      agentSessions: 0,
      memories: 0,
      dailyNotes: 0,
      notifications: 0,
      userRoles: 0,
      permissionLogs: 0,
      vectorChunks: 0,
      workspaceFiles: 0,
      workspaceTrees: 0,
      agentsOwner: 0,
      deleteFromUser: 0,
    };

    const identities = await ctx.db
      .query("userIdentities")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.userIdentities = identities.length;
    if (!dryRun) {
      for (const row of identities) {
        await ctx.db.patch(row._id, { userId: args.toUserId, updatedAt: Date.now() });
      }
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.sessions = sessions.length;
    if (!dryRun) {
      for (const row of sessions) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const agentSessions = await ctx.db
      .query("agentSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.agentSessions = agentSessions.length;
    if (!dryRun) {
      for (const row of agentSessions) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.memories = memories.length;
    if (!dryRun) {
      for (const row of memories) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const dailyNotes = await ctx.db
      .query("dailyNotes")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.dailyNotes = dailyNotes.length;
    if (!dryRun) {
      for (const row of dailyNotes) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.notifications = notifications.length;
    if (!dryRun) {
      for (const row of notifications) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const userRoles = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.userRoles = userRoles.length;
    if (!dryRun) {
      for (const row of userRoles) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const logs = await ctx.db
      .query("permissionLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.fromUserId))
      .collect();
    result.permissionLogs = logs.length;
    if (!dryRun) {
      for (const row of logs) await ctx.db.patch(row._id, { userId: args.toUserId });
    }

    const chunks = await ctx.db
      .query("vectorChunks")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.fromUserId))
      .collect();
    result.vectorChunks = chunks.length;
    if (!dryRun) {
      for (const row of chunks) await ctx.db.patch(row._id, { ownerId: args.toUserId });
    }

    const files = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.fromUserId))
      .collect();
    result.workspaceFiles = files.length;
    if (!dryRun) {
      for (const row of files) await ctx.db.patch(row._id, { ownerId: args.toUserId });
    }

    const trees = await ctx.db
      .query("workspaceTrees")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.fromUserId))
      .collect();
    result.workspaceTrees = trees.length;
    if (!dryRun) {
      for (const row of trees) await ctx.db.patch(row._id, { ownerId: args.toUserId });
    }

    const ownedAgents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("owner", args.fromUserId))
      .collect();
    result.agentsOwner = ownedAgents.length;
    if (!dryRun) {
      for (const row of ownedAgents) await ctx.db.patch(row._id, { owner: args.toUserId });
    }

    if (!dryRun) {
      await ctx.db.delete(args.fromUserId);
      result.deleteFromUser = 1;
    }

    return { ok: true, dryRun, moved: result };
  },
});


export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) =>
    ctx.db.query("userIdentities").order("desc").take(args.limit ?? 300),
});
