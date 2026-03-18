#!/usr/bin/env python3
"""convex_sync_all.py — Master sync: workspace files + sessions + messages ke Convex."""

import os
import subprocess
import sys
from datetime import datetime, timezone

SCRIPTS = os.path.dirname(os.path.abspath(__file__))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_script(script, timeout_sec=300, args=None, optional=False):
    path = os.path.join(SCRIPTS, script)
    if not os.path.exists(path):
        if optional:
            return True, f"[SKIP] {script} not found", ""
        return False, "", f"missing required script: {script}"

    cmd = [sys.executable, path] + (args or [])
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", f"timeout: {script} exceeded {timeout_sec}s"
    except KeyboardInterrupt:
        return False, "", f"interrupted: {script}"


def resolve_messages_source():
    env = os.environ.get("SYNC_MESSAGES_JSONL")
    if env and os.path.exists(env):
        return env
    candidates = [
        os.path.join(SCRIPTS, "test_messages.jsonl"),
        os.path.join(SCRIPTS, "messages.jsonl"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print("=" * 44)
    print(f"  Convex Sync - {now}")
    print("=" * 44)

    all_ok = True

    sequence = [
        ("sync_to_convex.py", 420, None, False),
        ("sync_agents_registry_to_convex.py", 240, None, False),
        ("sync_system_docs_to_convex.py", 180, None, True),
        ("sync_sessions_to_convex.py", 240, None, False),
    ]

    for script, timeout_sec, args, optional in sequence:
        ok, out, err = run_script(script, timeout_sec=timeout_sec, args=args, optional=optional)
        if out.strip():
            print(out.strip())
        if not ok:
            all_ok = False
            if err:
                print("STDERR:", err[:700])
        print()

    msg_src = resolve_messages_source()
    if msg_src:
        ok, out, err = run_script("sync_messages_to_convex.py", timeout_sec=300, args=[msg_src], optional=False)
        if out.strip():
            print(out.strip())
        if not ok:
            all_ok = False
            if err:
                print("STDERR:", err[:700])
    else:
        print("[SKIP] sync_messages_to_convex.py (no JSONL source: set SYNC_MESSAGES_JSONL or provide scripts/test_messages.jsonl)")
    print()

    ok, out, err = run_script("sync_session_summaries.py", timeout_sec=180, optional=True)
    if out.strip():
        print(out.strip())
    if not ok:
        all_ok = False
        if err:
            print("STDERR:", err[:700])
    print()

    print("=" * 44)
    if all_ok:
        print("[OK] CONVEX SYNC OK - semua data tersimpan")
    else:
        print("[FAIL] CONVEX SYNC - ada error, cek di atas")
    print("=" * 44)
    return all_ok


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
