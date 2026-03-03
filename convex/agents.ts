// Agent Management Functions

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant } from "./tenantGuard";

const LEGACY_DISABLED = "LEGACY_PATH_DISABLED: use scoped API with tenantId";
const legacyDisabled = (path: string): never => {
  throw new Error(`${LEGACY_DISABLED} (${path})`);
};

// ============================================
// AGENT MANAGEMENT
// ============================================

// Register or update an agent
export const registerAgent = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    model: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    config: v.optional(v.any()),
    owner: v.optional(v.id("userProfiles")),
    status: v.optional(v.string()),
    isActive: v.optional(v.string()),
    soulMd: v.optional(v.string()),
    identityMd: v.optional(v.string()),
    agentsMd: v.optional(v.string()),
    toolsMd: v.optional(v.string()),
    userMd: v.optional(v.string()),
    heartbeatMd: v.optional(v.string()),
    bootstrapMd: v.optional(v.string()),
    memoryMd: v.optional(v.string()),
  },
  handler: async () => {
    legacyDisabled("agents.registerAgent");
  },
});

// Get agent by ID
export const getAgent = query({
  args: { agentId: v.string() },
  handler: async () => {
    legacyDisabled("agents.getAgent");
  },
});

// Get all agents
export const getAllAgents = query({
  args: {
    status: v.optional(v.string()),
    owner: v.optional(v.id("userProfiles")),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.getAllAgents");
    let query = ctx.db.query("agents");
    
    if (args.owner) {
      query = query.withIndex("by_owner", (q) => q.eq("owner", args.owner!));
    } else if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status!));
    }

    if (args.status && args.owner) {
      query = query.filter((q) => q.eq(q.field("status"), args.status!));
    }

    return await query.collect();
  },
});

// Update agent status
export const updateStatus = mutation({
  args: {
    agentId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.updateStatus");
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    
    if (agent) {
      await ctx.db.patch(agent._id, {
        status: args.status,
        updatedAt: Date.now(),
      });
      return await ctx.db.get(agent._id);
    }
    
    return agent;
  },
});

// ============================================
// AGENT SESSION TRACKING
// ============================================

// Start agent session
export const startSession = mutation({
  args: {
    sessionId: v.string(),
    agentId: v.string(),
    userId: v.optional(v.id("userProfiles")),
    channel: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.startSession");
    const now = Date.now();
    
    // Check if session already exists
    const existing = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    
    if (existing) {
      // Reactivate if ended
      if (existing.status === "ended") {
        await ctx.db.patch(existing._id, {
          status: "active",
          startedAt: now,
          endedAt: undefined,
          messageCount: 0,
        });
        return await ctx.db.get(existing._id);
      }
      return existing;
    }
    
    const id = await ctx.db.insert("agentSessions", {
      ...args,
      status: "active",
      startedAt: now,
      messageCount: 0,
    });
    
    return await ctx.db.get(id);
  },
});

// End agent session
export const endSession = mutation({
  args: {
    sessionId: v.string(),
    tokenUsage: v.optional(v.object({
      input: v.number(),
      output: v.number(),
      total: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.endSession");
    const session = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, {
        status: "ended",
        endedAt: Date.now(),
        tokenUsage: args.tokenUsage,
      });
      return await ctx.db.get(session._id);
    }
    
    return session;
  },
});

// Update session message count
export const incrementMessageCount = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    legacyDisabled("agents.incrementMessageCount");
    const session = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    
    if (session) {
      await ctx.db.patch(session._id, {
        messageCount: (session.messageCount || 0) + 1,
      });
      return await ctx.db.get(session._id);
    }
    
    return session;
  },
});

// Get active sessions
export const getActiveSessions = query({
  args: {
    agentId: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.getActiveSessions");
    let query = ctx.db
      .query("agentSessions")
      .withIndex("by_status", (q) => q.eq("status", "active"));
    
    const sessions = await query.collect();
    
    // Filter by agentId or userId if provided
    return sessions.filter(s => {
      if (args.agentId && s.agentId !== args.agentId) return false;
      if (args.userId && s.userId !== args.userId) return false;
      return true;
    });
  },
});

// Get session history
export const getSessionHistory = query({
  args: {
    agentId: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    legacyDisabled("agents.getSessionHistory");
    let query = ctx.db.query("agentSessions");
    
    if (args.agentId) {
      query = query.withIndex("by_agent", (q) => q.eq("agentId", args.agentId!));
    } else if (args.userId) {
      query = query.withIndex("by_user", (q) => q.eq("userId", args.userId!));
    }

    if (args.agentId && args.userId) {
      query = query.filter((q) => q.eq(q.field("userId"), args.userId!));
    }
    
    return await query
      .order("desc")
      .take(args.limit || 50);
  },
});

// ============================================
// STATISTICS
// ============================================

// Get agent statistics
export const getAgentStats = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("agentSessions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => s.status === "active").length;
    const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
    const totalTokens = sessions.reduce((sum, s) => {
      if (s.tokenUsage) {
        return sum + s.tokenUsage.total;
      }
      return sum;
    }, 0);
    
    return {
      totalSessions,
      activeSessions,
      totalMessages,
      totalTokens,
    };
  },
});

// Tenant-guarded agent registration (recommended path)
export const registerAgentScoped = mutation({
  args: {
    tenantId: v.string(),
    agentId: v.string(),
    name: v.string(),
    type: v.optional(v.string()),
    model: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    config: v.optional(v.any()),
    owner: v.optional(v.id("userProfiles")),
    status: v.optional(v.string()),
    isActive: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenantId = await requireTenant(ctx, args.tenantId);
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, tenantId, updatedAt: now, lastActiveAt: now });
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("agents", {
      ...args,
      tenantId,
      type: args.type || "main",
      status: args.status || "active",
      isActive: args.isActive || "active",
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return await ctx.db.get(id);
  },
});
