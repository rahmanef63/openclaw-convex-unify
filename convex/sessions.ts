/**
 * sessions.ts — Session & Message CRUD
 *
 * sessions  : metadata percakapan (siapa, channel, status, counter)
 * messages  : isi setiap pesan dalam sebuah session
 *             FK: messages.sessionId → sessions._id  (proper Convex FK)
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant } from "./tenantGuard";

const LEGACY_DISABLED = "LEGACY_PATH_DISABLED: use scoped API with tenantId";

function legacyDisabled(path: string): never {
  throw new Error(`${LEGACY_DISABLED} (${path})`);
}

function hashEmbedding(text: string, dims = 128): number[] {
  const vec = new Array(dims).fill(0) as number[];
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    const idx = Math.abs(h) % dims;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

// ─────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────

/** Buat atau update session (upsert by sessionKey). */
export const upsert = mutation({
  args: {
    sessionKey: v.string(),
    agentId:    v.optional(v.string()),
    userId:     v.optional(v.id("userProfiles")),
    channel:    v.optional(v.string()),
    model:      v.optional(v.string()),
    metadata:   v.optional(v.any()),
  },
  handler: async (_ctx, _args) => {
    legacyDisabled("sessions.upsert");
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveAt: now,
        status:       "active",
        ...(args.agentId !== undefined && { agentId: args.agentId }),
        ...(args.userId  !== undefined && { userId:  args.userId }),
        ...(args.channel !== undefined && { channel: args.channel }),
        ...(args.model   !== undefined && { model:   args.model }),
        ...(args.metadata !== undefined && { metadata: args.metadata }),
      });
      return existing._id;
    }

    return await ctx.db.insert("sessions", {
      sessionKey:   args.sessionKey,
      agentId:      args.agentId,
      userId:       args.userId,
      channel:      args.channel,
      model:        args.model,
      status:       "active",
      messageCount: 0,
      createdAt:    now,
      lastActiveAt: now,
      metadata:     args.metadata,
    });
  },
});

/** Alias lama untuk backward compat. */
export const create = mutation({
  args: {
    sessionKey: v.string(),
    channel:    v.optional(v.string()),
    userId:     v.optional(v.id("userProfiles")),
    agentId:    v.optional(v.string()),
    model:      v.optional(v.string()),
    metadata:   v.optional(v.any()),
  },
  handler: async (_ctx, _args) => {
    legacyDisabled("sessions.create");
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastActiveAt: now, status: "active" });
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("sessions", {
      sessionKey:   args.sessionKey,
      agentId:      args.agentId,
      userId:       args.userId,
      channel:      args.channel,
      model:        args.model,
      status:       "active",
      messageCount: 0,
      createdAt:    now,
      lastActiveAt: now,
      metadata:     args.metadata,
    });
    return await ctx.db.get(id);
  },
});

/** Ambil session berdasarkan sessionKey. */
export const getByKey = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first(),
});

/** Ambil session berdasarkan Convex _id. */
export const getById = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

/** Ambil semua session milik satu agent. */
export const getByAgent = query({
  args: {
    agentId: v.string(),
    limit:   v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("sessions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50),
});

/** Ambil semua session milik satu user. */
export const getByUser = query({
  args: { userId: v.id("userProfiles") },
  handler: async (ctx, args) =>
    ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50),
});

/** Update lastActiveAt. */
export const touch = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.getByKey");
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (s) await ctx.db.patch(s._id, { lastActiveAt: Date.now() });
  },
});

/** Tutup session. */
export const end = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.end");
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (s) await ctx.db.patch(s._id, { status: "ended", lastActiveAt: Date.now() });
  },
});

/** Stats semua session (untuk dashboard). */
export const getAllStats = query({
  args: {},
  handler: async (ctx) => {
    legacyDisabled("sessions.getAllStats");
    const sessions = await ctx.db.query("sessions").collect();
    return sessions.map((s) => ({
      sessionKey:   s.sessionKey,
      agentId:      s.agentId,
      channel:      s.channel,
      status:       s.status,
      messageCount: s.messageCount,
      createdAt:    s.createdAt,
      lastActiveAt: s.lastActiveAt,
    }));
  },
});

// Tenant-guarded session upsert (recommended path)
export const upsertScoped = mutation({
  args: {
    tenantId: v.string(),
    sessionKey: v.string(),
    agentId: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
    channel: v.optional(v.string()),
    model: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await requireTenant(ctx, args.tenantId);
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tenantId,
        lastActiveAt: now,
        status: "active",
        ...(args.agentId !== undefined && { agentId: args.agentId }),
        ...(args.userId !== undefined && { userId: args.userId }),
        ...(args.channel !== undefined && { channel: args.channel }),
        ...(args.model !== undefined && { model: args.model }),
        ...(args.metadata !== undefined && { metadata: args.metadata }),
      });
      return existing._id;
    }

    return await ctx.db.insert("sessions", {
      tenantId,
      sessionKey: args.sessionKey,
      agentId: args.agentId,
      userId: args.userId,
      channel: args.channel,
      model: args.model,
      status: "active",
      messageCount: 0,
      createdAt: now,
      lastActiveAt: now,
      metadata: args.metadata,
    });
  },
});

// ─────────────────────────────────────────────────────────
// MESSAGES  (FK: sessionId → sessions._id)
// ─────────────────────────────────────────────────────────

/** Tambah satu pesan ke session. */
export const logMessage = mutation({
  args: {
    sessionId:  v.id("sessions"),   // FK (proper Convex ID)
    agentId:    v.optional(v.string()),
    role:       v.string(),          // user | assistant | system | tool
    content:    v.string(),
    externalId: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    metadata:   v.optional(v.any()),
  },
  handler: async (_ctx, _args) => {
    legacyDisabled("sessions.logMessage");
    const now = Date.now();
    const id = await ctx.db.insert("messages", {
      sessionId:  args.sessionId,
      agentId:    args.agentId,
      role:       args.role,
      content:    args.content,
      timestamp:  now,
      externalId: args.externalId,
      tokenCount: args.tokenCount,
      metadata:   args.metadata,
    });

    // FINAL STAGE #2: auto-ingest vector in real-time (hash embedding fallback)
    try {
      await ctx.db.insert("vectorChunks", {
        kind: "session_message",
        sourceId: args.externalId ?? `msg:${id}`,
        sessionId: args.sessionId,
        agentId: args.agentId,
        text: args.content.slice(0, 1200),
        embedding: hashEmbedding(args.content),
        dimensions: 128,
        metadata: {
          role: args.role,
          timestamp: now,
          messageId: id,
          externalId: args.externalId,
        },
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // do not fail message logging if vector insert fails
    }

    // update counter di sessions
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        messageCount: (session.messageCount ?? 0) + 1,
        lastActiveAt: now,
      });
    }
    return id;
  },
});

/** Tambah banyak pesan sekaligus (bulk import dari JSONL). */
export const batchLogMessages = mutation({
  args: {
    sessionId: v.id("sessions"),   // FK
    agentId:   v.optional(v.string()),
    messages:  v.array(v.object({
      role:       v.string(),
      content:    v.string(),
      timestamp:  v.number(),
      externalId: v.optional(v.string()),
      tokenCount: v.optional(v.number()),
      metadata:   v.optional(v.any()),
    })),
  },
  handler: async (_ctx, _args) => {
    legacyDisabled("sessions.batchLogMessages");
    let count = 0;
    for (const msg of args.messages) {
      const mid = await ctx.db.insert("messages", {
        sessionId:  args.sessionId,
        agentId:    args.agentId,
        role:       msg.role,
        content:    msg.content,
        timestamp:  msg.timestamp,
        externalId: msg.externalId,
        tokenCount: msg.tokenCount,
        metadata:   msg.metadata,
      });

      // auto-ingest vector per message
      try {
        await ctx.db.insert("vectorChunks", {
          kind: "session_message",
          sourceId: msg.externalId ?? `msg:${mid}`,
          sessionId: args.sessionId,
          agentId: args.agentId,
          text: msg.content.slice(0, 1200),
          embedding: hashEmbedding(msg.content),
          dimensions: 128,
          metadata: {
            role: msg.role,
            timestamp: msg.timestamp,
            messageId: mid,
            externalId: msg.externalId,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch {
        // ignore vector failures in batch ingest
      }
      count++;
    }
    // update counter
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        messageCount: (session.messageCount ?? 0) + count,
        lastActiveAt: Date.now(),
      });
    }
    return { inserted: count };
  },
});

/** Ambil pesan dari sebuah session (descending time, paginated). */
export const getMessages = query({
  args: {
    sessionId: v.id("sessions"),  // FK
    limit:     v.optional(v.number()),
    before:    v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.getMessages");
    let q = ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId));
    if (args.before) {
      q = q.filter((q) => q.lt(q.field("timestamp"), args.before!));
    }
    return q.order("desc").take(args.limit ?? 50);
  },
});

/** Ambil pesan terbaru dari sebuah session. */
export const getRecentMessages = query({
  args: {
    sessionId: v.id("sessions"),  // FK
    limit:     v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit ?? 20),
});

/** Hitung pesan dalam sebuah session. */
export const countMessages = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.getRecentMessages");
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return msgs.length;
  },
});

/** Cek apakah pesan sudah ada (by externalId) — untuk avoid duplikat saat sync. */
export const existsByExternalId = query({
  args: {
    sessionId:  v.id("sessions"),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.existsByExternalId");
    const msg = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("externalId"), args.externalId))
      .first();
    return msg !== null;
  },
});

/** Stats untuk dashboard — semua sessions summary. */
export const getStats = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.getStats");
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (!session) return null;
    return {
      sessionKey:   session.sessionKey,
      agentId:      session.agentId,
      channel:      session.channel,
      status:       session.status,
      messageCount: session.messageCount,
      createdAt:    session.createdAt,
      lastActiveAt: session.lastActiveAt,
    };
  },
});

// ─────────────────────────────────────────────────────────
// AGENT SESSIONS  (detailed tracking)
// ─────────────────────────────────────────────────────────

/** Upsert agent session by external sessionId. */
export const upsertAgentSession = mutation({
  args: {
    sessionId:       v.string(),   // external UUID
    convexSessionId: v.optional(v.id("sessions")),  // FK
    agentId:         v.string(),
    userId:          v.optional(v.id("userProfiles")),
    channel:         v.optional(v.string()),
    model:           v.optional(v.string()),
    status:          v.optional(v.string()),
    messageCount:    v.optional(v.number()),
    metadata:        v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    legacyDisabled("sessions.upsertAgentSession");
    const now = Date.now();
    const existing = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.status       && { status:          args.status }),
        ...(args.messageCount && { messageCount:    args.messageCount }),
        ...(args.convexSessionId && { convexSessionId: args.convexSessionId }),
        ...(args.metadata     && { metadata:        args.metadata }),
      });
      return existing._id;
    }

    return await ctx.db.insert("agentSessions", {
      sessionId:       args.sessionId,
      convexSessionId: args.convexSessionId,
      agentId:         args.agentId,
      userId:          args.userId,
      channel:         args.channel,
      model:           args.model,
      status:          args.status ?? "active",
      startedAt:       now,
      messageCount:    args.messageCount ?? 0,
      metadata:        args.metadata,
    });
  },
});

// Tenant-guarded message logging (recommended path)
export const logMessageScoped = mutation({
  args: {
    tenantId: v.string(),
    sessionId: v.id("sessions"),
    agentId: v.optional(v.string()),
    role: v.string(),
    content: v.string(),
    externalId: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await requireTenant(ctx, args.tenantId);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("NOT_FOUND: session");
    if (session.tenantId && session.tenantId !== tenantId) {
      throw new Error("FORBIDDEN: session tenant mismatch");
    }

    const now = Date.now();
    const id = await ctx.db.insert("messages", {
      tenantId,
      sessionId: args.sessionId,
      agentId: args.agentId,
      role: args.role,
      content: args.content,
      timestamp: now,
      externalId: args.externalId,
      tokenCount: args.tokenCount,
      metadata: args.metadata,
    });

    await ctx.db.patch(args.sessionId, {
      tenantId,
      messageCount: (session.messageCount ?? 0) + 1,
      lastActiveAt: now,
    });

    return id;
  },
});
