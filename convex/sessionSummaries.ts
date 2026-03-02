import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    sessionId: v.id("sessions"),
    agentId: v.optional(v.string()),
    summary: v.string(),
    intent: v.optional(v.string()),
    decisions: v.optional(v.array(v.string())),
    constraints: v.optional(v.array(v.string())),
    entities: v.optional(v.array(v.string())),
    pendingActions: v.optional(v.array(v.string())),
    keyFacts: v.optional(v.array(v.string())),
    openTodos: v.optional(v.array(v.string())),
    lastResolvedAt: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    firstMessageAt: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    sourceMessageRange: v.optional(v.object({
      from: v.optional(v.number()),
      to: v.optional(v.number()),
    })),
    checksum: v.optional(v.string()),
    summaryVersion: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sessionSummaries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    const payload = {
      agentId: args.agentId,
      summary: args.summary,
      intent: args.intent,
      decisions: args.decisions,
      constraints: args.constraints,
      entities: args.entities,
      pendingActions: args.pendingActions,
      keyFacts: args.keyFacts,
      openTodos: args.openTodos,
      lastResolvedAt: args.lastResolvedAt,
      messageCount: args.messageCount,
      firstMessageAt: args.firstMessageAt,
      lastMessageAt: args.lastMessageAt,
      sourceMessageRange: args.sourceMessageRange,
      checksum: args.checksum,
      summaryVersion: args.summaryVersion,
      source: args.source,
      updatedAt: now,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("sessionSummaries", {
      sessionId: args.sessionId,
      ...payload,
      createdAt: now,
    });
  },
});

export const getBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) =>
    ctx.db
      .query("sessionSummaries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first(),
});

export const getBySessionKey = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (!session) return null;

    return await ctx.db
      .query("sessionSummaries")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .first();
  },
});


export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("sessionSummaries").order("desc").take(args.limit ?? 100);
  },
});
