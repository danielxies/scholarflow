# Production

This document describes the recommended production architecture for ScholarFlow when the app is hosted on Vercel and the primary database is Supabase.

## Production Topology

Recommended production shape:

1. **Vercel**
   - Hosts the Next.js app
   - Hosts the app API routes
   - Hosts the Inngest HTTP endpoint used by the app
2. **Supabase**
   - Primary Postgres database
   - Optional storage for run artifacts, reports, logs, and uploaded files
3. **Inngest**
   - Event orchestration and workflow scheduling
   - Drives staged reproduction workflows
4. **Separate execution worker service**
   - Runs paper repos
   - Installs dependencies
   - Downloads datasets
   - Executes command graphs
   - Streams logs, metrics, artifacts, and terminal status back to the app

The important boundary is:

- **Vercel app + Inngest = control plane**
- **worker service = compute plane**

## Why The Worker Must Be Separate

Vercel is a good fit for the web app and orchestration, but it is not the right place to run arbitrary paper repositories directly.

Paper reproduction jobs need:

- long-running processes
- repo cloning
- package installs
- writable workspaces
- dataset downloads and mounts
- optional GPU access
- strong isolation from the app runtime

Running that directly inside the app backend creates avoidable risks:

- serverless runtime limits
- dependency conflicts
- weaker isolation for untrusted repo code
- cancellation and job-lifecycle complexity
- poor fit for training/evaluation jobs

So production should always use a separate runner service, even if the web app is on Vercel.

## Current Codebase Status

The current codebase is still built on the local SQLite layer in [db.ts](/Users/monish/Projects/hackathon/scholarflow/src/lib/db.ts). That is acceptable for local development, but it is not the correct persistence model for production on Vercel.

Before production, the app needs a real shared database backend. If Supabase is the production database, the current local-db layer should be migrated or replaced so that:

- app instances on Vercel share the same state
- worker callbacks write into shared persistent storage
- experiment state survives deploys and cold starts
- multiple workflows can run safely across instances

## Recommended Production Architecture

### App layer

Deploy the Next.js app to Vercel.

Responsibilities:

- auth
- literature UI
- experiments workspace UI
- reproduction API routes
- callback ingestion
- Inngest serve route

### Database layer

Use Supabase Postgres for:

- projects
- files
- conversations
- messages
- papers
- hypotheses
- experiments
- reproduction plans
- findings
- logs
- blockers
- checkpoints
- execution jobs

Use Supabase Storage for:

- generated reports
- normalized results files
- runner manifests
- uploaded artifacts
- optionally paper PDFs and supplementary files

### Orchestration layer

Use Inngest for:

- staged workflow execution
- retries
- cancellation signals
- event-driven progression

The app still owns the workflow definitions, but the execution-heavy steps should only submit work to the worker service.

### Compute layer

Run the execution worker on a service that supports persistent compute better than Vercel, for example:

- Fly.io
- Railway
- Render
- ECS/Fargate
- a GPU-capable VM
- Kubernetes if needed later

Responsibilities:

- clone official repos
- create isolated job workspaces
- install dependencies
- materialize configs and dataset paths
- run install/eval/train commands
- emit logs and metrics
- upload artifacts
- callback into the app

## Production Request Flow

1. User clicks `Reproduce` in the Vercel-hosted app.
2. The app creates the hypothesis, experiment, reproduction plan, and initial workflow records in Supabase-backed storage.
3. The app sends the first Inngest event.
4. Inngest advances the reproduction workflow through:
   - intake
   - claim extraction
   - execution planning
   - execution spec compilation
5. The app submits the execution spec to the worker service over HTTPS.
6. The worker runs the job in its own environment.
7. The worker posts callbacks back to the app:
   - logs
   - heartbeats
   - metrics
   - artifacts
   - success/failure/blocker
8. The app updates experiment state in Supabase.
9. On success, the app continues with:
   - result extraction
   - comparison
   - final report generation

## Required Production Services

At minimum, production needs:

- Vercel project
- Supabase project
- Inngest environment
- separate worker deployment
- LLM provider credentials
- GitHub API token for repo inspection

## Environment Variables

### App on Vercel

Minimum app env:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

ANTHROPIC_API_KEY=
# or:
# CLAUDE_BACKEND=url
# CLAUDE_AGENT_URL=

OPENALEX_API_KEY=
GITHUB_TOKEN=

REPRODUCTION_RUNNER_BACKEND=
REPRODUCTION_PUBLIC_BASE_URL=
REPRODUCTION_MODAL_SUBMIT_URL=
REPRODUCTION_MODAL_CANCEL_URL=
REPRODUCTION_MODAL_SHARED_SECRET=
REPRODUCTION_RUNNER_CALLBACK_SECRET=
```

If the worker is self-hosted and not Modal, replace the runner URLs with the worker’s submit/cancel endpoints and keep the shared-secret callback contract.

### Worker service

Worker env should include:

```env
REPRODUCTION_MODAL_SHARED_SECRET=
REPRODUCTION_RUNNER_CALLBACK_SECRET=
APP_CALLBACK_URL=
GITHUB_TOKEN=
```

Plus any dataset or cloud-provider credentials needed for the worker environment.

### Supabase

You will also need the normal Supabase env set for whichever client/server access pattern you choose, for example:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The exact app env surface depends on how you implement the Supabase migration.

## What Must Change Before Production

### 1. Replace the local SQLite persistence layer

This is the largest production gap.

Current state:

- app uses local SQLite in [db.ts](/Users/monish/Projects/hackathon/scholarflow/src/lib/db.ts)

Required change:

- move the persistence layer to Supabase/Postgres
- update all read/write paths used by the app and callbacks
- preserve the current data model semantics

### 2. Pick and deploy the execution worker

Current state:

- a Modal worker file exists
- the app expects a separate execution backend

Required change:

- either deploy Modal properly
- or replace the runner adapter with a self-hosted worker service

### 3. Move artifact persistence out of inline-only storage

Current state:

- many artifacts are stored inline in DB metadata

Recommended production change:

- keep lightweight metadata in Postgres
- store larger artifacts in Supabase Storage

### 4. Confirm callback reachability

The worker must be able to reach:

```text
https://your-app.vercel.app/api/reproduction/runner-callback
```

This needs:

- a public base URL
- shared-secret validation
- production-safe error handling

### 5. Add production observability

Recommended:

- app logs on Vercel
- worker logs on the compute platform
- structured run/job ids
- alerting for failed callbacks and failed runner jobs

## Recommended Storage Split

Use Postgres for:

- row-level state
- workflow records
- hypotheses/experiments/logs/findings/blockers

Use object storage for:

- reports
- run outputs
- checkpoints
- downloaded artifacts
- normalized result files

Supabase Storage is a reasonable default for this.

## Security Notes

Production hardening should include:

- never run arbitrary repo code inside the app server
- shared-secret authentication for worker callbacks
- separate credentials for app and worker
- no raw secrets stored in experiment records
- dataset/API credentials stored in a proper secret store or encrypted backend path
- per-run isolated workspaces on the worker

## Reliability Notes

Production should treat these as first-class concerns:

- retry-safe callbacks
- idempotent job-state updates
- runner heartbeats
- timeout handling
- cancellation semantics
- artifact cleanup
- dataset download failures vs real blockers

## Suggested First Production Rollout

Phase 1:

- migrate persistence to Supabase
- keep worker CPU-only
- support public-data ML papers only
- disable broad paper support at the UI level

Phase 2:

- add GPU-backed worker capacity
- add better artifact storage
- improve cancellation and retry handling

Phase 3:

- support broader repo patterns
- add better dataset secret handling
- add richer execution repair loops

## Bottom Line

For production with Vercel and Supabase, the clean architecture is:

- **Vercel** for app and orchestration
- **Supabase** for shared persistence and storage
- **Inngest** for workflow control
- **separate worker service** for actual paper execution

The main thing that still must be done before production is migrating away from the current local SQLite layer and choosing the final compute worker deployment.
