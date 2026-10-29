# SeatLock Frontend

Vue 3 + TypeScript + Vite + Tailwind CSS 4 + Pinia + Vue Router.

```bash
pnpm install
pnpm dev      # http://localhost:5173, /api is proxied to http://localhost:3000
pnpm build
```

- `src/api/client.ts` — axios instance: in-memory access token, single-flight refresh on 401, error normalization.
- `src/api/mock/` — in-browser fake backend used in Mock mode; it follows the API contract from `../backend/TECHNICAL_SPECIFICATION.md`.
- `src/views/LabView.vue` — concurrency lab: fires N parallel bookings to prove the backend never oversells.

`VITE_MOCK_MODE=true` in `.env` starts the app in Mock mode when nothing is saved in localStorage. The production Docker image is built with `VITE_MOCK_MODE=false`.
