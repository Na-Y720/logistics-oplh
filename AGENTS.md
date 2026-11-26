# Logistics apps maintenance

Before changing this repository, read `docs/APP_CATALOG.md`, the relevant sections of `docs/HANDOVER.md`, and applicable entries in `docs/OPEN_ITEMS.md`.

- Treat current source and deployed/database state as authoritative. The ledger records its verification date and may need refreshing. Do not mark a historical request resolved merely because related code exists.
- Identify the target app, shared tables, and downstream consumers before editing. Preserve app-specific auth and ownership boundaries.
- Keep changes within the user's request. Do not perform backlog fixes, add users, migrate data, or retire old deployments just because the ledger lists them.
- After an authorized app change, update affected ledger entries and `docs/CHANGELOG.md` with behavior, meaningful validation, remaining limits, and deployment provenance. Update the catalog if routes or ownership change.
- Do not commit credentials, sessions, actual operational CSVs, or personal employee records. This repository is public.
- Use the neutral production host `logistics-oplh.vercel.app` in user-facing links. W-location's canonical source is `w-location/`; the old Sites copy is not the ongoing maintenance source.
- Run checks appropriate to the change. Distinguish source inspection, mock tests, live database checks, browser checks, and actual user acceptance.

User instructions take precedence. No extra approval gate is imposed by this file.
