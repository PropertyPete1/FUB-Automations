# FUB Nurture Dashboard TODO

- [x] Add bot_observations table to drizzle/schema.ts and run migration
- [x] Add POST /api/healer/write Express route to server/_core/index.ts
- [x] Set HEALER_SECRET environment variable
- [x] Write vitest test for /api/healer/write endpoint
- [x] Update nightly_health.py on cloud computer to call /api/healer/write after each run
- [x] Publish project to production so /api/healer/write is live on fubdash-bkyqff6t.manus.space
- [x] Verify end-to-end: cloud computer curl test to production endpoint returns {"ok":true}
- [x] Update AGENTS.md on cloud computer to document new /api/healer/write endpoint
