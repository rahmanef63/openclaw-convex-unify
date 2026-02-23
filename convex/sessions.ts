// Session & Message Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// SESSION MANAGEMENT
// ============================================

// Create or get session
export const create = mutation({
  args: {
    sessionKey: v.string(),
    channel: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
    model: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check if session exists
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    
    if (existing) {
      // Update last active and return
      await ctx.db.patch(existing._id, {
        lastActiveAt: Date.now(),
        status: "active",
      });
      return existing;
    }
    
    const now = Date.now();
    const id = await ctx.db.insert("sessions", {
      ...args,
      status: "active",
      createdAt: now,
      lastActiveAt: now,
    });
    return await ctx.db.get(id);
  },
});

// Get session by key
export const getByKey = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
  },
});

// Get sessions by user
export const getByUser = query({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .order("desc")
      .take(50);
  },
});

// Get active sessions by channel
export const getActiveByChannel = query({
  args: { channel: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// Update last active (touch)
export const touch = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, {
        lastActiveAt: Date.now(),
      });
    }
    return session;
  },
});

// Update session status
export const updateStatus = mutation({
  args: {
    sessionKey: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, { status: args.status });
    }
    return session;
  },
});

// End session
export const end = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, { status: "ended" });
    }
    return session;
  },
});

// ============================================
// MESSAGE LOGGING
// ============================================

// Log a message
export const logMessage = mutation({
  args: {
    sessionId: v.string(),
    role: v.string(), // user, assistant, system
    content: v.string(),
    messageId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
      messageId: args.messageId,
      metadata: args.metadata,
    });
    
    // Touch the session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionId))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, { lastActiveAt: Date.now() });
    }
    
    return await ctx.db.get(id);
  },
});

// Get messages for a session
export const getMessages = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId));
    
    if (args.before) {
      query = query.filter((q) => q.lt(q.field("timestamp"), args.before!));
    }
    
    return await query
      .order("desc")
      .take(args.limit || 50);
  },
});

// Get recent messages (for context)
export const getRecentMessages = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit || 20);
  },
});

// Count messages in session
export const countMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return messages.length;
  },
});

// ============================================
// SESSION STATISTICS
// ============================================

// Get session stats
export const getStats = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    
    if (!session) return null;
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionKey))
      .collect();
    
    const userMessages = messages.filter(m => m.role === "user").length;
    const assistantMessages = messages.filter(m => m.role === "assistant").length;
    
    return {
      session,
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      duration: session.lastActiveAt - session.createdAt,
    };
  },
});

// Get all session stats (admin)
export const getAllStats = query({
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    
    const stats = [];
    for (const session of sessions) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_session", (q) => q.eq("sessionId", session.sessionKey))
        .collect();
      
      stats.push({
        sessionKey: session.sessionKey,
        channel: session.channel,
        status: session.status,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        messageCount: messages.length,
      });
    }
    
    return stats;
  },
});

// ============================================
// BATCH LOGGING (for syncing existing messages)
// ============================================

// Batch log messages
export const batchLogMessages = mutation({
  args: {
    sessionId: v.string(),
    messages: v.array(v.object({
      role: v.string(),
      content: v.string(),
      timestamp: v.number(),
      messageId: v.optional(v.string()),
      metadata: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    let count = 0;
    
    for (const msg of args.messages) {
      await ctx.db.insert("messages", {
        sessionId: args.sessionId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        messageId: msg.messageId,
        metadata: msg.metadata,
      });
      count++;
    }
    
    return { logged: count };
  },
});
