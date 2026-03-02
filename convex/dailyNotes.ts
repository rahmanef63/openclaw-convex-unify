/**
 * dailyNotes.ts — Daily memory notes (memory/YYYY-MM-DD.md)
 *
 * FK: userId → userProfiles._id (optional)
 * Ref: agentId → agents.agentId (string)
 * Index: by_agent_date untuk query cepat per agent
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Upsert daily note (by date + agentId). */
export const upsert = mutation({
  args: {
    date:    v.string(),  // "YYYY-MM-DD"
    agentId: v.optional(v.string()),
    userId:  v.optional(v.id("userProfiles")),
    content: v.string(),
    summary: v.optional(v.string()),
    tags:    v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("dailyNotes")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .filter((q) =>
        args.agentId
          ? q.eq(q.field("agentId"), args.agentId)
          : q.eq(q.field("agentId"), undefined)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content:   args.content,
        summary:   args.summary,
        tags:      args.tags,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("dailyNotes", {
      date:      args.date,
      agentId:   args.agentId,
      userId:    args.userId,
      content:   args.content,
      summary:   args.summary,
      tags:      args.tags,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Ambil note berdasarkan tanggal (dan opsional agentId). */
export const getByDate = query({
  args: {
    date:    v.string(),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("dailyNotes")
      .withIndex("by_date", (q) => q.eq("date", args.date));
    if (args.agentId) {
      return q.filter((q) => q.eq(q.field("agentId"), args.agentId)).first();
    }
    return q.first();
  },
});

/** Ambil semua note milik satu agent (descending). */
export const getByAgent = query({
  args: {
    agentId: v.string(),
    limit:   v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("dailyNotes")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 30),
});

/** Ambil note dalam range tanggal untuk satu agent. */
export const getRange = query({
  args: {
    agentId:   v.optional(v.string()),
    dateStart: v.string(),  // "YYYY-MM-DD"
    dateEnd:   v.string(),  // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("dailyNotes")
      .withIndex("by_agent_date", (q) =>
        q
          .eq("agentId",  args.agentId)
          .gte("date",    args.dateStart)
      )
      .filter((q) => q.lte(q.field("date"), args.dateEnd))
      .order("asc")
      .collect();
    return notes;
  },
});

/** List semua notes (untuk admin / sync check). */
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) =>
    ctx.db
      .query("dailyNotes")
      .order("desc")
      .take(args.limit ?? 100),
});

/** Hapus note berdasarkan tanggal + agentId. */
export const deleteByDate = mutation({
  args: {
    date:    v.string(),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query("dailyNotes")
      .withIndex("by_agent_date", (q) =>
        q.eq("agentId", args.agentId).eq("date", args.date)
      )
      .first();
    if (note) await ctx.db.delete(note._id);
    return note !== null;
  },
});

/**
 * Normalize & deduplicate by strict date (YYYY-MM-DD) per agent.
 * Keeps latest note as canonical, merges content from duplicates.
 */
export const normalizeByStrictDate = mutation({
  args: {
    agentId: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
  },
  handler: async (ctx, args) => {
    const notes = args.agentId
      ? await ctx.db
          .query("dailyNotes")
          .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
          .collect()
      : await ctx.db.query("dailyNotes").collect();

    const groups = new Map<string, typeof notes>();
    for (const n of notes) {
      const strict = n.date.slice(0, 10); // normalize suffix dates
      const key = `${n.agentId ?? "_"}::${strict}`;
      const list = groups.get(key) ?? [];
      list.push(n);
      groups.set(key, list);
    }

    let merged = 0;
    let deleted = 0;

    for (const [key, list] of groups.entries()) {
      if (list.length <= 1) {
        // also normalize date value if had suffix
        const only = list[0];
        if (only && only.date.length > 10) {
          await ctx.db.patch(only._id, { date: only.date.slice(0, 10), updatedAt: Date.now() });
        }
        continue;
      }

      // keep latest updatedAt record
      const sorted = [...list].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
      const keep = sorted[0];
      const strictDate = keep.date.slice(0, 10);

      // merge content from others (append with separator, dedupe exact duplicates)
      const chunks = new Set<string>();
      if (keep.content?.trim()) chunks.add(keep.content.trim());
      for (const n of sorted.slice(1)) {
        if (n.content?.trim()) chunks.add(n.content.trim());
      }
      const mergedContent = Array.from(chunks).join("\n\n---\n\n");

      await ctx.db.patch(keep._id, {
        date: strictDate,
        userId: args.userId ?? keep.userId,
        content: mergedContent,
        updatedAt: Date.now(),
      });
      merged++;

      for (const n of sorted.slice(1)) {
        await ctx.db.delete(n._id);
        deleted++;
      }
    }

    return { merged, deleted, groups: groups.size };
  },
});
