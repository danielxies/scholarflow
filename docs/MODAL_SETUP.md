# Modal Setup

This repo now uses Modal as the execution plane for paper reproduction. ScholarFlow stays in charge of planning, state, logs, findings, and verdicts. Modal only runs the repo execution job and calls back into the app.

## What You Need

- A running ScholarFlow app with a public base URL
- An LLM planner backend configured in the app
- A Modal account and API token
- A shared secret for app-to-Modal requests
- A shared secret for Modal-to-app callbacks

## 1. Configure App Env

Start from the root template:

```bash
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

ANTHROPIC_API_KEY=
# or:
# CLAUDE_BACKEND=url
# CLAUDE_AGENT_URL=http://localhost:8288/

OPENALEX_API_KEY=
GITHUB_TOKEN=

REPRODUCTION_RUNNER_BACKEND=modal
REPRODUCTION_PUBLIC_BASE_URL=https://your-app-domain.example
REPRODUCTION_MODAL_SUBMIT_URL=
REPRODUCTION_MODAL_CANCEL_URL=
REPRODUCTION_MODAL_SHARED_SECRET=
REPRODUCTION_RUNNER_CALLBACK_SECRET=
```

Notes:

- `REPRODUCTION_PUBLIC_BASE_URL` must be reachable by Modal. It is used to build the callback URL at `/api/reproduction/runner-callback`.
- `REPRODUCTION_MODAL_SHARED_SECRET` is sent from ScholarFlow to Modal in the request header `x-scholarflow-runner-secret`.
- `REPRODUCTION_RUNNER_CALLBACK_SECRET` is sent from Modal back to ScholarFlow in the header `x-scholarflow-callback-secret`.

## 2. Install Modal CLI

Create a Python environment for the worker tooling:

```bash
python3 -m venv .venv-modal
source .venv-modal/bin/activate
pip install modal requests fastapi
```

Authenticate the CLI. Modal’s official docs recommend either `modal setup` or setting `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.

```bash
modal setup
```

Official references:

- https://modal.com/docs/reference/cli/setup
- https://modal.com/docs/reference/modal.config

## 3. Export Worker Env For Deployment

Before deploy, export the values the worker needs:

```bash
export MODAL_TOKEN_ID=...
export MODAL_TOKEN_SECRET=...
export REPRODUCTION_MODAL_APP_NAME=scholarflow-reproduction
export REPRODUCTION_MODAL_SHARED_SECRET=...
```

The current worker file is:

```text
modal/reproduction_app.py
```

## 4. Deploy The Modal App

From the repo root:

```bash
source .venv-modal/bin/activate
modal deploy modal/reproduction_app.py
```

Modal deploys the named app and publishes the FastAPI endpoints defined in the file. In this worker, the app exposes:

- `submit`
- `cancel`

Official reference:

- https://modal.com/docs/guide/apps

## 5. Capture The Endpoint URLs

After deploy, take the deployed endpoint URLs for:

- `submit`
- `cancel`

Set them back into the app:

```env
REPRODUCTION_MODAL_SUBMIT_URL=https://...
REPRODUCTION_MODAL_CANCEL_URL=https://...
```

Then restart the Next.js app and the Inngest dev process.

## 6. Start ScholarFlow Services

In separate terminals:

```bash
npm run dev
```

```bash
npx inngest-cli@latest dev
```

If you use the local app during development, Modal still needs to reach your callback URL. For local-only testing, expose the app with a tunnel and set:

```env
REPRODUCTION_PUBLIC_BASE_URL=https://your-tunnel.example
```

## 7. Validate The Integration

Once the app is running:

1. Open a saved paper in the library.
2. Click `Reproduce`.
3. Confirm the modal no longer shows runner-unavailable.
4. Start a run.
5. Open the experiment in the experiments workspace.
6. Check that the progress panel shows:
   - runner backend
   - runner job id
   - compute tier
   - current command
   - last heartbeat
7. Check that logs begin to appear in the research log panel.

## Current v1 Limits

- The worker is Python/ML-first.
- The worker is conservative about command inference and repo setup.
- Broad system-package automation is not implemented.
- Hard-blocker cases such as gated data still require user input.
- Remote cancellation is not implemented in the worker yet; the current `cancel` endpoint returns `501`.

## Files Involved

- App start/cancel capability: [route.ts](/Users/monish/Projects/hackathon/scholarflow/src/app/api/reproduction/route.ts)
- Runner callback ingestion: [route.ts](/Users/monish/Projects/hackathon/scholarflow/src/app/api/reproduction/runner-callback/route.ts)
- Workflow orchestration: [workflow.ts](/Users/monish/Projects/hackathon/scholarflow/src/features/reproduction/inngest/workflow.ts)
- Modal worker: [reproduction_app.py](/Users/monish/Projects/hackathon/scholarflow/modal/reproduction_app.py)
