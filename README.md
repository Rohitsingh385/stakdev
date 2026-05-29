# stak.dev

the missing initializr for node.js.

pick your packages, pick your versions, get your install command.

→ **[stak.dev](https://frosty-sun-c716.stakbackend.workers.dev)**

---

## what it does

you type `express`, `zod`, `prisma` — whatever you need. it fetches live versions from npm, lets you pick, and generates the exact install command for npm, yarn, pnpm, or bun. copy and run.

- real-time package search via npm registry
- latest 5 stable versions per package (no prereleases)
- scoped packages supported (`@faker-js/faker`, `@prisma/client`)
- auto-suggests `@types/` packages when typescript is in your stack
- flags conflicting packages (`express` + `fastify`, `jest` + `vitest`)
- shareable urls — your whole stack encoded in the link
- cdn links for browser-safe packages via unpkg
- fresh project toggle — prepends `npm init -y` automatically
- no login. no tracking.
---
