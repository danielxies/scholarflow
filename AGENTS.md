# Repository Guidelines

## Project Structure & Module Organization
`src/app` contains the Next.js App Router entrypoints plus API handlers under `src/app/api/**/route.ts`. Feature code lives in `src/features` (`projects`, `editor`, `conversations`, `literature`, `experiments`, `research`, `auth`), while shared UI is split between `src/components/ui` for shadcn/Radix primitives and `src/components/ai-elements` for AI-specific presentation. Put cross-cutting helpers in `src/lib` and reusable hooks in `src/hooks`. Convex backend functions and schema live in `convex/`; do not hand-edit `convex/_generated/*`. Static assets are in `public/`, and design/product notes are in `docs/`.

## Build, Test, and Development Commands
Use `npm run dev` to start the Next.js app, `npm run build` for a production build, `npm run start` to serve the build, and `npm run lint` to run the shared ESLint config. Local development also depends on backend services: run `npx convex dev` for Convex and `npx inngest-cli@latest dev` for background jobs. For data-layer smoke checks, `test-db.ts` can be run with `npx tsx test-db.ts`.

## Coding Style & Naming Conventions
This codebase uses TypeScript with `strict` mode, 2-space indentation, double quotes, and semicolons. Prefer the `@/*` path alias for imports from `src`. Export React components in PascalCase, name hooks with a `use` prefix, and keep file names lowercase with hyphens (`projects-view.tsx`, `route.ts`). Follow the current feature-first layout instead of creating broad utility folders too early. Keep Tailwind utilities close to the component that owns them.

## Testing Guidelines
There is no formal Jest/Vitest suite or coverage gate in `package.json` yet. At minimum, run `npm run lint` and manually verify the affected UI or API flow. If you touch database, BibTeX, Semantic Scholar, or Claude integration code, run `npx tsx test-db.ts` when possible and note any required environment variables in your PR.

## Commit & Pull Request Guidelines
Recent commits favor short, imperative subjects, sometimes with chapter-style prefixes such as `15: github import and export` or direct summaries like `Add AI research platform: ...`. Keep commits scoped to one logical change. PRs should include a concise summary, linked issue or task, local verification steps, screenshots for UI changes, and a note for schema or environment changes. Never commit `.env*`, local SQLite files under `data/`, or other generated artifacts.
