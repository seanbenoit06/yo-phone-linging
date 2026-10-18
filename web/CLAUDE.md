# Frontend continuation

Read `README.md` and `CLAUDE_HANDOFF.md` in this directory before changing the UI.

Jay selected **The Family Computer** as the default functional dashboard. Preserve its retro desktop direction. This later user decision overrides the Flow default and sidebar-layout requirement in `../docs/UI_SPEC.md`; the spec's API and behavior requirements still apply. Earlier themes and the Style room remain available through their documented routes.

Work only in `web/`. Other sessions own the Python app and backend files. Keep code, comments, and documentation in English; explain progress to Jay in Traditional Chinese. Do not store credentials or phone numbers here, do not use `git add -A`, and ask before pushing.

Use `/?mock=1` for independent development. There is no browser answer-call or hangup endpoint. Read the handoff's verification record before claiming backend services or Windows execution have been tested.

For monitoring and editable controls, `../docs/UI_SPEC.md` section 9 is the governing v2 contract. Family Computer includes Mom's Eyes, Mom's Log, and acknowledged settings writes. Keep camera frames only in memory, stop photo polling when Eyes is hidden, and never save real camera photos or screenshots containing them in this repository. Only mock SVG camera scenes belong in UI evidence.
