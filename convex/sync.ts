// Sync Functions - Sync local workspace files to Convex

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Daily notes from memory folder
const DAILY_NOTES = [
  {
    date: "2026-02-21",
    content: `# Memory - 2026-02-21

## First Day with OpenClaw

### Setup & Configuration
- Configured OpenClaw with WhatsApp channel
- Created workspace files: SOUL.md, IDENTITY.md, AGENTS.md, USER.md, MEMORY.md
- Set up memory system for persistence

### Zara English Practice
- Started English practice sessions with Zara (+6285825516154)
- Schedule: Daily at 8-9 PM Makassar time (12-1 PM UTC)
- Topics: Basic conversation, grammar corrections

### Infrastructure Planning
- Planning to deploy Convex for persistent data storage
- Domain: rahmanef.com for all services
`,
    tags: ["setup", "first-day", "zara"],
  },
  {
    date: "2026-02-22",
    content: `# Memory - 2026-02-22

## Major Progress Today

### 🚀 Infrastructure Setup

#### Landing Pages
- Created **OpenClaw RPG Landing Page** - Next.js 14 PWA with shadcn/ui, Tailwind CSS, Framer Motion
- URL: https://rpg.rahmanef.com
- Tech: Next.js 14, TypeScript, shadcn/ui, Tailwind, Lucide icons, Framer Motion
- Features: PWA ready, dark RPG theme, animated starfield, glass-morphism cards

#### Convex Database (Self-Hosted)
- Deployed **Convex** self-hosted backend and dashboard
- URL: https://db.rahmanef.com (dashboard), https://api.rahmanef.com (API)
- Created schema for OpenClaw data storage

#### Dokploy Deployment Manager
- URL: https://backend.rahmanef.com
- Login: rahmanef63@gmail.com
- Managing all containers and services

#### Root Placeholder
- URL: https://rahmanef.com
- Coming soon page with links to all projects

### 🔧 Technical Setup

#### SSH Configuration
- Added port 22 as backup (original 2221 may be blocked by some networks)
- Both ports now active

### 👤 Zara English Practice
- Session at 11:27 UTC
- Topic: "Dinner with anyone in the world"
- Corrections made: "someone", "could have dinner", capitalization

### ⏳ Pending
1. Push Convex schema to backend
2. Register services in Dokploy UI
3. Sync workspace files to Convex
`,
    tags: ["infrastructure", "convex", "dokploy", "rpg-landing", "zara"],
  },
];

// Sync daily notes
export const syncDailyNotes = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const results: string[] = [];
    
    for (const note of DAILY_NOTES) {
      const existing = await ctx.db
        .query("dailyNotes")
        .withIndex("by_date", (q) => q.eq("date", note.date))
        .first();
      
      if (existing) {
        await ctx.db.patch(existing._id, {
          content: note.content,
          tags: note.tags,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("dailyNotes", {
          date: note.date,
          content: note.content,
          tags: note.tags,
          createdAt: now,
          updatedAt: now,
        });
        results.push(note.date);
      }
    }
    
    return { synced: results };
  },
});

// Create user workspace with all necessary files
export const createUserWorkspace = internalMutation({
  args: {
    userId: v.id("userProfiles"),
    username: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: any = {};
    
    // Create user workspace tree
    const existingTree = await ctx.db
      .query("workspaceTrees")
      .withIndex("by_rootPath", (q) => q.eq("rootPath", `user/${args.username}`))
      .first();
    
    if (!existingTree) {
      await ctx.db.insert("workspaceTrees", {
        rootPath: `user/${args.username}`,
        name: `${args.username}'s Workspace`,
        type: "user",
        ownerId: args.userId,
        description: `Personal workspace for ${args.username}`,
        fileCount: 2,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      results.workspace = "created";
    } else {
      results.workspace = "exists";
    }
    
    // Create USER.md for this user
    const userMdPath = `user/${args.username}/USER.md`;
    const existingUserMd = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", userMdPath))
      .first();
    
    const userMdContent = `# USER.md - About ${args.username}

_Learn about this person. Update as you go._

- **Name:** ${args.username}
- **Phone:** ${args.phone || "N/A"}
- **Email:** ${args.email || "N/A"}
- **Timezone:** _(to be filled)_

## Context

_(What do they care about? Build this over time.)_

---

The more you know, the better you can help.
`;
    
    if (!existingUserMd) {
      await ctx.db.insert("workspaceFiles", {
        path: userMdPath,
        fileType: "md",
        category: "user",
        ownerId: args.userId,
        content: userMdContent,
        version: 1,
        syncStatus: "synced",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      results.userMd = "created";
    } else {
      results.userMd = "exists";
    }
    
    // Create MEMORY.md for this user
    const memoryMdPath = `user/${args.username}/MEMORY.md`;
    const existingMemoryMd = await ctx.db
      .query("workspaceFiles")
      .withIndex("by_path", (q) => q.eq("path", memoryMdPath))
      .first();
    
    const memoryMdContent = `# Long-Term Memory - ${args.username}

## Personal Info

_(Add important details about this user as you learn them)_

## Preferences

_(What do they like? Dislike?)_

## Important Dates

_(Birthdays, anniversaries, etc.)_

## Notes

_(Any other important information)_

---
*Last updated: ${new Date(now).toISOString().split('T')[0]}*
`;
    
    if (!existingMemoryMd) {
      await ctx.db.insert("workspaceFiles", {
        path: memoryMdPath,
        fileType: "md",
        category: "memory",
        ownerId: args.userId,
        content: memoryMdContent,
        version: 1,
        syncStatus: "synced",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      results.memoryMd = "created";
    } else {
      results.memoryMd = "exists";
    }
    
    return results;
  },
});

// Create workspaces for all existing users
export const createAllUserWorkspaces = internalMutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("userProfiles").collect();
    const results: any[] = [];
    
    for (const user of users) {
      if (user.phone) {
        // Derive username from phone or name
        const username = user.name?.toLowerCase().replace(/\s+/g, "-") || 
                        user.phone.replace("+", "");
        
        const result = await ctx.runMutation(
          { path: "sync:createUserWorkspace" } as any,
          {
            userId: user._id,
            username,
            phone: user.phone,
            email: user.email,
          }
        );
        
        results.push({ phone: user.phone, username, ...result });
      }
    }
    
    return results;
  },
});

// Create projects entries
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

// Full sync - run everything
export const fullSync = internalMutation({
  handler: async (ctx) => {
    const results: any = {};
    
    // Sync daily notes
    results.dailyNotes = await ctx.runMutation(
      { path: "sync:syncDailyNotes" } as any,
      {}
    );
    
    // Sync projects
    results.projects = await ctx.runMutation(
      { path: "sync:syncProjects" } as any,
      {}
    );
    
    // Create user workspaces
    results.userWorkspaces = await ctx.runMutation(
      { path: "sync:createAllUserWorkspaces" } as any,
      {}
    );
    
    return results;
  },
});
