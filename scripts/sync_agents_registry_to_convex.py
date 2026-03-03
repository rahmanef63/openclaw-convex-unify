#!/usr/bin/env python3
"""Sync runtime OpenClaw agents -> Convex agents/workspaceTrees with owner linkage."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

OPENCLAW_CFG = Path(os.path.expanduser("~/.openclaw/openclaw.json"))
REPO_ROOT = Path(__file__).resolve().parent.parent
CWD = str(REPO_ROOT)
TENANT_ID = os.environ.get("APP_TENANT_ID", "rahman-main")
MAX_MD_CHARS = int(os.environ.get("SYNC_MD_MAX_CHARS", "4000"))


def run_convex(fn: str, args: dict):
    if sys.platform == "win32":
        cmd = f'npx convex run {fn} "{json.dumps(args).replace(chr(34), chr(92)+chr(34))}"'
        p = subprocess.run(cmd, cwd=CWD, capture_output=True, text=True, encoding="utf-8", errors="replace", shell=True)
    else:
        p = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=CWD, capture_output=True, text=True, encoding="utf-8", errors="replace")

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


def readf_capped(path):
    txt = readf(path)
    if txt is None:
        return None
    if len(txt) <= MAX_MD_CHARS:
        return txt
    return txt[:MAX_MD_CHARS] + f"\n\n[TRUNCATED at {MAX_MD_CHARS} chars]"


def load_runtime_agents():
    if sys.platform == "win32":
        p = subprocess.run("openclaw agents list --json", capture_output=True, text=True, encoding="utf-8", errors="replace", shell=True)
    else:
        p = subprocess.run(["openclaw", "agents", "list", "--json"], capture_output=True, text=True, encoding="utf-8", errors="replace")

    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip() or "openclaw agents list failed")

    out = (p.stdout or "").strip()
    return json.loads(out) if out else []


def get_owner_for_agent(cfg, agent_id):
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

    if agent_id == "main":
        prof = run_convex("userProfiles:getByPhone", {"phone": "+6285856697754"})
        if isinstance(prof, dict):
            return prof.get("_id")
    return None


def main():
    cfg = json.loads(OPENCLAW_CFG.read_text(encoding="utf-8"))
    runtime = load_runtime_agents()

    ok = 0
    for a in runtime:
        agent_id = a.get("id")
        ws = a.get("workspace")
        if not agent_id or not ws:
            continue

        payload = {
            "tenantId": TENANT_ID,
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
            "owner": get_owner_for_agent(cfg, agent_id),
            # On Windows, omit md blobs to avoid command-line length limit.
            "soulMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "SOUL.md")),
            "identityMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "IDENTITY.md")),
            "agentsMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "AGENTS.md")),
            "toolsMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "TOOLS.md")),
            "userMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "USER.md")),
            "heartbeatMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "HEARTBEAT.md")),
            "bootstrapMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "BOOTSTRAP.md")),
            "memoryMd": None if sys.platform == "win32" else readf_capped(os.path.join(ws, "MEMORY.md")),
        }

        payload = {k: v for k, v in payload.items() if v is not None}
        run_convex("agents:registerAgentScoped", payload)
        ok += 1
        print(f"[OK] synced agent={agent_id}")

    print(json.dumps({"ok": True, "agentsSynced": ok}))


if __name__ == "__main__":
    main()

