#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_messages_to_convex.py - Batch sync messages to Convex (optimized)

Fixes:
1. Skip per-message exists check - rely on unique constraint
2. Batch size 100 messages
3. Per-session timeout (60s)
4. Progress tracking
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from typing import List, Dict, Any, Optional

# Fix Windows encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Load .env.local if exists
def load_env_file():
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())

load_env_file()

# Config
CONVEX_URL = os.environ.get("CONVEX_SELF_HOSTED_URL", "https://api.<YOUR_DOMAIN>")
CONVEX_ADMIN_KEY = os.environ.get("CONVEX_SELF_HOSTED_ADMIN_KEY", "")
BATCH_SIZE = 100
SESSION_TIMEOUT = 60  # seconds per session
REQUEST_TIMEOUT = 30  # seconds per API call
DEBUG = os.environ.get("SYNC_DEBUG", "").lower() in ("1", "true")

def convex_mutation(function_name: str, args: dict) -> dict:
    """Call Convex mutation via HTTP."""
    url = f"{CONVEX_URL}/api/mutation"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Convex {CONVEX_ADMIN_KEY}",
    }
    payload = {
        "path": function_name,
        "args": args,
    }
    
    if DEBUG:
        print(f"  [DEBUG] POST {function_name}")
    
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        if DEBUG:
            print(f"  [DEBUG] Status: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        print(f"  [ERROR] HTTP {e.response.status_code}: {e.response.text[:300]}")
        raise
    except Exception as e:
        print(f"  [ERROR] {type(e).__name__}: {e}")
        raise

def batch_insert_messages(session_id: str, messages: List[Dict[str, Any]], agent_id: Optional[str] = None) -> int:
    """Insert batch of messages without exists check."""
    if not messages:
        return 0
    
    args = {
        "sessionId": session_id,
        "messages": messages,
    }
    if agent_id:
        args["agentId"] = agent_id
    
    try:
        result = convex_mutation("sessions:batchLogMessages", args)
        if DEBUG:
            print(f"  [DEBUG] Batch result: {result}")
        
        # Handle response format
        if isinstance(result, dict):
            if result.get("status") == "success":
                return result.get("value", {}).get("inserted", 0)
            elif "inserted" in result:
                return result.get("inserted", 0)
        return 0
    except Exception as e:
        print(f"  [!] Batch insert error: {e}")
        return 0

def sync_session(session_key: str, messages: List[Dict[str, Any]], agent_id: Optional[str] = None) -> dict:
    """Sync all messages for a single session with timeout."""
    start_time = time.time()
    
    # 1. Upsert session
    args = {"sessionKey": session_key}
    if agent_id:
        args["agentId"] = agent_id
    
    try:
        session_result = convex_mutation("sessions:upsert", args)
        # Extract session ID from response
        if isinstance(session_result, dict):
            if session_result.get("status") == "success":
                session_id = session_result.get("value")
            else:
                return {"error": f"Session upsert failed: {session_result}", "inserted": 0}
        else:
            session_id = session_result
        
        if DEBUG:
            print(f"  [DEBUG] Session ID: {session_id}")
        
        if not session_id:
            return {"error": "No session ID returned", "inserted": 0}
    except Exception as e:
        return {"error": f"Session upsert failed: {e}", "inserted": 0}
    
    # 2. Batch insert messages
    total_inserted = 0
    batches = [messages[i:i + BATCH_SIZE] for i in range(0, len(messages), BATCH_SIZE)]
    
    for i, batch in enumerate(batches):
        # Check timeout
        if time.time() - start_time > SESSION_TIMEOUT:
            print(f"  [T] Session timeout after {i} batches")
            break
        
        # Prepare batch format - only include non-null optional fields
        formatted_batch = []
        for msg in batch:
            formatted_msg = {
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
                "timestamp": msg.get("timestamp", int(time.time() * 1000)),
            }
            # Only add optional fields if they have values
            external_id = msg.get("externalId") or msg.get("id")
            if external_id:
                formatted_msg["externalId"] = external_id
            
            token_count = msg.get("tokenCount")
            if token_count is not None:
                formatted_msg["tokenCount"] = token_count
            
            metadata = msg.get("metadata")
            if metadata is not None:
                formatted_msg["metadata"] = metadata
            
            formatted_batch.append(formatted_msg)
        
        inserted = batch_insert_messages(session_id, formatted_batch, agent_id)
        total_inserted += inserted
        
        if (i + 1) % 10 == 0:
            print(f"  [B] Batch {i + 1}/{len(batches)} - {total_inserted} messages")
    
    elapsed = time.time() - start_time
    return {
        "sessionKey": session_key,
        "inserted": total_inserted,
        "total": len(messages),
        "batches": len(batches),
        "elapsed_seconds": round(elapsed, 2),
    }

def sync_from_jsonl(jsonl_path: str) -> dict:
    """Sync messages from JSONL file (grouped by session)."""
    # Group messages by session
    sessions: Dict[str, List[Dict]] = {}
    
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            msg = json.loads(line)
            session_key = msg.get("sessionKey") or msg.get("session_id") or "default"
            
            if session_key not in sessions:
                sessions[session_key] = []
            sessions[session_key].append(msg)
    
    # Sync each session
    results = []
    for session_key, messages in sessions.items():
        print(f"\n[*] Syncing session: {session_key} ({len(messages)} messages)")
        result = sync_session(session_key, messages)
        results.append(result)
        print(f"  [+] Done: {result.get('inserted', 0)} inserted in {result.get('elapsed_seconds', 0)}s")
    
    return {
        "sessions": len(sessions),
        "results": results,
        "total_inserted": sum(r.get("inserted", 0) for r in results),
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_messages_to_convex.py <jsonl_file>")
        sys.exit(1)
    
    jsonl_path = sys.argv[1]
    if not os.path.exists(jsonl_path):
        print(f"[X] File not found: {jsonl_path}")
        sys.exit(1)
    
    print(f"[>] Starting sync from: {jsonl_path}")
    print(f"    Convex URL: {CONVEX_URL}")
    print(f"    Batch size: {BATCH_SIZE}")
    print(f"    Session timeout: {SESSION_TIMEOUT}s")
    
    result = sync_from_jsonl(jsonl_path)
    
    print(f"\n[OK] Sync complete!")
    print(f"    Sessions: {result['sessions']}")
    print(f"    Total inserted: {result['total_inserted']}")
