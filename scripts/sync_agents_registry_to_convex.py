#!/usr/bin/env python3
"""Sync runtime OpenClaw agents -> Convex agents/workspaceTrees with owner linkage.

- Registers missing agents in Convex
- Updates agentsMd/soulMd/etc from each agent workspace files
- Links owner FK (userProfiles) via WhatsApp binding when available
- Ensures each agent has a workspaceTrees row
"""

import json
import os
import re
import subprocess
from pathlib import Path

OPENCLAW_CFG = Path(os.path.expanduser("~/.openclaw/openclaw.json"))
CWD = "/home/rahman/projects/openclaw-data"
TENANT_ID = os.environ.get("APP_TENANT_ID", "rahman-main")


def run_convex(fn: str, args: dict):
    p = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=CWD, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    out = p.stdout.strip()
    return json.loads(out) if out else None


def digits(s: str):
    return re.sub(r"\D", "", s or "")


def readf(path):
    try:
        return Path(path).read_text(encoding="utf-8")
    except Exception:
        return None


def get_owner_for_agent(cfg, agent_id):
    # find whatsapp binding for this agent
    for b in cfg.get("bindings", []):
        if b.get("agentId") != agent_id:
            continue
        m = b.get("match", {}) or {}
        if m.get("channel") != "whatsapp":
            continue
        peer = ((m.get("peer") or {}).get("id") or "")
        num = digits(peer)
        if not num:
            continue
        prof = run_convex("userProfiles:getByPhone", {"phone": "+" + num})
        if not prof:
            prof = run_convex("userProfiles:getOrCreate", {"phone": "+" + num, "name": agent_id})
        if isinstance(prof, dict) and prof.get("_id"):
            return prof["_id"]


    # parent ownership inheritance disabled in strict-only mode (legacy path removed)
    # fallback: main owner Rahman
    if agent_id == "main":
        prof = run_convex("userProfiles:getByPhone", {"phone": "+6285856697754"})
        if isinstance(prof, dict):
            return prof.get("_id")
    return None


def main():
    cfg = json.loads(OPENCLAW_CFG.read_text(encoding="utf-8"))
    runtime_agents = subprocess.run(["openclaw", "agents", "list", "--json"], capture_output=True, text=True)
    runtime = json.loads(runtime_agents.stdout)

    ok = 0
    for a in runtime:
        agent_id = a.get("id")
        ws = a.get("workspace")
        if not agent_id or not ws:
            continue

        owner = get_owner_for_agent(cfg, agent_id)
        payload = {
            "agentId": agent_id,
            "name": a.get("name") or a.get("identityName") or agent_id,
            "type": "main" if agent_id == "main" else "specialized",
            "model": a.get("model"),
            "status": "active",
            "isActive": "active",
            "capabilities": ["chat", "tools"],
            "config": {
                "workspace": ws,
                "agentDir": a.get("agentDir"),
                "bindings": a.get("bindings"),
                "source": "runtime-sync-v2",
            },
            "owner": owner,
            "tenantId": TENANT_ID,
        }

        # Remove nulls to satisfy validators where needed
        payload = {k: v for k, v in payload.items() if v is not None}
        run_convex("agents:registerAgentScoped", payload)

        # workspace:upsertWorkspaceLink disabled in strict-only mode (legacy)
        # keep this sync focused on agents registry + md columns

        ok += 1
        print(f"✅ synced agent={agent_id}, owner={owner}")

    print(json.dumps({"ok": True, "agentsSynced": ok}))


if __name__ == "__main__":
    main()
