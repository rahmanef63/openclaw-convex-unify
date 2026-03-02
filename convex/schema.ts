/**
 * OpenClaw Data — Schema
 *
 * Konvensi:
 *  - PK  : _id (auto Convex)
 *  - FK  : v.id("tableName") untuk referensi ke tabel Convex
 *  - Ref : v.string() untuk agentId (identifier string, bukan Convex ID)
 *  - Setiap FK wajib punya index
 *
 * Relasi utama:
 *   userProfiles  ──< userRoles >── roles
 *   userProfiles  ──< sessions  ──< messages
 *   agents        ──< sessions  ──< messages
 *   sessions      ──< agentSessions
 *   userProfiles  ──< workspaceFiles >── fileVersions
 *   userProfiles  ──< dailyNotes
 *   userProfiles  ──< memories
 *   userProfiles  ──< notifications
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ══════════════════════════════════════════════════════
  // USER PROFILES
  // PK: _id | Ref'd by: sessions, memories, workspaceFiles,
  //          dailyNotes, notifications, userRoles, agents(owner)
  // ══════════════════════════════════════════════════════
  userProfiles: defineTable({
    phone:    v.optional(v.string()),
    email:    v.optional(v.string()),
    name:     v.optional(v.string()),
    nickname: v.optional(v.string()),
    labels:   v.optional(v.array(v.string())), // e.g. ["ka irul","family","business partner"]
    profession: v.optional(v.string()),
    profileUrls: v.optional(v.array(v.object({
      type: v.string(), // website|instagram|linkedin|x|tiktok|other
      url:  v.string(),
    }))),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    preferences: v.optional(v.object({
      notifications: v.optional(v.boolean()),
      voiceResponse: v.optional(v.boolean()),
      quietHours: v.optional(v.object({
        start: v.optional(v.string()),
        end:   v.optional(v.string()),
      })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_email", ["email"]),

  // ══════════════════════════════════════════════════════
  // USER IDENTITIES (channel external IDs -> userProfile)
  // FK: userId -> userProfiles._id
  // ══════════════════════════════════════════════════════
  userIdentities: defineTable({
    userId:         v.id("userProfiles"),
    channel:        v.string(),
    externalUserId: v.string(),
    verified:       v.optional(v.boolean()),
    confidence:     v.optional(v.number()),
    metadata:       v.optional(v.any()),
    createdAt:      v.number(),
    updatedAt:      v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_channel_external", ["channel", "externalUserId"])
    .index("by_channel", ["channel"]),

  // ══════════════════════════════════════════════════════
  // RBAC — ROLES
  // PK: _id | Ref'd by: userRoles, permissionLogs
  // ══════════════════════════════════════════════════════
  roles: defineTable({
    name:        v.string(),   // super_admin | admin | moderator | user | guest
    displayName: v.string(),
    description: v.optional(v.string()),
    level:       v.number(),   // 100=super_admin, 50=admin, 30=moderator, 10=user, 0=guest
    permissions: v.array(v.string()), // ["read","write","delete","admin","manage_users"]
    isSystem:    v.boolean(),  // system roles cannot be deleted
    createdAt:   v.number(),
    updatedAt:   v.number(),
  })
    .index("by_name",  ["name"])
    .index("by_level", ["level"]),

  // ══════════════════════════════════════════════════════
  // RBAC — USER ROLES  (junction: userProfiles × roles)
  // FK: userId → userProfiles._id
  // FK: roleId → roles._id
  // FK: grantedBy → userProfiles._id (optional)
  // ══════════════════════════════════════════════════════
  userRoles: defineTable({
    userId:    v.id("userProfiles"),
    roleId:    v.id("roles"),
    grantedBy: v.optional(v.id("userProfiles")),
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()),
    isActive:  v.boolean(),
  })
    .index("by_user",      ["userId"])
    .index("by_role",      ["roleId"])
    .index("by_user_role", ["userId", "roleId"]),

  // ══════════════════════════════════════════════════════
  // RBAC — PERMISSION LOGS
  // FK: userId      → userProfiles._id
  // FK: roleId      → roles._id (optional)
  // FK: performedBy → userProfiles._id (optional)
  // ══════════════════════════════════════════════════════
  permissionLogs: defineTable({
    userId:      v.id("userProfiles"),
    action:      v.string(), // role_granted | role_revoked | permission_check
    resource:    v.optional(v.string()),
    roleId:      v.optional(v.id("roles")),
    performedBy: v.optional(v.id("userProfiles")),
    timestamp:   v.number(),
    metadata:    v.optional(v.any()),
  })
    .index("by_user",      ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_user_time", ["userId", "timestamp"]),

  // ══════════════════════════════════════════════════════
  // AGENTS
  // PK: _id | Ref: agentId (string) used across tables
  // FK: owner → userProfiles._id (optional)
  // Ref'd by: sessions (agentId string), workspaceFiles (agentId string)
  // ══════════════════════════════════════════════════════
  agents: defineTable({
    agentId:      v.string(),  // "main" | "si-coder" | "si-db" | etc.
    name:         v.string(),
    type:         v.string(),  // "main" | "specialized" | "sub" | "worker"
    model:        v.optional(v.string()),
    status:       v.optional(v.string()),  // legacy — use isActive
    isActive:     v.optional(v.string()), // "active" | "disabled" | "backup"
    capabilities: v.optional(v.array(v.string())),
    config:       v.optional(v.any()),
    owner:        v.optional(v.id("userProfiles")),  // FK
    // Personality files — kept for backward compat, workspaceFiles is source of truth
    soulMd:       v.optional(v.string()),
    identityMd:   v.optional(v.string()),
    agentsMd:     v.optional(v.string()),
    toolsMd:      v.optional(v.string()),
    userMd:       v.optional(v.string()),
    heartbeatMd:  v.optional(v.string()),
    bootstrapMd:  v.optional(v.string()),
    memoryMd:     v.optional(v.string()),
    createdAt:    v.number(),
    updatedAt:    v.number(),
    lastActiveAt: v.optional(v.number()),
  })
    .index("by_agentId",  ["agentId"])
    .index("by_owner",    ["owner"])
    .index("by_status",   ["status"])
    .index("by_isActive", ["isActive"]),



  // ══════════════════════════════════════════════════════
  // AGENT DELEGATIONS (parent/child permissions)
  // parentAgentId -> childAgentId, with scoped skill/tool allowlist
  // ══════════════════════════════════════════════════════
  agentDelegations: defineTable({
    parentAgentId: v.string(),
    childAgentId: v.string(),
    relationType: v.optional(v.string()), // delegate|subagent|tool-proxy
    allowedSkills: v.optional(v.array(v.string())),
    allowedTools: v.optional(v.array(v.string())),
    status: v.optional(v.string()), // active|disabled
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parent", ["parentAgentId"])
    .index("by_child", ["childAgentId"])
    .index("by_pair", ["parentAgentId", "childAgentId"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════════════════════
  // SESSIONS
  // PK: _id | Ref'd by: messages, agentSessions
  // FK: userId → userProfiles._id (optional)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  sessions: defineTable({
    sessionKey:   v.string(),  // "agent:main:main" | "agent:main:whatsapp:..." etc.
    agentId:      v.optional(v.string()),  // ref: agents.agentId
    userId:       v.optional(v.id("userProfiles")),  // FK
    channel:      v.optional(v.string()),  // whatsapp | telegram | webchat | discord
    model:        v.optional(v.string()),
    status:       v.optional(v.string()),  // "active" | "paused" | "ended"
    messageCount: v.optional(v.number()), // denormalized counter (sync from messages)
    createdAt:    v.number(),
    lastActiveAt: v.number(),
    metadata:     v.optional(v.any()),
  })
    .index("by_sessionKey",    ["sessionKey"])
    .index("by_agent",         ["agentId"])
    .index("by_user",          ["userId"])
    .index("by_channel",       ["channel"])
    .index("by_agent_channel", ["agentId", "channel"])
    .index("by_agent_status",  ["agentId", "status"]),

  // ══════════════════════════════════════════════════════
  // SESSION SUMMARIES (rolling context per session)
  // PK: _id
  // FK: sessionId → sessions._id
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  sessionSummaries: defineTable({
    sessionId:       v.id("sessions"),
    agentId:         v.optional(v.string()),
    summary:         v.string(),
    intent:          v.optional(v.string()),
    decisions:       v.optional(v.array(v.string())),
    constraints:     v.optional(v.array(v.string())),
    entities:        v.optional(v.array(v.string())),
    pendingActions:  v.optional(v.array(v.string())),
    keyFacts:        v.optional(v.array(v.string())),
    openTodos:       v.optional(v.array(v.string())),
    lastResolvedAt:  v.optional(v.number()),
    messageCount:    v.optional(v.number()),
    firstMessageAt:  v.optional(v.number()),
    lastMessageAt:   v.optional(v.number()),
    sourceMessageRange: v.optional(v.object({
      from: v.optional(v.number()),
      to: v.optional(v.number()),
    })),
    checksum:        v.optional(v.string()),
    summaryVersion:  v.optional(v.number()),
    source:          v.optional(v.string()),
    createdAt:       v.number(),
    updatedAt:       v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_updated", ["sessionId", "updatedAt"])
    .index("by_agent", ["agentId"]),

  // ══════════════════════════════════════════════════════
  // MESSAGES  (chat history)
  // PK: _id
  // FK: sessionId → sessions._id  ← proper FK
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  messages: defineTable({
    sessionId:  v.id("sessions"),  // FK ← was v.string(), now proper FK
    agentId:    v.optional(v.string()),  // ref: agents.agentId
    role:       v.string(),  // "user" | "assistant" | "system" | "tool"
    content:    v.string(),
    timestamp:  v.number(),
    externalId: v.optional(v.string()),  // message ID from channel (WhatsApp, Telegram, etc.)
    tokenCount: v.optional(v.number()),
    metadata:   v.optional(v.any()),
  })
    .index("by_session",      ["sessionId"])
    .index("by_session_time", ["sessionId", "timestamp"])
    .index("by_session_role", ["sessionId", "role"])
    .index("by_agent",        ["agentId"]),

  // ══════════════════════════════════════════════════════
  // AGENT SESSIONS  (detailed per-agent session tracking)
  // PK: _id
  // FK: convexSessionId → sessions._id (optional)
  // FK: userId → userProfiles._id (optional)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  agentSessions: defineTable({
    sessionId:       v.string(),  // external UUID from OpenClaw JSONL
    convexSessionId: v.optional(v.id("sessions")),  // FK → sessions._id
    agentId:         v.string(),  // ref: agents.agentId
    userId:          v.optional(v.id("userProfiles")),  // FK
    channel:         v.optional(v.string()),
    model:           v.optional(v.string()),
    status:          v.string(),  // "active" | "paused" | "ended" | "error"
    startedAt:       v.number(),
    endedAt:         v.optional(v.number()),
    messageCount:    v.optional(v.number()),
    tokenUsage:      v.optional(v.object({
      input:  v.number(),
      output: v.number(),
      total:  v.number(),
    })),
    metadata: v.optional(v.any()),
  })
    .index("by_sessionId",       ["sessionId"])
    .index("by_convexSession",   ["convexSessionId"])
    .index("by_agent",           ["agentId"])
    .index("by_user",            ["userId"])
    .index("by_status",          ["status"])
    .index("by_agent_status",    ["agentId", "status"]),

  // ══════════════════════════════════════════════════════
  // MEMORIES  (long-term agent memory)
  // PK: _id
  // FK: userId → userProfiles._id (optional)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  memories: defineTable({
    agentId:        v.optional(v.string()),  // ref: agents.agentId
    userId:         v.optional(v.id("userProfiles")),  // FK
    category:       v.string(),  // "preference"|"fact"|"event"|"decision"|"lesson"
    key:            v.string(),
    value:          v.string(),
    context:        v.optional(v.string()),
    importance:     v.optional(v.number()),  // 1–10
    source:         v.optional(v.string()),
    createdAt:      v.number(),
    lastAccessedAt: v.optional(v.number()),
    accessCount:    v.optional(v.number()),
  })
    .index("by_agent",          ["agentId"])
    .index("by_user",           ["userId"])
    .index("by_user_category",  ["userId", "category"])
    .index("by_agent_category", ["agentId", "category"])
    .index("by_key",            ["key"]),

  // ══════════════════════════════════════════════════════
  // DAILY NOTES  (memory/YYYY-MM-DD.md equivalent)
  // PK: _id
  // FK: userId → userProfiles._id (optional)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  dailyNotes: defineTable({
    date:      v.string(),  // "YYYY-MM-DD"
    agentId:   v.optional(v.string()),  // ref: agents.agentId
    userId:    v.optional(v.id("userProfiles")),  // FK
    content:   v.string(),  // raw markdown
    summary:   v.optional(v.string()),
    tags:      v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date",       ["date"])
    .index("by_agent",      ["agentId"])
    .index("by_user",       ["userId"])
    .index("by_agent_date", ["agentId", "date"]),

  // ══════════════════════════════════════════════════════
  // HEARTBEAT TASKS
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  heartbeatTasks: defineTable({
    taskId:      v.string(),
    agentId:     v.optional(v.string()),  // ref: agents.agentId
    description: v.string(),
    schedule:    v.optional(v.string()),
    enabled:     v.boolean(),
    lastRun:     v.optional(v.number()),
    lastResult:  v.optional(v.string()),
    nextRun:     v.optional(v.number()),
    config:      v.optional(v.any()),
    createdAt:   v.number(),
    updatedAt:   v.number(),
  })
    .index("by_taskId",      ["taskId"])
    .index("by_agent",       ["agentId"])
    .index("by_enabled",     ["enabled"])
    .index("by_agent_enabled",["agentId", "enabled"]),

  // ══════════════════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════════════════
  projects: defineTable({
    name:         v.string(),
    slug:         v.string(),
    description:  v.optional(v.string()),
    domain:       v.optional(v.string()),
    type:         v.optional(v.string()),  // "web"|"api"|"fullstack"|"landing"
    status:       v.string(),  // "active"|"paused"|"archived"|"building"
    technologies: v.optional(v.array(v.string())),
    config:       v.optional(v.any()),
    createdAt:    v.number(),
    updatedAt:    v.number(),
    deployedAt:   v.optional(v.number()),
  })
    .index("by_slug",   ["slug"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════════════════════
  // PROJECT DEFAULTS
  // ══════════════════════════════════════════════════════
  projectDefaults: defineTable({
    scope:              v.string(),  // "global"
    basePath:           v.string(),
    projectRootPattern: v.string(),
    structure: v.object({
      frontendDir: v.string(),
      backendDir:  v.string(),
    }),
    frontend: v.object({
      framework:    v.string(),
      architecture: v.optional(v.string()),
      rootFolders:  v.optional(v.array(v.string())),
    }),
    backend: v.object({
      framework:            v.string(),
      database:             v.string(),
      convexProjectPolicy:  v.string(),
      schemaPolicy:         v.string(),
    }),
    deploy: v.object({
      primary:          v.string(),
      mustUseContainer: v.optional(v.boolean()),
      secondary:        v.optional(v.string()),
      notes:            v.optional(v.string()),
    }),
    db: v.object({
      mode:       v.string(),
      url:        v.optional(v.string()),
      mvpStorage: v.string(),
      mvpRule:    v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope", ["scope"]),

  // ══════════════════════════════════════════════════════
  // NOTIFICATIONS
  // FK: userId → userProfiles._id
  // ══════════════════════════════════════════════════════
  notifications: defineTable({
    userId:    v.id("userProfiles"),  // FK
    type:      v.string(),  // "info"|"warning"|"error"|"success"
    title:     v.string(),
    message:   v.string(),
    read:      v.boolean(),
    actionUrl: v.optional(v.string()),
    createdAt: v.number(),
    readAt:    v.optional(v.number()),
  })
    .index("by_user",      ["userId"])
    .index("by_user_read", ["userId", "read"])
    .index("by_user_time", ["userId", "createdAt"]),

  // ══════════════════════════════════════════════════════
  // WORKSPACE FILES
  // PK: _id | Ref'd by: fileVersions
  // FK: ownerId → userProfiles._id (optional)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  workspaceFiles: defineTable({
    path:         v.string(),  // "SOUL.md" | "memory/2026-02-28.md" | etc.
    fileType:     v.string(),  // "md"|"json"|"txt"|"yaml"
    category:     v.string(),  // "agent"|"memory"|"user"|"project"|"config"
    agentId:      v.optional(v.string()),  // ref: agents.agentId
    ownerId:      v.optional(v.id("userProfiles")),  // FK
    content:      v.string(),
    parsedData:   v.optional(v.any()),
    version:      v.number(),
    description:  v.optional(v.string()),
    tags:         v.optional(v.array(v.string())),
    isTemplate:   v.optional(v.boolean()),
    syncStatus:   v.optional(v.string()),  // "synced"|"pending"|"conflict"
    lastSyncedAt: v.optional(v.number()),
    createdAt:    v.number(),
    updatedAt:    v.number(),
  })
    .index("by_path",           ["path"])
    .index("by_agent",          ["agentId"])
    .index("by_owner",          ["ownerId"])
    .index("by_category",       ["category"])
    .index("by_agent_path",     ["agentId", "path"])
    .index("by_owner_category", ["ownerId", "category"])
    .index("by_isTemplate",     ["isTemplate"]),

  // ══════════════════════════════════════════════════════
  // WORKSPACE TREES
  // PK: _id
  // FK: ownerId  → userProfiles._id (optional)
  // FK: parentId → workspaceTrees._id (optional, self-ref)
  // Ref: agentId (string → agents.agentId)
  // ══════════════════════════════════════════════════════
  workspaceTrees: defineTable({
    rootPath:    v.string(),
    agentId:     v.optional(v.string()),  // ref: agents.agentId
    ownerId:     v.optional(v.id("userProfiles")),   // FK
    parentId:    v.optional(v.id("workspaceTrees")), // FK (self-ref)
    name:        v.string(),
    description: v.optional(v.string()),
    type:        v.string(),  // "root"|"user"|"project"|"shared"
    fileCount:   v.optional(v.number()),
    status:      v.string(),  // "active"|"archived"|"deleted"
    createdAt:   v.number(),
    updatedAt:   v.number(),
  })
    .index("by_rootPath", ["rootPath"])
    .index("by_owner",    ["ownerId"])
    .index("by_parent",   ["parentId"])
    .index("by_type",     ["type"])
    .index("by_agent",    ["agentId"]),

  // ══════════════════════════════════════════════════════
  // FILE VERSIONS  (version history for workspaceFiles)
  // PK: _id
  // FK: fileId    → workspaceFiles._id
  // FK: changedBy → userProfiles._id (optional)
  // ══════════════════════════════════════════════════════
  fileVersions: defineTable({
    fileId:        v.id("workspaceFiles"),  // FK
    version:       v.number(),
    content:       v.string(),
    changedBy:     v.optional(v.id("userProfiles")),  // FK
    changeSummary: v.optional(v.string()),
    timestamp:     v.number(),
  })
    .index("by_file",         ["fileId"])
    .index("by_file_version", ["fileId", "version"])
    .index("by_file_time",    ["fileId", "timestamp"]),

  // ══════════════════════════════════════════════════════
  // VECTOR MEMORY CHUNKS (session memory context / semantic retrieval)
  // FK: sessionId -> sessions._id (optional)
  // FK: ownerId   -> userProfiles._id (optional)
  // Ref: agentId  -> agents.agentId
  // ══════════════════════════════════════════════════════
  vectorChunks: defineTable({
    kind:       v.string(), // session_message | daily_note | memory | custom
    sourceId:   v.string(), // external unique id (e.g., message externalId)
    sessionId:  v.optional(v.id("sessions")),
    ownerId:    v.optional(v.id("userProfiles")),
    agentId:    v.optional(v.string()),
    text:       v.string(),
    embedding:  v.array(v.float64()),
    dimensions: v.number(),
    metadata:   v.optional(v.any()),
    createdAt:  v.number(),
    updatedAt:  v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_source", ["sourceId"])
    .index("by_session", ["sessionId"])
    .index("by_owner", ["ownerId"])
    .index("by_agent", ["agentId"])
    .index("by_kind_session", ["kind", "sessionId"]),

  // ══════════════════════════════════════════════════════
  // TENANT CRUD TEST (for local OpenClaw integration validation)
  // ══════════════════════════════════════════════════════
  tenantCrudItems: defineTable({
    tenantId: v.string(),
    key: v.string(),
    value: v.string(),
    metadata: v.optional(v.any()),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_key", ["tenantId", "key"])
    .index("by_tenant_deleted", ["tenantId", "deletedAt"]),

  // ══════════════════════════════════════════════════════
  // LEGACY — kept for backward compat, NOT source of truth
  // Use workspaceFiles + agents instead of these
  // ══════════════════════════════════════════════════════
  agentIdentity: defineTable({
    agentId:         v.string(),
    name:            v.optional(v.string()),
    creature:        v.optional(v.string()),
    vibe:            v.optional(v.string()),
    emoji:           v.optional(v.string()),
    avatar:          v.optional(v.string()),
    soulContent:     v.optional(v.string()),
    identityContent: v.optional(v.string()),
    version:         v.number(),
    updatedAt:       v.number(),
  }).index("by_agentId", ["agentId"]),

  agentOperations: defineTable({
    agentId:            v.string(),
    operationsContent:  v.string(),
    rules:              v.optional(v.array(v.object({
      category: v.string(),
      rule:     v.string(),
    }))),
    version:   v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  toolsConfig: defineTable({
    agentId:      v.string(),
    toolsContent: v.string(),
    cameraNames:  v.optional(v.array(v.object({
      id:       v.string(),
      name:     v.string(),
      location: v.optional(v.string()),
    }))),
    sshHosts: v.optional(v.array(v.object({
      alias: v.string(),
      host:  v.string(),
      user:  v.optional(v.string()),
    }))),
    voicePreferences: v.optional(v.object({
      preferredVoice:  v.optional(v.string()),
      defaultSpeaker:  v.optional(v.string()),
    })),
    version:   v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),
});
