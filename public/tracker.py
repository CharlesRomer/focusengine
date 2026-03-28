#!/usr/bin/env python3
"""
Compass macOS Activity Tracker
Tracks time spent in each app/tab by detecting switches.
Sends completed sessions to Supabase every 10 minutes.
Requires: pyobjc-framework-Cocoa, requests
"""

import json
import sqlite3
import time
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Config ────────────────────────────────────────────────────────
CONFIG_DIR  = Path.home() / '.compass'
CONFIG_FILE = CONFIG_DIR / 'config.json'
DB_FILE     = CONFIG_DIR / 'sessions.db'

SUPABASE_URL = None
ANON_KEY     = None
AGENT_TOKEN  = None
USER_ID      = None
SESSION_ID   = None  # active focus session id (polled every 30s)

POLL_INTERVAL        = 5    # seconds between app/tab checks
SESSION_POLL_SECS    = 30   # seconds between active_session_id polls
FLUSH_INTERVAL_SECS  = 600  # send to Supabase every 10 minutes
IDLE_THRESHOLD_SECS  = 300  # 5 minutes idle = close current session

# ── Current session state ─────────────────────────────────────────
_cur = {
    'app_name':   None,
    'bundle_id':  None,
    'tab_url':    None,
    'tab_title':  None,
    'started_at': None,
}
_pending   = []   # completed sessions waiting to flush
_last_flush        = time.time()
_last_session_poll = 0.0

# ── SQLite offline buffer ─────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS pending_sessions (
            id         TEXT PRIMARY KEY,
            payload    TEXT NOT NULL,
            created_at TEXT NOT NULL,
            attempts   INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def buffer_to_disk(sessions: list):
    conn = sqlite3.connect(DB_FILE)
    for s in sessions:
        conn.execute(
            'INSERT OR IGNORE INTO pending_sessions (id, payload, created_at) VALUES (?, ?, ?)',
            (str(uuid.uuid4()), json.dumps(s), datetime.now(timezone.utc).isoformat())
        )
    conn.commit()
    conn.close()

def flush_disk_buffer():
    conn = sqlite3.connect(DB_FILE)
    rows = conn.execute(
        'SELECT id, payload FROM pending_sessions WHERE attempts < 5 ORDER BY created_at LIMIT 100'
    ).fetchall()
    conn.close()
    if not rows:
        return
    headers = _auth_headers()
    if not headers:
        return
    for row_id, payload_str in rows:
        ok = _send_session(json.loads(payload_str), headers)
        conn = sqlite3.connect(DB_FILE)
        if ok:
            conn.execute('DELETE FROM pending_sessions WHERE id = ?', (row_id,))
        else:
            conn.execute('UPDATE pending_sessions SET attempts = attempts + 1 WHERE id = ?', (row_id,))
        conn.commit()
        conn.close()

# ── Config + auth ─────────────────────────────────────────────────
def load_config() -> bool:
    global SUPABASE_URL, ANON_KEY, AGENT_TOKEN, USER_ID
    if not CONFIG_FILE.exists():
        return False
    with open(CONFIG_FILE) as f:
        c = json.load(f)
    SUPABASE_URL = c.get('supabase_url')
    ANON_KEY     = c.get('anon_key')
    AGENT_TOKEN  = c.get('token')
    USER_ID      = c.get('user_id')
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

# ── macOS helpers ─────────────────────────────────────────────────
def get_frontmost_app() -> dict:
    try:
        from AppKit import NSWorkspace
        app = NSWorkspace.sharedWorkspace().frontmostApplication()
        return {'app_name': app.localizedName(), 'bundle_id': app.bundleIdentifier()}
    except Exception:
        return {'app_name': None, 'bundle_id': None}

BROWSER_BUNDLES = {'com.google.Chrome', 'com.apple.Safari', 'org.mozilla.firefox', 'com.microsoft.edgemac'}

def get_browser_tab(bundle_id: str) -> dict:
    scripts = {
        'com.google.Chrome':  'tell application "Google Chrome" to if (count of windows)>0 then return (URL of active tab of front window)&"\n"&(title of active tab of front window)',
        'com.apple.Safari':   'tell application "Safari" to if (count of windows)>0 then return (URL of current tab of front window)&"\n"&(name of current tab of front window)',
        'com.microsoft.edgemac': 'tell application "Microsoft Edge" to if (count of windows)>0 then return (URL of active tab of front window)&"\n"&(title of active tab of front window)',
    }
    script = scripts.get(bundle_id)
    if not script:
        return {'tab_url': None, 'tab_title': None}
    try:
        r = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=2)
        parts = r.stdout.strip().split('\n', 1)
        return {
            'tab_url':   parts[0] if parts else None,
            'tab_title': parts[1] if len(parts) > 1 else None,
        }
    except Exception:
        return {'tab_url': None, 'tab_title': None}

def get_idle_seconds() -> float:
    try:
        r = subprocess.run(['ioreg', '-c', 'IOHIDSystem'], capture_output=True, text=True, timeout=2)
        for line in r.stdout.split('\n'):
            if 'HIDIdleTime' in line:
                return int(line.split('=')[-1].strip()) / 1_000_000_000
    except Exception:
        pass
    return 0.0

# ── Session management ────────────────────────────────────────────
def _close_current(now: datetime):
    """Close the current session and add to pending list."""
    if not _cur['started_at'] or not _cur['app_name']:
        return
    duration = (now - _cur['started_at']).total_seconds()
    if duration < 2:
        return
    _pending.append({
        'user_id':          USER_ID,
        'team_org_id':      None,   # filled server-side if needed
        'app_name':         _cur['app_name'],
        'bundle_id':        _cur['bundle_id'],
        'tab_url':          _cur['tab_url'],
        'tab_title':        _cur['tab_title'],
        'started_at':       _cur['started_at'].isoformat(),
        'ended_at':         now.isoformat(),
        'duration_seconds': int(duration),
        'session_id':       SESSION_ID,
        'category':         'untracked',
    })

def _start_session(now: datetime, app_name, bundle_id, tab_url, tab_title):
    _cur['app_name']   = app_name
    _cur['bundle_id']  = bundle_id
    _cur['tab_url']    = tab_url
    _cur['tab_title']  = tab_title
    _cur['started_at'] = now

# ── Active session polling ────────────────────────────────────────
def poll_active_session():
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
        if r.status_code == 200 and r.json():
            SESSION_ID = r.json()[0].get('active_session_id')
    except Exception:
        pass

# ── Send sessions to Supabase ─────────────────────────────────────
def _send_session(payload: dict, headers: dict) -> bool:
    """Send one session to activity_events. Returns True on success."""
    # Look up team_org_id if not set
    if not payload.get('team_org_id'):
        try:
            r = requests.get(
                f"{SUPABASE_URL}/rest/v1/users",
                headers={**headers, 'Accept': 'application/json'},
                params={'id': f'eq.{USER_ID}', 'select': 'team_org_id'},
                timeout=5,
            )
            if r.status_code == 200 and r.json():
                payload['team_org_id'] = r.json()[0].get('team_org_id')
        except Exception:
            pass

    if not payload.get('team_org_id'):
        return False

    # Remove keys not in activity_events schema
    data = {k: v for k, v in payload.items() if k in (
        'user_id', 'team_org_id', 'app_name', 'bundle_id',
        'tab_url', 'tab_title', 'started_at', 'ended_at',
        'duration_seconds', 'session_id', 'category',
    )}
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/activity_events",
            headers=headers, json=data, timeout=5,
        )
        return r.status_code in (200, 201)
    except Exception:
        return False

def flush_pending():
    """Send all pending sessions to Supabase. Buffer failures to disk."""
    global _pending
    if not _pending:
        return
    headers = _auth_headers()
    if not headers:
        buffer_to_disk(_pending)
        _pending = []
        return

    failed = []
    for session in _pending:
        if not _send_session(session, headers):
            failed.append(session)

    if failed:
        buffer_to_disk(failed)

    _pending = []
    flush_disk_buffer()  # retry previously failed sessions too

# ── Main loop ─────────────────────────────────────────────────────
def main():
    global _last_flush, _last_session_poll

    CONFIG_DIR.mkdir(exist_ok=True)
    init_db()

    if not load_config():
        print('[compass-tracker] No config found at ~/.compass/config.json — exiting.')
        return

    print(f'[compass-tracker] Started. Polling every {POLL_INTERVAL}s, flushing every {FLUSH_INTERVAL_SECS//60}min.')

    poll_active_session()
    _last_session_poll = time.time()

    while True:
        now = datetime.now(timezone.utc)
        t   = time.time()

        # Poll active session every 30s
        if t - _last_session_poll >= SESSION_POLL_SECS:
            poll_active_session()
            _last_session_poll = t

        idle_secs = get_idle_seconds()
        is_idle   = idle_secs >= IDLE_THRESHOLD_SECS

        if is_idle:
            # Close current session when user goes idle
            if _cur['app_name'] and _cur['app_name'] != '__idle__':
                _close_current(now)
                _start_session(now, '__idle__', None, None, None)
        else:
            app  = get_frontmost_app()
            app_name  = app['app_name']
            bundle_id = app['bundle_id']
            tab_url, tab_title = None, None

            if bundle_id in BROWSER_BUNDLES:
                tab = get_browser_tab(bundle_id)
                tab_url   = tab['tab_url']
                tab_title = tab['tab_title']

            # Detect app or tab switch
            if (app_name != _cur['app_name'] or tab_url != _cur['tab_url']):
                _close_current(now)
                _start_session(now, app_name, bundle_id, tab_url, tab_title)

        # Flush to Supabase every 10 minutes
        if t - _last_flush >= FLUSH_INTERVAL_SECS:
            _close_current(now)  # snapshot current session before flush
            _start_session(now, _cur['app_name'], _cur['bundle_id'], _cur['tab_url'], _cur['tab_title'])
            flush_pending()
            _last_flush = t

        time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()
