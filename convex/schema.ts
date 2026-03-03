/**
 * OpenClaw Data — Schema
 *
 * Konvensi:
 *  - PK  : _id (auto Convex)
 *  - FK  : v.id("tableName") untuk referensi ke tabel Convex
 *  - Ref : v.string() untuk agentId (identifier string, bukan Convex ID)
 *  - Setiap FK wajib punya index
 *  - tenantId: v.optional(v.string()) untuk multi-tenant support
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
  // INSTANCE CONFIG (per-deployment tenant context)
  // Stores tenant context when env vars not accessible in Convex
  // ══════════════════════════════════════════════════════
  instanceConfig: defineTable({
    tenantId: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"]),

  // ══════════════════════════════════════════════════════
  // USER PROFILES [TENANT-BOUND]
  // PK: _id | Ref'd by: sessions, memories, workspaceFiles,
  //          dailyNotes, notifications, userRoles, agents(owner)
  // ══════════════════════════════════════════════════════
  userProfiles: defineTable({
    tenantId: v.optional(v.string()),
    phone:    v.optional(v.string()),
    email:    v.optional(v.string()),
    name:     v.optional(v.string()),
    nickname: v.optional(v.string()),
    labels:   v.optional(v.array(v.string())),
    profession: v.optional(v.string()),
    profileUrls: v.optional(v.array(v.object({
      type: v.string(),
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
    .index("by_tenant", ["tenantId"])
    .index("by_phone", ["phone"])
    .index("by_email", ["email"]),

  // ══════════════════════════════════════════════════════
  // USER IDENTITIES (system table - no tenantId)
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
  // RBAC — ROLES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  roles: defineTable({
    tenantId: v.optional(v.string()),
    name:        v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    level:       v.number(),
    permissions: v.array(v.string()),
    isSystem:    v.boolean(),
    createdAt:   v.number(),
    updatedAt:   v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_name",  ["name"])
    .index("by_level", ["level"]),

  // ══════════════════════════════════════════════════════
  // RBAC — USER ROLES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  userRoles: defineTable({
    tenantId: v.optional(v.string()),
    userId:    v.id("userProfiles"),
    roleId:    v.id("roles"),
    grantedBy: v.optional(v.id("userProfiles")),
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()),
    isActive:  v.boolean(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user",      ["userId"])
    .index("by_role",      ["roleId"])
    .index("by_user_role", ["userId", "roleId"]),

  // ══════════════════════════════════════════════════════
  // RBAC — PERMISSION LOGS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  permissionLogs: defineTable({
    tenantId: v.optional(v.string()),
    userId:      v.id("userProfiles"),
    action:      v.string(),
    resource:    v.optional(v.string()),
    roleId:      v.optional(v.id("roles")),
    performedBy: v.optional(v.id("userProfiles")),
    timestamp:   v.number(),
    metadata:    v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user",      ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_user_time", ["userId", "timestamp"]),

  // ══════════════════════════════════════════════════════
  // AGENTS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  agents: defineTable({
    tenantId: v.optional(v.string()),
    agentId:      v.string(),
    name:         v.string(),
    type:         v.string(),
    model:        v.optional(v.string()),
    status:       v.optional(v.string()),
    isActive:     v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    config:       v.optional(v.any()),
    owner:        v.optional(v.id("userProfiles")),
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
    .index("by_tenant", ["tenantId"])
    .index("by_agentId",  ["agentId"])
    .index("by_owner",    ["owner"])
    .index("by_status",   ["status"])
    .index("by_isActive", ["isActive"]),

  // ══════════════════════════════════════════════════════
  // AGENT DELEGATIONS (system table - no tenantId)
  // ══════════════════════════════════════════════════════
  agentDelegations: defineTable({
    parentAgentId: v.string(),
    childAgentId: v.string(),
    relationType: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
    allowedTools: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parent", ["parentAgentId"])
    .index("by_child", ["childAgentId"])
    .index("by_pair", ["parentAgentId", "childAgentId"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════════════════════
  // SESSIONS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  sessions: defineTable({
    tenantId: v.optional(v.string()),
    sessionKey:   v.string(),
    agentId:      v.optional(v.string()),
    userId:       v.optional(v.id("userProfiles")),
    channel:      v.optional(v.string()),
    model:        v.optional(v.string()),
    status:       v.optional(v.string()),
    messageCount: v.optional(v.number()),
    createdAt:    v.number(),
    lastActiveAt: v.number(),
    metadata:     v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_sessionKey",    ["sessionKey"])
    .index("by_agent",         ["agentId"])
    .index("by_user",          ["userId"])
    .index("by_channel",       ["channel"])
    .index("by_agent_channel", ["agentId", "channel"])
    .index("by_agent_status",  ["agentId", "status"]),

  // ══════════════════════════════════════════════════════
  // SESSION SUMMARIES (system table - no tenantId)
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
  // MESSAGES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  messages: defineTable({
    tenantId: v.optional(v.string()),
    sessionId:  v.id("sessions"),
    agentId:    v.optional(v.string()),
    role:       v.string(),
    content:    v.string(),
    timestamp:  v.number(),
    externalId: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    metadata:   v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_session",      ["sessionId"])
    .index("by_session_time", ["sessionId", "timestamp"])
    .index("by_session_role", ["sessionId", "role"])
    .index("by_agent",        ["agentId"]),

  // ══════════════════════════════════════════════════════
  // AGENT SESSIONS (system table - no tenantId)
  // ══════════════════════════════════════════════════════
  agentSessions: defineTable({
    sessionId:       v.string(),
    convexSessionId: v.optional(v.id("sessions")),
    agentId:         v.string(),
    userId:          v.optional(v.id("userProfiles")),
    channel:         v.optional(v.string()),
    model:           v.optional(v.string()),
    status:          v.string(),
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
  // MEMORIES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  memories: defineTable({
    tenantId: v.optional(v.string()),
    agentId:        v.optional(v.string()),
    userId:         v.optional(v.id("userProfiles")),
    category:       v.string(),
    key:            v.string(),
    value:          v.string(),
    context:        v.optional(v.string()),
    importance:     v.optional(v.number()),
    source:         v.optional(v.string()),
    createdAt:      v.number(),
    lastAccessedAt: v.optional(v.number()),
    accessCount:    v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_agent",          ["agentId"])
    .index("by_user",           ["userId"])
    .index("by_user_category",  ["userId", "category"])
    .index("by_agent_category", ["agentId", "category"])
    .index("by_key",            ["key"]),

  // ══════════════════════════════════════════════════════
  // DAILY NOTES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  dailyNotes: defineTable({
    tenantId: v.optional(v.string()),
    date:      v.string(),
    agentId:   v.optional(v.string()),
    userId:    v.optional(v.id("userProfiles")),
    content:   v.string(),
    summary:   v.optional(v.string()),
    tags:      v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_date",       ["date"])
    .index("by_agent",      ["agentId"])
    .index("by_user",       ["userId"])
    .index("by_agent_date", ["agentId", "date"]),

  // ══════════════════════════════════════════════════════
  // HEARTBEAT TASKS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  heartbeatTasks: defineTable({
    tenantId: v.optional(v.string()),
    taskId:      v.string(),
    agentId:     v.optional(v.string()),
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
    .index("by_tenant", ["tenantId"])
    .index("by_taskId",      ["taskId"])
    .index("by_agent",       ["agentId"])
    .index("by_enabled",     ["enabled"])
    .index("by_agent_enabled",["agentId", "enabled"]),

  // ══════════════════════════════════════════════════════
  // PROJECTS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  projects: defineTable({
    tenantId: v.optional(v.string()),
    name:         v.string(),
    slug:         v.string(),
    description:  v.optional(v.string()),
    domain:       v.optional(v.string()),
    type:         v.optional(v.string()),
    status:       v.string(),
    technologies: v.optional(v.array(v.string())),
    config:       v.optional(v.any()),
    createdAt:    v.number(),
    updatedAt:    v.number(),
    deployedAt:   v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_slug",   ["slug"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════════════════════
  // PROJECT DEFAULTS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  projectDefaults: defineTable({
    tenantId: v.optional(v.string()),
    scope:              v.string(),
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
    .index("by_tenant", ["tenantId"])
    .index("by_scope", ["scope"]),

  // ══════════════════════════════════════════════════════
  // NOTIFICATIONS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  notifications: defineTable({
    tenantId: v.optional(v.string()),
    userId:    v.id("userProfiles"),
    type:      v.string(),
    title:     v.string(),
    message:   v.string(),
    read:      v.boolean(),
    actionUrl: v.optional(v.string()),
    createdAt: v.number(),
    readAt:    v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user",      ["userId"])
    .index("by_user_read", ["userId", "read"])
    .index("by_user_time", ["userId", "createdAt"]),

  // ══════════════════════════════════════════════════════
  // WORKSPACE FILES [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  workspaceFiles: defineTable({
    tenantId: v.optional(v.string()),
    path:         v.string(),
    fileType:     v.string(),
    category:     v.string(),
    agentId:      v.optional(v.string()),
    ownerId:      v.optional(v.id("userProfiles")),
    content:      v.string(),
    parsedData:   v.optional(v.any()),
    version:      v.number(),
    description:  v.optional(v.string()),
    tags:         v.optional(v.array(v.string())),
    isTemplate:   v.optional(v.boolean()),
    syncStatus:   v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt:    v.number(),
    updatedAt:    v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_path",           ["path"])
    .index("by_agent",          ["agentId"])
    .index("by_owner",          ["ownerId"])
    .index("by_category",       ["category"])
    .index("by_agent_path",     ["agentId", "path"])
    .index("by_owner_category", ["ownerId", "category"])
    .index("by_isTemplate",     ["isTemplate"]),

  // ══════════════════════════════════════════════════════
  // WORKSPACE TREES (system table - no tenantId)
  // ══════════════════════════════════════════════════════
  workspaceTrees: defineTable({
    rootPath:    v.string(),
    agentId:     v.optional(v.string()),
    ownerId:     v.optional(v.id("userProfiles")),
    parentId:    v.optional(v.id("workspaceTrees")),
    name:        v.string(),
    description: v.optional(v.string()),
    type:        v.string(),
    fileCount:   v.optional(v.number()),
    status:      v.string(),
    createdAt:   v.number(),
    updatedAt:   v.number(),
  })
    .index("by_rootPath", ["rootPath"])
    .index("by_owner",    ["ownerId"])
    .index("by_parent",   ["parentId"])
    .index("by_type",     ["type"])
    .index("by_agent",    ["agentId"]),

  // ══════════════════════════════════════════════════════
  // FILE VERSIONS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  fileVersions: defineTable({
    tenantId: v.optional(v.string()),
    fileId:        v.id("workspaceFiles"),
    version:       v.number(),
    content:       v.string(),
    changedBy:     v.optional(v.id("userProfiles")),
    changeSummary: v.optional(v.string()),
    timestamp:     v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_file",         ["fileId"])
    .index("by_file_version", ["fileId", "version"])
    .index("by_file_time",    ["fileId", "timestamp"]),

  // ══════════════════════════════════════════════════════
  // VECTOR MEMORY CHUNKS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  vectorChunks: defineTable({
    tenantId:   v.optional(v.string()),
    kind:       v.string(),
    sourceId:   v.string(),
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
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_agent", ["tenantId", "agentId"])
    .index("by_tenant_session", ["tenantId", "sessionId"])
    .index("by_kind", ["kind"])
    .index("by_source", ["sourceId"])
    .index("by_session", ["sessionId"])
    .index("by_owner", ["ownerId"])
    .index("by_agent", ["agentId"])
    .index("by_kind_session", ["kind", "sessionId"]),

  // ══════════════════════════════════════════════════════
  // TENANT CRUD ITEMS [TENANT-BOUND]
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
  // TASKS [TENANT-BOUND]
  // ══════════════════════════════════════════════════════
  tasks: defineTable({
    tenantId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions")),
    userId: v.optional(v.id("userProfiles")),
    title: v.string(),
    status: v.string(), // todo|in_progress|blocked|done
    priority: v.optional(v.string()), // low|normal|high
    payload: v.optional(v.any()),
    result: v.optional(v.any()),
    dueAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_status", ["tenantId", "status"])
    .index("by_agent", ["agentId"])
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  // ══════════════════════════════════════════════════════
  // LEGACY (system tables - no tenantId)
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
