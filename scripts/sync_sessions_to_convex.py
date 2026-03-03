#!/usr/bin/env python3
"""sync_sessions_to_convex.py — Sync OpenClaw sessions ke Convex (user-scoped)."""

import subprocess, json, os
from datetime import datetime, timezone

ADMIN_KEY   = "rahmanef-convex|01365a724e228c4bffd8f1e0bcc36f9ace8a551df04299000957a30162348e10bc2c820a4e"
AGENTS_DIR  = os.path.expanduser("~/.openclaw/agents")
TMP_ARGS    = "/tmp/_convex_session_args.json"
CTR_ARGS    = "/tmp/_convex_session_args.json"
TENANT_ID   = os.environ.get("APP_TENANT_ID", "rahman-main")


def run_convex(fn, args_dict):
    with open(TMP_ARGS, "w", encoding="utf-8") as f:
        json.dump(args_dict, f, ensure_ascii=False)
    cp = subprocess.run(
        ["sudo", "docker", "cp", TMP_ARGS, f"convex-backend-1:{CTR_ARGS}"],
        capture_output=True, text=True, timeout=10
    )
    if cp.returncode != 0:
        return False, f"docker cp failed: {cp.stderr}"
    cmd = (
        f"cd /tmp/openclaw-data && "
        f"CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 "
        f"CONVEX_SELF_HOSTED_ADMIN_KEY='{ADMIN_KEY}' "
        f"SENTRY_DSN= CONVEX_DISABLE_SENTRY=1 NO_TELEMETRY=1 "
        f'npx convex run {fn} "$(cat {CTR_ARGS})"'
    )
    result = subprocess.run(
        ["sudo", "docker", "exec", "convex-backend-1", "sh", "-c", cmd],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return False, result.stdout.strip() or result.stderr.strip()
    out = (result.stdout or "").strip()
    if not out:
        return True, None
    try:
        return True, json.loads(out)
    except Exception:
        return True, out


def _normalize_user_token(token: str) -> str:
    if not token:
        return "unknown"
    t = token.strip().lower()
    if t.startswith("telegram:") or t.startswith("whatsapp:") or t.startswith("signal:"):
        t = t.split(":", 1)[1]
    if t.startswith("+"):
        t = t[1:]
    t = t.replace("@s.whatsapp.net", "").replace("@lid", "")
    return "".join(ch for ch in t if ch.isalnum() or ch in ("_", "-", ".")) or "unknown"


def derive_user_scope(info, fallback_channel="unknown"):
    origin = info.get("origin", {}) or {}
    delivery = info.get("deliveryContext", {}) or {}
    channel = (delivery.get("channel") or origin.get("provider") or fallback_channel or "unknown").lower()

    candidates = [
        origin.get("from"),
        delivery.get("to"),
        origin.get("to"),
        info.get("lastTo"),
    ]

    raw = next((x for x in candidates if isinstance(x, str) and x.strip()), None)
    user_token = _normalize_user_token(raw or "")
    return channel, user_token, raw or ""


def count_messages_in_jsonl(jsonl_path):
    if not jsonl_path or not os.path.exists(jsonl_path):
        return 0
    count = 0
    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    if d.get("type") == "message" and d.get("message", {}).get("role") in ("user", "assistant"):
                        count += 1
                except Exception:
                    pass
    except Exception:
        pass
    return count


def get_session_timestamps(jsonl_path):
    if not jsonl_path or not os.path.exists(jsonl_path):
        return None, None
    first_ts = last_ts = None
    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    ts = d.get("timestamp")
                    if ts:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        ms = int(dt.timestamp() * 1000)
                        if first_ts is None or ms < first_ts:
                            first_ts = ms
                        if last_ts is None or ms > last_ts:
                            last_ts = ms
                except Exception:
                    pass
    except Exception:
        pass
    return first_ts, last_ts


def parse_sessions(agent_id):
    sessions_json = os.path.join(AGENTS_DIR, agent_id, "sessions", "sessions.json")
    if not os.path.exists(sessions_json):
        return []
    with open(sessions_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    sessions = []
    for session_key, info in data.items():
        session_id = info.get("sessionId", "")
        origin = info.get("origin", {}) or {}
        delivery = info.get("deliveryContext", {}) or {}
        channel = (delivery.get("channel") or origin.get("provider") or "unknown").lower()
        label = origin.get("label", "")
        updated_at = info.get("updatedAt", 0)
        jsonl_file = info.get("sessionFile") or ""

        if not jsonl_file and session_id:
            candidate = os.path.join(AGENTS_DIR, agent_id, "sessions", f"{session_id}.jsonl")
            if os.path.exists(candidate):
                jsonl_file = candidate

        msg_count = count_messages_in_jsonl(jsonl_file)
        first_ts, last_ts = get_session_timestamps(jsonl_file)
        jsonl_size = os.path.getsize(jsonl_file) if jsonl_file and os.path.exists(jsonl_file) else 0

        scoped_channel, user_token, raw_user_ref = derive_user_scope(info, fallback_channel=channel)
        canonical_session_key = f"{scoped_channel}:{user_token}:{agent_id}"

        sessions.append({
            "sessionKey": session_key,
            "canonicalSessionKey": canonical_session_key,
            "sessionId": session_id,
            "agentId": agent_id,
            "channel": scoped_channel,
            "userToken": user_token,
            "rawUserRef": raw_user_ref,
            "label": label,
            "updatedAt": updated_at,
            "messageCount": msg_count,
            "jsonlFile": jsonl_file,
            "jsonlSizeKb": round(jsonl_size / 1024, 1),
            "firstTs": first_ts,
            "lastTs": last_ts,
        })
    return sessions


def get_or_create_user_id(user_token, label=""):
    # Keep compatibility: still resolves user profile quickly.
    ok, data = run_convex("userProfiles:getOrCreate", {
        "phone": user_token,
        "name": label or None,
    })
    if not ok or not data:
        return None
    if isinstance(data, dict):
        return data.get("_id")
    return None


def upsert_user_identity(user_id, channel, external_user_id, label=""):
    if not user_id:
        return
    run_convex("userIdentities:upsert", {
        "userId": user_id,
        "channel": channel,
        "externalUserId": external_user_id,
        "verified": True if external_user_id != "unknown" else False,
        "confidence": 1,
        "metadata": {"label": label or None},
    })


def sync_session(s):
    user_key = f"{s['channel']}:{s['userToken']}"
    user_id = get_or_create_user_id(user_key, s.get("label", ""))
    upsert_user_identity(user_id, s["channel"], s["userToken"], s.get("label", ""))

    payload = {
        "sessionKey": s["canonicalSessionKey"],
        "channel": s["channel"],
        "agentId": s["agentId"],
        "metadata": {
            "originalSessionKey": s["sessionKey"],
            "sessionId": s["sessionId"],
            "label": s["label"],
            "messageCount": s["messageCount"],
            "jsonlSizeKb": s["jsonlSizeKb"],
            "firstMessageAt": s["firstTs"],
            "lastMessageAt": s["lastTs"],
            "rawUserRef": s["rawUserRef"],
            "userToken": s["userToken"],
            "scoped": True,
            "scopeVersion": 1,
        },
    }
    if user_id:
        payload["userId"] = user_id

    payload["tenantId"] = TENANT_ID
    ok, out = run_convex("sessions:upsertScoped", payload)
    return ok, out


def main():
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"🔄 Session Sync Report — {now_utc}\n")

    agent_dirs = [
        d for d in os.listdir(AGENTS_DIR)
        if os.path.isdir(os.path.join(AGENTS_DIR, d, "sessions"))
        and os.path.exists(os.path.join(AGENTS_DIR, d, "sessions", "sessions.json"))
    ]

    total_synced = total_errors = 0

    for agent_id in sorted(agent_dirs):
        sessions = parse_sessions(agent_id)
        if not sessions:
            continue
        print(f"📦 Agent: {agent_id} ({len(sessions)} session(s))")
        for s in sessions:
            ok, detail = sync_session(s)
            if ok:
                total_synced += 1
                print(f"  ✅ {s['sessionKey']} -> {s['canonicalSessionKey']}")
                print(f"     channel={s['channel']}, user={s['userToken']}, messages={s['messageCount']}")
            else:
                total_errors += 1
                print(f"  ❌ {s['sessionKey']} — sync FAILED ({detail})")
        print()

    print("=" * 44)
    print("📊 Summary:")
    print(f"  Sessions synced: {total_synced}")
    if total_errors:
        print(f"  ❌ Errors      : {total_errors}")
    else:
        print("  ✅ No errors — all sessions in Convex!")
    print("  🔗 Dashboard: https://db.rahmanef.com")


if __name__ == "__main__":
    main()
