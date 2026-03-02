import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// lightweight fallback embedding (hash-based, no external API)
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

export const upsertChunk = mutation({
  args: {
    kind: v.string(),
    sourceId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
    text: v.string(),
    embedding: v.array(v.float64()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("vectorChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        dimensions: args.embedding.length,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("vectorChunks", {
      ...args,
      dimensions: args.embedding.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const bulkUpsertChunks = mutation({
  args: {
    chunks: v.array(v.object({
      kind: v.string(),
      sourceId: v.string(),
      sessionId: v.optional(v.id("sessions")),
      ownerId: v.optional(v.id("userProfiles")),
      agentId: v.optional(v.string()),
      text: v.string(),
      embedding: v.array(v.float64()),
      metadata: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const c of args.chunks) {
      const existing = await ctx.db
        .query("vectorChunks")
        .withIndex("by_source", (q) => q.eq("sourceId", c.sourceId))
        .first();
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...c,
          dimensions: c.embedding.length,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("vectorChunks", {
          ...c,
          dimensions: c.embedding.length,
          createdAt: now,
          updatedAt: now,
        });
      }
      count++;
    }
    return { upserted: count };
  },
});

export const search = query({
  args: {
    queryEmbedding: v.array(v.float64()),
    topK: v.optional(v.number()),
    minScore: v.optional(v.float64()),
    kind: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions")),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const topK = args.topK ?? 8;
    const minScore = args.minScore ?? 0.2;

    let items = args.kind
      ? await ctx.db.query("vectorChunks").withIndex("by_kind", (q) => q.eq("kind", args.kind!)).collect()
      : await ctx.db.query("vectorChunks").collect();

    if (args.sessionId) items = items.filter((i) => i.sessionId === args.sessionId);
    if (args.ownerId) items = items.filter((i) => i.ownerId === args.ownerId);
    if (args.agentId) items = items.filter((i) => i.agentId === args.agentId);

    const scored = items
      .map((i) => ({ ...i, score: cosineSimilarity(args.queryEmbedding, i.embedding) }))
      .filter((i) => i.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  },
});

// text query helper (hash embedding)
export const searchByText = query({
  args: {
    queryText: v.string(),
    topK: v.optional(v.number()),
    minScore: v.optional(v.float64()),
    kind: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions")),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emb = hashEmbedding(args.queryText);
    const topK = args.topK ?? 8;
    const minScore = args.minScore ?? 0.2;

    let items = args.kind
      ? await ctx.db.query("vectorChunks").withIndex("by_kind", (q) => q.eq("kind", args.kind!)).collect()
      : await ctx.db.query("vectorChunks").collect();

    if (args.sessionId) items = items.filter((i) => i.sessionId === args.sessionId);
    if (args.ownerId) items = items.filter((i) => i.ownerId === args.ownerId);
    if (args.agentId) items = items.filter((i) => i.agentId === args.agentId);

    return items
      .map((i) => ({ ...i, score: cosineSimilarity(emb, i.embedding) }))
      .filter((i) => i.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  },
});

// FINAL STAGE #1: build context endpoint for current session
export const buildContextForSession = query({
  args: {
    sessionKey: v.string(),
    queryText: v.string(),
    topK: v.optional(v.number()),
    minScore: v.optional(v.float64()),
    maxChars: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (!session) return { sessionFound: false, snippets: [], contextText: "" };

    const emb = hashEmbedding(args.queryText);
    const topK = args.topK ?? 8;
    const minScore = args.minScore ?? 0.2;
    const maxChars = args.maxChars ?? 3000;

    const items = await ctx.db
      .query("vectorChunks")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();

    const hits = items
      .map((i) => ({ ...i, score: cosineSimilarity(emb, i.embedding) }))
      .filter((i) => i.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((i) => ({
        sourceId: i.sourceId,
        score: Number(i.score.toFixed(4)),
        role: i.metadata?.role,
        timestamp: i.metadata?.timestamp,
        text: i.text,
      }));

    let contextText = "";
    for (const h of hits) {
      const line = `[score:${h.score}]${h.role ? ` [${h.role}]` : ""} ${h.text}\n`;
      if ((contextText + line).length > maxChars) break;
      contextText += line;
    }

    return {
      sessionFound: true,
      sessionId: session._id,
      snippets: hits,
      contextText: contextText.trim(),
    };
  },
});

export const count = query({
  args: {
    kind: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions")),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let items = args.kind
      ? await ctx.db.query("vectorChunks").withIndex("by_kind", (q) => q.eq("kind", args.kind!)).collect()
      : await ctx.db.query("vectorChunks").collect();
    if (args.sessionId) items = items.filter((i) => i.sessionId === args.sessionId);
    if (args.ownerId) items = items.filter((i) => i.ownerId === args.ownerId);
    if (args.agentId) items = items.filter((i) => i.agentId === args.agentId);
    return items.length;
  },
});

// FINAL STAGE #3 (optional): production embedding via OpenAI
export const embedTextOpenAI = action({
  args: {
    text: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    const model = args.model ?? "text-embedding-3-small";
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input: args.text }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI embeddings failed: ${res.status} ${txt}`);
    }
    const j: any = await res.json();
    return {
      model,
      embedding: j?.data?.[0]?.embedding ?? [],
    };
  },
});

export const embedAndUpsertChunkOpenAI = action({
  args: {
    kind: v.string(),
    sourceId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    ownerId: v.optional(v.id("userProfiles")),
    agentId: v.optional(v.string()),
    text: v.string(),
    metadata: v.optional(v.any()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emb = await ctx.runAction(api.vectors.embedTextOpenAI, {
      text: args.text,
      model: args.model,
    });
    const id = await ctx.runMutation(api.vectors.upsertChunk, {
      kind: args.kind,
      sourceId: args.sourceId,
      sessionId: args.sessionId,
      ownerId: args.ownerId,
      agentId: args.agentId,
      text: args.text,
      embedding: emb.embedding,
      metadata: {
        ...(args.metadata ?? {}),
        embeddingModel: emb.model,
        provider: "openai",
      },
    });
    return { id, model: emb.model, dimensions: emb.embedding.length };
  },
});
