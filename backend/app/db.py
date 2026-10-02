import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv("CAREERPILOT_DB_PATH", str(DB_DIR / "careerpilot.db")))


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_connection():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _ensure_column(conn, table, column, definition):
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    with db_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_state (
                user_id INTEGER PRIMARY KEY,
                resume_text TEXT NOT NULL DEFAULT '',
                resume_analysis TEXT NOT NULL DEFAULT '{}',
                resume_file_name TEXT NOT NULL DEFAULT '',
                resume_uploaded_at TEXT NOT NULL DEFAULT '',
                target_role TEXT NOT NULL DEFAULT 'AI Engineer',
                job_description TEXT NOT NULL DEFAULT '',
                job_match TEXT NOT NULL DEFAULT '{}',
                applications TEXT NOT NULL DEFAULT '[]',
                saved_jobs TEXT NOT NULL DEFAULT '[]',
                interview_history TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )

        # Migrate databases created by Stage 10 without deleting user data.
        _ensure_column(conn, "user_state", "resume_file_name", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "user_state", "resume_uploaded_at", "TEXT NOT NULL DEFAULT ''")


def create_user(name, email, password_hash, password_salt):
    with db_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)",
            (name.strip(), email.strip().lower(), password_hash, password_salt),
        )
        user_id = cursor.lastrowid
        conn.execute("INSERT INTO user_state (user_id) VALUES (?)", (user_id,))
        row = conn.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row)


def get_user_by_email(email):
    with db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id):
    with db_connection() as conn:
        row = conn.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def update_user_name(user_id, name):
    with db_connection() as conn:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name.strip(), user_id))
        row = conn.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def create_session(user_id, token_hash):
    with db_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (user_id, token_hash) VALUES (?, ?)",
            (user_id, token_hash),
        )


def get_user_id_by_session(token_hash):
    with db_connection() as conn:
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        return int(row["user_id"]) if row else None


def delete_session(token_hash):
    with db_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def get_state(user_id):
    with db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM user_state WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            conn.execute("INSERT INTO user_state (user_id) VALUES (?)", (user_id,))
            row = conn.execute(
                "SELECT * FROM user_state WHERE user_id = ?",
                (user_id,),
            ).fetchone()

        return {
            "resume_text": row["resume_text"],
            "resume_analysis": json.loads(row["resume_analysis"] or "{}"),
            "resume_file_name": row["resume_file_name"] if "resume_file_name" in row.keys() else "",
            "resume_uploaded_at": row["resume_uploaded_at"] if "resume_uploaded_at" in row.keys() else "",
            "target_role": row["target_role"],
            "job_description": row["job_description"],
            "job_match": json.loads(row["job_match"] or "{}"),
            "applications": json.loads(row["applications"] or "[]"),
            "saved_jobs": json.loads(row["saved_jobs"] or "[]"),
            "interview_history": json.loads(row["interview_history"] or "[]"),
            "updated_at": row["updated_at"],
        }


def save_state(user_id, state):
    with db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_state (
                user_id, resume_text, resume_analysis, resume_file_name,
                resume_uploaded_at, target_role, job_description, job_match,
                applications, saved_jobs, interview_history, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                resume_text = excluded.resume_text,
                resume_analysis = excluded.resume_analysis,
                resume_file_name = excluded.resume_file_name,
                resume_uploaded_at = excluded.resume_uploaded_at,
                target_role = excluded.target_role,
                job_description = excluded.job_description,
                job_match = excluded.job_match,
                applications = excluded.applications,
                saved_jobs = excluded.saved_jobs,
                interview_history = excluded.interview_history,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                user_id,
                state.get("resume_text", ""),
                json.dumps(state.get("resume_analysis") or {}, ensure_ascii=False),
                state.get("resume_file_name", ""),
                state.get("resume_uploaded_at", ""),
                state.get("target_role", "AI Engineer"),
                state.get("job_description", ""),
                json.dumps(state.get("job_match") or {}, ensure_ascii=False),
                json.dumps(state.get("applications") or [], ensure_ascii=False),
                json.dumps(state.get("saved_jobs") or [], ensure_ascii=False),
                json.dumps(state.get("interview_history") or [], ensure_ascii=False),
            ),
        )
