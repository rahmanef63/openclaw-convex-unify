#!/usr/bin/env python3
"""convex_sync_all.py — Master sync: workspace files + sessions ke Convex.
Dipanggil dari heartbeat. Print ringkasan status."""

import subprocess, sys, os
from datetime import datetime, timezone

SCRIPTS = os.path.dirname(os.path.abspath(__file__))

def run_script(script, timeout_sec=300):
    try:
        result = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, script)],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", f"timeout: {script} exceeded {timeout_sec}s"
    except KeyboardInterrupt:
        return False, "", f"interrupted: {script}"

def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Convex Sync — {now}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    all_ok = True

    # 1. Workspace files
    ok, out, err = run_script("sync_to_convex.py", timeout_sec=420)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print()

    # 1b. Agents registry/docs (updates agents table columns: *Md)
    ok, out, err = run_script("sync_agents_registry_to_convex.py", timeout_sec=240)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print()

    # 1c. System docs (OPENCLAW_INIT)
    ok, out, err = run_script("sync_system_docs_to_convex.py", timeout_sec=180)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print()

    # 2. Sessions (scoped by user+channel+agent)
    ok, out, err = run_script("sync_sessions_to_convex.py", timeout_sec=240)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print()

    # 3. Messages (dedupe by externalId)
    ok, out, err = run_script("sync_messages_to_convex.py", timeout_sec=300)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print()

    # 4. Session summaries (rolling daily context)
    ok, out, err = run_script("sync_session_summaries.py", timeout_sec=180)
    print(out.strip())
    if not ok:
        all_ok = False
        if err: print("STDERR:", err[:200])

    print(f"\n{'━'*38}")
    if all_ok:
        print("✅ CONVEX SYNC OK — semua data tersimpan")
    else:
        print("❌ CONVEX SYNC — ada error, cek di atas")
    print(f"{'━'*38}")
    return all_ok

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
