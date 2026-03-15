from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row


VISIBLE_CHAT_ROWS_SQL = """
SELECT
  m.id AS message_id,
  m.chat_id AS chat_id,
  m.role AS role,
  m.content AS content,
  m.thread_id AS thread_id,
  m.created_at AS created_at,
  c.type AS chat_type,
  c.category_id AS category_id,
  c.goal_id AS goal_id
FROM "Message" m
JOIN "ChatState" c ON c.id = m.chat_id
WHERE m.visible = TRUE
ORDER BY m.chat_id ASC, m.created_at ASC
"""


def fetch_visible_chat_rows(database_url: str) -> list[dict[str, Any]]:
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for DSPy dataset extraction")

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(VISIBLE_CHAT_ROWS_SQL)
            return list(cursor.fetchall())

