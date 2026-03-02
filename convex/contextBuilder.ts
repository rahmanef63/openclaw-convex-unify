import { query } from "./_generated/server";
import { v } from "convex/values";

type Msg = {
  _id: string;
  role: string;
  content: string;
  timestamp: number;
  tokenCount?: number;
};

function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

function hashEmbedding(text: string, dims = 128): number[] {
  const vec = new Array(dims).fill(0) as number[];
  const tokens = (text || "").toLowerCase().split(/\s+/).filter(Boolean);
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

function cosineSimilarity(a: number[], b: number[]): number {
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

export const buildPromptContext = query({
  args: {
    sessionKey: v.string(),
    budgetTokens: v.optional(v.number()),
    includeTranscript: v.optional(v.boolean()),
    includeMemory: v.optional(v.boolean()),
    queryText: v.optional(v.string()),
    memoryTopK: v.optional(v.number()),
    memoryMinScore: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const budget = Math.max(300, args.budgetTokens ?? 4000);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!session) {
      return { found: false, reason: "session_not_found", budget };
    }

    const summary = await ctx.db
      .query("sessionSummaries")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .first();

    const summaryBudget = Math.floor(budget * 0.2);
    const recentBudget = Math.floor(budget * 0.6);
    const memoryBudget = Math.floor(budget * 0.2);

    let usedSummary = 0;
    let usedRecent = 0;
    let usedMemory = 0;

    const summaryBlock = summary
      ? {
          summary: summary.summary,
          intent: summary.intent,
          keyFacts: summary.keyFacts ?? [],
          openTodos: summary.openTodos ?? [],
          decisions: summary.decisions ?? [],
          constraints: summary.constraints ?? [],
          entities: summary.entities ?? [],
          pendingActions: summary.pendingActions ?? [],
          updatedAt: summary.updatedAt,
          summaryVersion: summary.summaryVersion ?? 1,
        }
      : null;

    if (summaryBlock) {
      usedSummary += estimateTokens(summaryBlock.summary || "");
      usedSummary += estimateTokens(summaryBlock.intent || "");
      usedSummary += (summaryBlock.keyFacts || []).reduce((s, x) => s + estimateTokens(x), 0);
      usedSummary += (summaryBlock.openTodos || []).reduce((s, x) => s + estimateTokens(x), 0);
      usedSummary += (summaryBlock.decisions || []).reduce((s, x) => s + estimateTokens(x), 0);
      usedSummary += (summaryBlock.constraints || []).reduce((s, x) => s + estimateTokens(x), 0);
      usedSummary += (summaryBlock.entities || []).reduce((s, x) => s + estimateTokens(x), 0);
      usedSummary += (summaryBlock.pendingActions || []).reduce((s, x) => s + estimateTokens(x), 0);
    }

    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .take(120);

    const selected: Msg[] = [];
    for (const m of recentMessages) {
      const cost = m.tokenCount ?? estimateTokens(m.content);
      if (usedRecent + cost > recentBudget) break;
      usedRecent += cost;
      selected.push({
        _id: String(m._id),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        tokenCount: m.tokenCount,
      });
    }
    selected.reverse();

    const includeMemory = args.includeMemory !== false;
    const memoryTopK = Math.max(1, Math.min(20, args.memoryTopK ?? 8));
    const memoryMinScore = args.memoryMinScore ?? 0.2;

    let memorySnippets: Array<{
      sourceId: string;
      score: number;
      text: string;
      role?: string;
      timestamp?: number;
      kind: string;
    }> = [];

    if (includeMemory) {
      const queryText =
        args.queryText ||
        [...selected].reverse().find((m) => m.role === "user")?.content ||
        summaryBlock?.summary ||
        "session context";

      const qemb = hashEmbedding(queryText);

      // session-local vectors
      const sessionVecs = await ctx.db
        .query("vectorChunks")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();

      // user-level vectors (cross-session), if user exists
      let ownerVecs: any[] = [];
      if (session.userId) {
        ownerVecs = await ctx.db
          .query("vectorChunks")
          .withIndex("by_owner", (q) => q.eq("ownerId", session.userId!))
          .collect();
      }

      const combined = [...sessionVecs, ...ownerVecs];
      const bySource = new Map<string, any>();
      for (const x of combined) {
        if (!bySource.has(x.sourceId)) bySource.set(x.sourceId, x);
      }

      const ranked = [...bySource.values()]
        .map((x: any) => ({ ...x, score: cosineSimilarity(qemb, x.embedding) }))
        .filter((x: any) => x.score >= memoryMinScore)
        .sort((a: any, b: any) => b.score - a.score);

      for (const hit of ranked) {
        const cost = estimateTokens(hit.text || "");
        if (memorySnippets.length >= memoryTopK) break;
        if (usedMemory + cost > memoryBudget) break;
        usedMemory += cost;
        memorySnippets.push({
          sourceId: hit.sourceId,
          score: Number(hit.score.toFixed(4)),
          text: hit.text,
          role: hit.metadata?.role,
          timestamp: hit.metadata?.timestamp,
          kind: hit.kind,
        });
      }
    }

    return {
      found: true,
      strategy: "summary-first-transcript-on-demand",
      session: {
        id: session._id,
        sessionKey: session.sessionKey,
        channel: session.channel,
        agentId: session.agentId,
        userId: session.userId,
      },
      budgets: {
        total: budget,
        summary: summaryBudget,
        recent: recentBudget,
        memory: memoryBudget,
      },
      used: {
        summary: usedSummary,
        recent: usedRecent,
        memory: usedMemory,
      },
      summary: summaryBlock,
      memorySnippets,
      recentMessages: args.includeTranscript === false ? [] : selected,
      transcriptDeferred: args.includeTranscript === false,
      onDemandHint:
        "If confidence is low or user asks historical detail, fetch older messages by sessionId via sessions:getMessages.",
    };
  },
});
