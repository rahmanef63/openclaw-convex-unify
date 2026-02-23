// Projects catalog - list of projects created and their details

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listProjects = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

export const getProjectBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const upsertProject = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    domain: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.string(),
    technologies: v.optional(v.array(v.string())),
    config: v.optional(v.any()),
    deployedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return { updated: true };
    }

    await ctx.db.insert("projects", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true };
  },
});

// Seed base projects known to OpenClaw
export const syncProjects = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const projects = [
      {
        name: "OpenClaw RPG Landing",
        slug: "openclaw-rpg-landing",
        description: "Marketing landing page for OpenClaw",
        domain: "rpg.rahmanef.com",
        type: "landing",
        status: "active",
        technologies: ["Next.js", "React", "TypeScript", "Tailwind", "shadcn/ui", "Framer Motion"],
      },
      {
        name: "OpenClaw Data",
        slug: "openclaw-data",
        description: "Convex backend for persistent OpenClaw data storage",
        domain: "api.rahmanef.com",
        type: "api",
        status: "active",
        technologies: ["Convex", "TypeScript"],
      },
      {
        name: "Convex Dashboard",
        slug: "convex-dashboard",
        description: "Self-hosted Convex admin dashboard",
        domain: "db.rahmanef.com",
        type: "web",
        status: "active",
        technologies: ["Convex"],
      },
      {
        name: "Dokploy",
        slug: "dokploy",
        description: "Deployment manager for all services",
        domain: "backend.rahmanef.com",
        type: "web",
        status: "active",
        technologies: ["Docker", "Traefik", "PostgreSQL", "Redis"],
      },
      {
        name: "RahmanEF Root",
        slug: "rahmanef-root",
        description: "Root placeholder for rahmanef.com",
        domain: "rahmanef.com",
        type: "landing",
        status: "active",
        technologies: ["HTML", "CSS"],
      },
    ];

    const results: string[] = [];

    for (const project of projects) {
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", project.slug))
        .first();

      if (!existing) {
        await ctx.db.insert("projects", {
          ...project,
          createdAt: now,
          updatedAt: now,
          deployedAt: now,
        });
        results.push(project.name);
      }
    }

    return { created: results };
  },
});
