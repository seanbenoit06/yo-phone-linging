# tasks/: where Mom learns what you have to do

`get_tasks() -> (list[Task], {source: {"status", "synced_at", "message"}})` for `GET /api/tasks`.
Contract: `INTERFACES.md`. Dashboard side: `docs/UI_SPEC.md` (Tasks, `GET /api/tasks`).

```bash
python -m tasks.canvas                                     # print your Canvas assignments
python -c "from tasks import get_tasks; print(get_tasks())"
```

## Status (2026-10-17)

- Canvas: works with Jay's real `canvas_session` cookie (8 assignments, 0.5 s, cached after).
  Also tested: fake data, wrong token / cookie (real 401), nothing set, unreachable host,
  missing source module.
- `api.py` serves it at `GET /api/tasks` (core owns that).
- Trello and Calendar sources are owned by other sessions (`tasks/trello.py`, `tasks/calendar.py`).

## Decisions

- **Login: browser cookie.** UW blocks students from making personal access tokens, so
  `CANVAS_SESSION_COOKIE` holds the `canvas_session` cookie copied from Chrome (steps in `.env.example`).
  It expires and dies on logout; then status is "error" with copy-it-again steps. `CANVAS_TOKEN`
  still works (and wins) for schools that allow tokens. Rejected: the Calendar Feed `.ics` URL,
  which never expires but can't tell submitted work apart and has no points.
- **Planner API** `GET /api/v1/planner/items`, today 00:00 → +14 days, `filter=incomplete_items`,
  following `Link rel="next"`. The token is only ever sent to `CANVAS_BASE_URL`.
- **Skipped items**: submitted (`submissions.submitted`), marked done in the planner, announcements.
- **`context`** is the course code (`MATH 208`, `A A 210`), or the full `context_name` if there is none.
- **`due_at`** is `plannable.due_at`, else `plannable_date`, converted to local time.
- **Cache** per source, in memory: 5 min when OK, 1 min after an error. "off" (no token) isn't cached.
  A fresh process always fetches once.
- **Never raises**: a source that fails returns `[]` with `status: "error"` and a readable message.
  Sources are imported lazily, so a broken one can't break the others.
- **No secrets in messages**: `requests.InvalidHeader` echoes the header value, so it gets its own message.
