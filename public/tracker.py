#!/usr/bin/env python3
"""
Compass macOS Activity Tracker
Runs as a background process, auto-starts via LaunchAgent.
Requires: pyobjc-framework-Cocoa, schedule, requests
"""

import json
import os
import sqlite3
import time
import subprocess
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path

import requests
import schedule

# ── Config ────────────────────────────────────────────────────────
CONFIG_DIR = Path.home() / '.compass'
CONFIG_FILE = CONFIG_DIR / 'config.json'
DB_FILE = CONFIG_DIR / 'events.db'
SUPABASE_URL  = None
ANON_KEY      = None  # Supabase anon key — used for API auth
AGENT_TOKEN   = None  # agent_token from users table — sent as x-agent-token header
USER_ID       = None
SESSION_ID    = None  # polled from users.active_session_id

IDLE_THRESHOLD_SECONDS = 300  # 5 minutes
SESSION_POLL_INTERVAL  = 30   # seconds between active_session_id polls

# ── SQLite local buffer ───────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS pending_events (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            attempts INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def buffer_event(payload: dict):
    conn = sqlite3.connect(DB_FILE)
    conn.execute(
        'INSERT INTO pending_events (id, payload, created_at) VALUES (?, ?, ?)',
        (str(uuid.uuid4()), json.dumps(payload), datetime.now(timezone.utc).isoformat())
    )
    conn.commit()
    conn.close()

def flush_buffer():
    """Attempt to send buffered events to Supabase."""
    conn = sqlite3.connect(DB_FILE)
    rows = conn.execute(
        'SELECT id, payload FROM pending_events WHERE attempts < 5 ORDER BY created_at LIMIT 50'
    ).fetchall()
    conn.close()

    if not rows:
        return

    headers = _auth_headers()
    if not headers:
        return

    for row_id, payload_str in rows:
        payload = json.loads(payload_str)
        try:
            r = requests.post(
                f"{SUPABASE_URL}/rest/v1/raw_events",
                headers=headers,
                json=payload,
                timeout=5
            )
            if r.status_code in (200, 201):
                conn = sqlite3.connect(DB_FILE)
                conn.execute('DELETE FROM pending_events WHERE id = ?', (row_id,))
                conn.commit()
                conn.close()
            else:
                _increment_attempts(row_id)
        except Exception:
            _increment_attempts(row_id)

def _increment_attempts(row_id: str):
    conn = sqlite3.connect(DB_FILE)
    conn.execute('UPDATE pending_events SET attempts = attempts + 1 WHERE id = ?', (row_id,))
    conn.commit()
    conn.close()

# ── Config loading ────────────────────────────────────────────────
def load_config():
    global SUPABASE_URL, ANON_KEY, AGENT_TOKEN, USER_ID
    if not CONFIG_FILE.exists():
        return False
    with open(CONFIG_FILE) as f:
        config = json.load(f)
    SUPABASE_URL = config.get('supabase_url')
    ANON_KEY     = config.get('anon_key')
    AGENT_TOKEN  = config.get('token')
    USER_ID      = config.get('user_id')
    return bool(SUPABASE_URL and ANON_KEY and AGENT_TOKEN and USER_ID)

def _auth_headers():
    if not ANON_KEY or not AGENT_TOKEN:
        return None
    return {
        'apikey':        ANON_KEY,
        'Authorization': f'Bearer {ANON_KEY}',
        'x-agent-token': AGENT_TOKEN,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
    }

# ── Active session polling ────────────────────────────────────────
def poll_active_session():
    """Fetch users.active_session_id from Supabase every 30 s."""
    global SESSION_ID
    headers = _auth_headers()
    if not headers or not USER_ID:
        return
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/users",
            headers={**headers, 'Accept': 'application/json'},
            params={'id': f'eq.{USER_ID}', 'select': 'active_session_id'},
            timeout=5,
        )
        if r.status_code == 200:
            rows = r.json()
            if rows:
                SESSION_ID = rows[0].get('active_session_id')
    except Exception:
        pass

# ── macOS activity detection ──────────────────────────────────────
def get_frontmost_app() -> dict:
    """Get frontmost app name and bundle ID via NSWorkspace."""
    try:
        from AppKit import NSWorkspace
        app = NSWorkspace.sharedWorkspace().frontmostApplication()
        return {
            'app_name': app.localizedName(),
            'bundle_id': app.bundleIdentifier(),
        }
    except Exception:
        return {'app_name': None, 'bundle_id': None}

BROWSER_BUNDLES = {
    'com.google.Chrome', 'com.apple.Safari',
    'org.mozilla.firefox', 'com.microsoft.edgemac',
}

def get_browser_tab(bundle_id: str) -> dict:
    """Get active tab title and URL via AppleScript."""
    scripts = {
        'com.google.Chrome': '''
            tell application "Google Chrome"
                if (count of windows) > 0 then
                    set t to title of active tab of front window
                    set u to URL of active tab of front window
                    return t & "\n" & u
                end if
            end tell
        ''',
        'com.apple.Safari': '''
            tell application "Safari"
                if (count of windows) > 0 then
                    set t to name of current tab of front window
                    set u to URL of current tab of front window
                    return t & "\n" & u
                end if
            end tell
        ''',
        'org.mozilla.firefox': '''
            tell application "Firefox"
                if (count of windows) > 0 then
                    return name of front window & "\n"
                end if
            end tell
        ''',
        'com.microsoft.edgemac': '''
            tell application "Microsoft Edge"
                if (count of windows) > 0 then
                    set t to title of active tab of front window
                    set u to URL of active tab of front window
                    return t & "\n" & u
                end if
            end tell
        ''',
    }
    script = scripts.get(bundle_id)
    if not script:
        return {'tab_title': None, 'tab_url': None}
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True, text=True, timeout=2
        )
        lines = result.stdout.strip().split('\n')
        return {
            'tab_title': lines[0] if len(lines) > 0 else None,
            'tab_url': lines[1] if len(lines) > 1 else None,
        }
    except Exception:
        return {'tab_title': None, 'tab_url': None}

def is_user_idle() -> bool:
    """Check if user has been idle for more than IDLE_THRESHOLD_SECONDS."""
    try:
        result = subprocess.run(
            ['ioreg', '-c', 'IOHIDSystem'],
            capture_output=True, text=True, timeout=2
        )
        for line in result.stdout.split('\n'):
            if 'HIDIdleTime' in line:
                idle_ns = int(line.split('=')[-1].strip())
                idle_seconds = idle_ns / 1_000_000_000
                return idle_seconds > IDLE_THRESHOLD_SECONDS
    except Exception:
        pass
    return False

# ── Main tracking loop ────────────────────────────────────────────
def track():
    """Called every 10 seconds."""
    if not load_config():
        return  # no token, skip

    idle = is_user_idle()
    app_info = get_frontmost_app()
    tab_info = {'tab_title': None, 'tab_url': None}

    if not idle and app_info['bundle_id'] in BROWSER_BUNDLES:
        tab_info = get_browser_tab(app_info['bundle_id'])

    payload = {
        'user_id':    USER_ID,
        'app_name':   app_info['app_name'],
        'bundle_id':  app_info['bundle_id'],
        'tab_title':  tab_info['tab_title'],
        'tab_url':    tab_info['tab_url'],
        'is_idle':    idle,
        'session_id': SESSION_ID,
        'recorded_at': datetime.now(timezone.utc).isoformat(),
    }

    headers = _auth_headers()
    if not headers:
        buffer_event(payload)
        return

    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/raw_events",
            headers=headers,
            json=payload,
            timeout=5
        )
        if r.status_code not in (200, 201):
            buffer_event(payload)
    except Exception:
        buffer_event(payload)

def main():
    CONFIG_DIR.mkdir(exist_ok=True)
    init_db()

    print(f"[compass-tracker] Starting. Config: {CONFIG_FILE}")

    schedule.every(10).seconds.do(track)
    schedule.every(30).seconds.do(poll_active_session)
    schedule.every(60).seconds.do(flush_buffer)

    # Prime session on startup
    poll_active_session()

    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == '__main__':
    main()
