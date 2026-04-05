# ScholarFlow

AI-powered academic research platform that automates the tedious parts of the research workflow — literature discovery, experiment replication, and paper writing — in a single browser-based IDE.

## What It Does

ScholarFlow takes a research idea and turns it into a complete paper draft by automating the grunt work:

1. **Literature Search** — Finds and ranks relevant papers via OpenAlex, adds them to your library
2. **Experiment Replication** — Runs baseline experiments on cloud GPUs (Modal) to validate prior work
3. **Novel Experiments** — Designs and executes new experiments based on your hypothesis
4. **Paper Writing** — AI drafts sections with proper citations, renders LaTeX to PDF in real-time

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Editor** | CodeMirror 6, LaTeX preview via latex.js |
| **Backend** | SQLite (local-first), Inngest (background jobs) |
| **AI** | Claude Sonnet 4 (Anthropic API) |
| **Compute** | Modal (GPU experiment execution) |
| **Search** | OpenAlex API (academic paper discovery) |
| **UI** | shadcn/ui, Radix UI, Streamdown (markdown rendering) |

## Features

- **LaTeX Editor** with live PDF preview and syntax highlighting
- **AI Chat** with streaming responses and tool call visualization
- **Paper Library** with relevance scoring and enrichment
- **Experiment Workspace** with hypothesis tracking, findings, and research logs
- **Guided Demo Mode** for presentations and walkthroughs

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, OPENALEX_API_KEY

# Run the dev server
npm run dev

# In another terminal, start Inngest
npx inngest-cli@latest dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENALEX_API_KEY` | No | OpenAlex API key (higher rate limits) |
| `REPRODUCTION_RUNNER_BACKEND` | No | Set to `modal` for GPU experiments |
| `REPRODUCTION_MODAL_SUBMIT_URL` | No | Modal worker endpoint |

## Deployment

The app deploys as a single service on Railway:

```bash
railway login
railway init
railway up
```

SQLite runs on Railway's persistent disk — no external database needed.

## Team

Built for the hackathon by the ScholarFlow team.
