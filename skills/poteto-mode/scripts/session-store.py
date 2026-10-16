#!/usr/bin/env python3
# Read-only listing and phrase search over the local ZCode session store.
# Every query opens the store with mode=ro (immutable=1 is never used), scopes
# to one workspace directory, and keeps interactive sessions only — subagent
# and other non-interactive noise stays out. Access is fail-closed: file ->
# read-only open -> required tables/columns -> sess_% id sentinel; any failure
# prints one reason line to stderr and exits 3, and the caller falls back to
# asking the user for session ids. Listed ids feed ReadSessionContext
# unchanged.
#
# Usage, from the workspace root:
#   session-store.py probe
#   session-store.py list   [--limit N] [--days N] [--dir PATH] [--db PATH]
#   session-store.py search PHRASE [--limit N] [--days N] [--dir PATH] [--db PATH]
# Output is TSV with a header row. --days 0 means no time window.

import argparse
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

EXIT_FALLBACK = 3

DEFAULT_DB = Path.home() / ".zcode" / "cli" / "db" / "db.sqlite"

REQUIRED_COLUMNS = {
    "session": {"id", "directory", "title", "task_type", "time_created", "time_updated"},
    "message": {"session_id", "time_created", "data"},
    "part": {"session_id", "message_id", "data"},
}

_norm_cache = {}


def fail(reason):
    print(f"session-store: {reason}", file=sys.stderr)
    sys.exit(EXIT_FALLBACK)


def open_ro(db_path):
    # mode=ro only. immutable=1 is forbidden: it skips the wal-index and can
    # read a stale snapshot while the host is writing.
    uri = f"{Path(db_path).resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def probe(conn):
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    for table in REQUIRED_COLUMNS:
        if table not in tables:
            fail(f"missing table: {table}")
    for table, columns in REQUIRED_COLUMNS.items():
        present = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        missing = columns - present
        if missing:
            fail(f"table {table} missing columns: {', '.join(sorted(missing))}")
    if not conn.execute(
            "SELECT 1 FROM session WHERE id LIKE 'sess_%' LIMIT 1").fetchone():
        fail("no sess_% ids in session table")


def norm_dir(path):
    # Cached: the store holds few distinct directories. normcase lowercases and
    # forces backslashes; realpath expands Windows 8.3 short forms (ADMINI~1)
    # when the path still exists, so short-form rows still match.
    key = os.path.normcase(path)
    if key not in _norm_cache:
        _norm_cache[key] = os.path.normcase(
            os.path.realpath(os.path.abspath(path))).rstrip("\\")
    return _norm_cache[key]


def scoped_sessions(conn, scope_dir, days):
    cutoff = 0
    if days:
        cutoff = int((datetime.now().timestamp() - days * 86400) * 1000)
    rows = conn.execute(
        "SELECT id, title, directory, time_created, time_updated FROM session "
        "WHERE task_type = 'interactive' AND time_updated >= ? "
        "ORDER BY time_updated DESC", (cutoff,)).fetchall()
    scope = norm_dir(scope_dir)
    return [(r[0], r[1], r[3], r[4]) for r in rows if norm_dir(r[2]) == scope]


def fmt_ts(ms):
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M")


def like_pattern(phrase):
    escaped = phrase.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def one_line(text):
    return " ".join(str(text).split())


def cmd_list(conn, args):
    sessions = scoped_sessions(conn, args.dir, args.days)[:args.limit]
    print("ID\tUPDATED\tCREATED\tTITLE")
    for sid, title, created, updated in sessions:
        print(f"{sid}\t{fmt_ts(updated)}\t{fmt_ts(created)}\t{one_line(title)}")


def cmd_search(conn, args):
    sessions = scoped_sessions(conn, args.dir, args.days)
    # Index-narrowed: candidates come from the indexed session columns above,
    # then each session's parts are read through the part(session_id) index —
    # never a full scan of part.
    pattern = like_pattern(args.phrase)
    hits = 0
    print("SESSION_ID\tSNIPPET")
    for sid, title, _, _ in sessions:
        rows = conn.execute(
            "SELECT CASE WHEN json_valid(data) "
            "  THEN substr(json_extract(data, '$.text'), 1, 80) END "
            "FROM part "
            "WHERE session_id = ? AND data LIKE ? ESCAPE '\\' "
            "  AND CASE WHEN json_valid(data) "
            "       THEN json_extract(data, '$.type') END = 'text' "
            "LIMIT 3", (sid, pattern)).fetchall()
        for (snippet,) in rows:
            print(f"{sid}\t{one_line(snippet or '')}")
            hits += 1
            if hits >= args.limit:
                return
    if not hits:
        print("(no matches)", file=sys.stderr)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(
        description="Read-only listing/search over the local ZCode session store.")
    ap.add_argument("command", choices=["probe", "list", "search"])
    ap.add_argument("phrase", nargs="?", help="phrase to search for")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--days", type=int, default=None,
                    help="time window in days; 0 = no window")
    ap.add_argument("--dir", default=os.getcwd(),
                    help="workspace directory to scope to (default: cwd)")
    ap.add_argument("--db", default=str(DEFAULT_DB),
                    help=f"store path (default: {DEFAULT_DB})")
    args = ap.parse_args()
    if args.command == "search" and not args.phrase:
        ap.error("search needs a phrase")
    if args.limit is None:
        args.limit = 15 if args.command == "list" else 8
    if args.days is None:
        args.days = 0 if args.command == "list" else 30

    if not os.path.isfile(args.db):
        fail(f"session store not found: {args.db}")
    try:
        conn = open_ro(args.db)
    except sqlite3.Error as exc:
        fail(f"cannot open read-only: {exc}")
    try:
        probe(conn)
        if args.command == "probe":
            print("ok")
        elif args.command == "list":
            cmd_list(conn, args)
        else:
            cmd_search(conn, args)
    except sqlite3.Error as exc:
        fail(f"query failed: {exc}")


if __name__ == "__main__":
    main()
