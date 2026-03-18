#!/usr/bin/env python3
"""sync_to_convex.py — Sync workspace files ke Convex dan print report."""

import glob
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
OPENCLAW_CONFIG = os.path.expanduser("~/.openclaw/openclaw.json")
ADMIN_KEY = "rahmanef-convex|01365a724e228c4bffd8f1e0bcc36f9ace8a551df04299000957a30162348e10bc2c820a4e"
CONVEX_URL = os.environ.get("CONVEX_SELF_HOSTED_URL", "https://api.<YOUR_DOMAIN>")
CONVEX_ADMIN_KEY = os.environ.get("CONVEX_SELF_HOSTED_ADMIN_KEY", ADMIN_KEY)
TMP_ARGS = "/tmp/_convex_sync_args.json"
CTR_ARGS = "/tmp/_convex_sync_args.json"
TENANT_ID = os.environ.get("APP_TENANT_ID", "rahman-main")
MAX_CONTENT_CHARS = int(os.environ.get("SYNC_FILE_MAX_CHARS", "6000"))


def run_convex(fn, args_dict):
    if sys.platform == "win32":
        payload = json.dumps({"path": fn, "args": args_dict}).encode("utf-8")
        req = urllib.request.Request(
            f"{CONVEX_URL}/api/mutation",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Convex {CONVEX_ADMIN_KEY}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            try:
                decoded = json.loads(body)
                if isinstance(decoded, dict) and decoded.get("status") == "success":
                    return True, decoded.get("value")
                return True, decoded
            except Exception:
                return True, body
        except Exception as e:
            return False, str(e)

    with open(TMP_ARGS, "w", encoding="utf-8") as f:
        json.dump(args_dict, f, ensure_ascii=False)

    cp = subprocess.run(
        ["sudo", "docker", "cp", TMP_ARGS, f"convex-backend-1:{CTR_ARGS}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=10,
    )
    if cp.returncode != 0:
        return False, f"docker cp failed: {cp.stderr}"

    cmd = (
        "cd /tmp/openclaw-data && "
        "CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 "
        f"CONVEX_SELF_HOSTED_ADMIN_KEY='{ADMIN_KEY}' "
        "SENTRY_DSN= CONVEX_DISABLE_SENTRY=1 NO_TELEMETRY=1 "
        f'npx convex run {fn} "$(cat {CTR_ARGS})"'
    )
    result = subprocess.run(
        ["sudo", "docker", "exec", "convex-backend-1", "sh", "-c", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    return result.returncode == 0, (result.stdout or result.stderr or "").strip()


def get_convex_files(agent_id):
    return {}


def sync_file(path, local_path, category, description, agent_id):
    if not os.path.exists(local_path):
        return 0, "missing"
    with open(local_path, "r", encoding="utf-8") as f:
        content = f.read()

    if sys.platform == "win32" and len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS] + "\n\n[TRUNCATED by sync_to_convex.py]"

    local_size = len(content.encode("utf-8"))
    ok, out = run_convex(
        "workspace:saveFileScoped",
        {
            "tenantId": TENANT_ID,
            "path": path,
            "fileType": "md",
            "category": category,
            "agentId": agent_id,
            "content": content,
            "description": description,
        },
    )
    return local_size, "ok" if ok else f"error: {str(out)[:120]}"


def load_agents():
    agents = [{"id": "main", "workspace": WORKSPACE}]
    try:
        with open(OPENCLAW_CONFIG, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        seen = {"main"}
        for a in cfg.get("agents", {}).get("list", []):
            aid = a.get("id")
            ws = a.get("workspace")
            if aid and ws and aid not in seen:
                agents.append({"id": aid, "workspace": os.path.expanduser(ws)})
                seen.add(aid)
    except Exception:
        pass
    return agents


def main():
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"Convex Sync Report - {now_utc}\n")

    errors = []
    total_core_synced = 0
    total_core_target = 0
    total_note_synced = 0
    total_note_files = 0

    core = [
        ("MEMORY.md", "Long-term memory / curated memories", "agent"),
        ("SOUL.md", "Identitas dan karakter agent", "agent"),
        ("USER.md", "Informasi user", "agent"),
        ("TOOLS.md", "Catatan tools dan konfigurasi lokal", "agent"),
        ("HEARTBEAT.md", "Tugas heartbeat periodik", "agent"),
        ("IDENTITY.md", "Nama, emoji, avatar agent", "agent"),
        ("AGENTS.md", "Instruksi operasional agent", "agent"),
    ]

    for agent in load_agents():
        agent_id = agent["id"]
        workspace = agent["workspace"]
        convex_files = get_convex_files(agent_id)

        print(f"Core workspace files [{agent_id}] ({workspace}):")
        for fname, desc, cat in core:
            local_path = os.path.join(workspace, fname)
            if not os.path.exists(local_path):
                continue
            total_core_target += 1
            local_size = os.path.getsize(local_path)
            convex_entry = convex_files.get(fname)
            convex_size = len((convex_entry.get("content") or "").encode()) if convex_entry else 0

            _, status = sync_file(fname, local_path, cat, desc, agent_id)
            if status == "ok":
                total_core_synced += 1
                note = f"({convex_size}B -> {local_size}B)" if convex_size != local_size else f"({local_size}B ok)"
                print(f"  [OK] {fname} {note}")
            else:
                errors.append(f"{agent_id}:{fname}")
                print(f"  [FAIL] {fname} :: {status}")

        note_files = sorted(glob.glob(os.path.join(workspace, "memory", "20*.md")))
        if note_files:
            print(f"  Daily notes [{agent_id}]:")
        for note_path in note_files:
            total_note_files += 1
            fname = os.path.basename(note_path)
            path = f"memory/{fname}"
            _, status = sync_file(path, note_path, "memory", f"Daily note: {fname}", agent_id)
            if status == "ok":
                total_note_synced += 1
            else:
                errors.append(f"{agent_id}:{path}")
                print(f"  [FAIL] memory/{fname} :: {status}")

    print("\n" + "=" * 44)
    print("Summary:")
    print(f"  Core files : {total_core_synced}/{total_core_target} synced")
    print(f"  Daily notes: {total_note_synced}/{total_note_files} synced")
    if errors:
        print(f"  Failed     : {len(errors)} item(s)")
        return False
    print("  All data is up-to-date in Convex")
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
