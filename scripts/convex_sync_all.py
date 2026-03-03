#!/usr/bin/env python3
"""convex_sync_all.py — Master sync: workspace files + sessions + messages ke Convex.
Dipanggil dari heartbeat. Print ringkasan status."""

import os
import subprocess
import sys
from datetime import datetime, timezone

SCRIPTS = os.path.dirname(os.path.abspath(__file__))

# Windows-safe stdout (avoid UnicodeEncodeError)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_script(script, timeout_sec=300):
    path = os.path.join(SCRIPTS, script)
    if not os.path.exists(path):
        # Optional script missing: skip without failing full run
        return True, f"[SKIP] {script} not found", ""
    try:
        result = subprocess.run(
            [sys.executable, path],
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
    print("=" * 44)
    print(f"  Convex Sync - {now}")
    print("=" * 44)

    all_ok = True

    sequence = [
        ("sync_to_convex.py", 420),
        ("sync_agents_registry_to_convex.py", 240),
        ("sync_system_docs_to_convex.py", 180),
        ("sync_sessions_to_convex.py", 240),
        ("sync_messages_to_convex.py", 300),
        ("sync_session_summaries.py", 180),
    ]

    for script, timeout_sec in sequence:
        ok, out, err = run_script(script, timeout_sec=timeout_sec)
        if out.strip():
            print(out.strip())
        if not ok:
            all_ok = False
            if err:
                print("STDERR:", err[:500])
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
