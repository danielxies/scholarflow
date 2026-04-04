# ScholarFlow + Orchestra: Comprehensive MVP Plan

**Date**: 2026-04-03
**Status**: Draft
**Goal**: Transform ScholarFlow from an academic writing IDE into a full AI-native research platform by wrapping Orchestra's open-source AI-Research-SKILLs (MIT licensed) and replicating the Orchestra Research product model.

---

## Table of Contents

1. [What Orchestra Research Is](#1-what-orchestra-research-is)
2. [What ScholarFlow Already Has](#2-what-scholarflow-already-has)
3. [Gap Analysis](#3-gap-analysis)
4. [Open-Source Skills Library Deep Dive](#4-open-source-skills-library-deep-dive)
5. [Feature Breakdown & MVP Scope](#5-feature-breakdown--mvp-scope)
6. [UI Reference (Orchestra)](#6-ui-reference-orchestra)
7. [Architecture Plan](#7-architecture-plan)
8. [Data Model Changes](#8-data-model-changes)
9. [Implementation Phases](#9-implementation-phases)
10. [Pricing & Monetization Model](#10-pricing--monetization-model)
11. [Legal & Licensing](#11-legal--licensing)
12. [Competitive Landscape](#12-competitive-landscape)

---

## 1. What Orchestra Research Is

Orchestra Research (orchestra-research.com) is the **"first AI-native Research IDE"** -- a platform that takes researchers from idea to publication. Their tagline: **"Vibe Research"** (inspired by Karpathy's "vibe coding" applied to science).

### Core Value Proposition
> "You stay in control of the science while agents handle the heavy lifting."

### The Full Research Lifecycle
1. **Search literature** -- AI processes thousands of papers
2. **Brainstorm** -- AI generates ideas, humans curate
3. **Plan experiments** -- Describe what to test in plain language
4. **Run GPU jobs** -- Agent-oriented serverless compute (T4, A10G, A100, H100)
5. **Analyze results** -- Automated visualization, stats, markdown reports
6. **Draft publications** -- Turn results into publication-ready artifacts

### Three Core Layers
| Layer | What It Does |
|-------|-------------|
| **Cognitive** | Deep domain expertise across NLP, CV, systems, theory. Understands what's been tried, what's promising, open questions. Encodes research craft from hypothesis to interpretation. |
| **Engineering** | Infrastructure for running experiments -- code, compute, dependencies |
| **Infrastructure** | Agent-oriented serverless compute -- GPUs don't idle while agents think |

### Key Innovation: Agent-Oriented Compute
The AI agent lives in a **lightweight, cheap sandbox** for thinking/planning. When it needs to run a GPU experiment, it **packages the job and dispatches to serverless compute**. This solves:
- **Idle GPU Problem** -- GPUs don't sit idle while agents think
- **Scalability** -- Agents dispatch parallel experiments without managing schedulers
- **Hardware Ceiling** -- Dynamic scaling from cheap T4s to H100s as needed

### Key Features
- **Total Recall** -- Every breakthrough, failed experiment, and idea is captured/indexed
- **Context When It Matters** -- Surfaces historical context, connects unnoticed patterns
- **Dead Ends Remembered** -- Tracks failed experiments to prevent repeating mistakes
- **Taste Preserved** -- Learns research philosophy; compounds over time

### Backing & Social Proof
- NVIDIA Inception Program
- Vercel AI Accelerator 2026 cohort (1 of 39 teams)
- Pear VC FFC
- Trusted by: Harvard, MIT, Stanford, Yale, UPenn, Michigan, Meta, Google
- Founded by PhD researchers from UMich and Harvard
- 6,100+ GitHub stars on open-source skills library

---

## 2. What ScholarFlow Already Has

### Current Features (Working)
- **Auth**: Clerk authentication (sign-in/sign-up, user management)
- **Project Management**: Create/rename papers, multiple templates (Plain, ACM, IEEE, NeurIPS)
- **AI Project Creation**: Generate entire LaTeX project from natural language prompt
- **Code Editor**: CodeMirror 6 with syntax highlighting (LaTeX, Python, JS, HTML, CSS, JSON, MD)
- **Multi-file Tabs**: Pinned tabs, file breadcrumbs
- **AI Code Suggestions**: Contextual completions for LaTeX commands
- **Quick Edit**: Select text -> ask AI to modify it
- **File Explorer**: Hierarchical file/folder tree, create/rename/organize
- **LaTeX Preview**: Real-time PDF rendering via latex.js
- **AI Conversations**: Sidebar chat for asking questions about the paper
- **Conversation History**: Multiple threads per project, past conversations dialog
- **Auto-save**: Debounced 1.5s after last edit
- **Background Jobs**: Inngest for message processing and project creation

### Tech Stack
- Next.js 16, React 19, TypeScript, TailwindCSS
- Convex (database), Clerk (auth), Inngest (background jobs)
- CodeMirror 6, Claude API, Zustand, Radix UI

### What's NOT Built Yet
- No billing/subscriptions
- No collaboration
- No export (beyond PDF preview)
- No citation management UI
- No literature search/discovery
- No experiment execution
- No GPU compute integration
- No research skills/agent system

---

## 3. Gap Analysis

| Orchestra Feature | ScholarFlow Status | Gap Size | MVP Priority |
|---|---|---|---|
| Auth & user management | **Done** (Clerk) | None | -- |
| Project management | **Done** (Convex) | None | -- |
| Code editor | **Done** (CodeMirror) | None | -- |
| AI chat/conversations | **Done** (Claude API + Inngest) | None | -- |
| LaTeX templates | **Done** (NeurIPS, ACM, IEEE) | None | -- |
| AI project scaffolding | **Done** | None | -- |
| Literature search & synthesis | **Missing** | Large | P0 |
| Research skills library | **Missing** | Large | P0 |
| Skills marketplace/browser | **Missing** | Medium | P0 |
| Experiment tracking | **Missing** | Large | P1 |
| GPU compute integration | **Missing** | Very Large | P2 |
| Billing & credits system | **Missing** | Medium | P1 |
| Autoresearch orchestration | **Missing** | Large | P1 |
| Research memory/state | **Missing** | Medium | P1 |
| Publication drafting workflow | **Partial** (LaTeX editor) | Small | P1 |
| Community forum | **Missing** | Medium | P2 |
| Educational content | **Missing** | Small | P3 |
| Cross-domain agents | **Missing** | Large | P3 |

---

## 4. Open-Source Skills Library Deep Dive

### What It Is
The [AI-Research-SKILLs](https://github.com/Orchestra-Research/AI-Research-SKILLs) repo is **MIT licensed** with 87 production-ready skills across 22 categories. Each skill is a modular markdown knowledge package (200-500 lines) containing expert documentation, code examples, troubleshooting guides, and workflows for specific AI/ML frameworks.

### Why We Can Wrap It
- **MIT License** -- We can freely use, modify, distribute, sell, sublicense, and incorporate into proprietary software
- **Must**: Include MIT copyright notice in copies
- **Cannot**: Claim Orchestra endorses our product
- Skills are **plain markdown files** -- trivially ingestible by any LLM agent
- No runtime dependencies between skills -- standalone documents

### Skill File Format
```
skill-name/
  SKILL.md                    # Main guidance (200-500 lines)
    # YAML frontmatter: name, description, version, author, license, tags, dependencies
    # When to use / when NOT to use
    # Core concepts with code blocks
    # Step-by-step workflows with checklists
    # Common issues & solutions
    # References
  references/                 # Deep docs (300KB+)
    README.md, api.md, tutorials.md, issues.md, releases.md
  scripts/                    # Optional helpers
  templates/                  # Optional code templates
```

### Complete Skills Inventory (87 skills, 22 categories)

| # | Category | Skills | Notable Tools |
|---|----------|--------|---------------|
| 0 | Autoresearch | 1 | Central orchestration (two-loop architecture) |
| 1 | Model Architecture | 5 | LitGPT, Mamba, RWKV, NanoGPT, TorchTitan |
| 2 | Tokenization | 2 | HuggingFace Tokenizers, SentencePiece |
| 3 | Fine-Tuning | 4 | Axolotl, LLaMA-Factory, Unsloth, PEFT |
| 4 | Mechanistic Interpretability | 4 | TransformerLens, SAELens, pyvene, nnsight |
| 5 | Data Processing | 2 | Ray Data, NeMo Curator |
| 6 | Post-Training | 8 | TRL, GRPO, OpenRLHF, SimPO, verl, slime, miles, torchforge |
| 7 | Safety & Alignment | 4 | Constitutional AI, LlamaGuard, NeMo Guardrails, Prompt Guard |
| 8 | Distributed Training | 6 | Megatron-Core, DeepSpeed, FSDP2, Accelerate, Lightning, Ray Train |
| 9 | Infrastructure | 3 | Modal, SkyPilot, Lambda Labs |
| 10 | Optimization | 6 | Flash Attention, bitsandbytes, GPTQ, AWQ, HQQ, GGUF |
| 11 | Evaluation | 3 | lm-evaluation-harness, BigCode Eval, NeMo Evaluator |
| 12 | Inference & Serving | 4 | vLLM, TensorRT-LLM, llama.cpp, SGLang |
| 13 | MLOps | 3-4 | Weights & Biases, MLflow, TensorBoard, SwanLab |
| 14 | Agents | 4 | LangChain, LlamaIndex, CrewAI, AutoGPT |
| 15 | RAG | 5 | Chroma, FAISS, Sentence Transformers, Pinecone, Qdrant |
| 16 | Prompt Engineering | 4 | DSPy, Instructor, Guidance, Outlines |
| 17 | Observability | 2 | LangSmith, Phoenix |
| 18 | Multimodal | 7 | CLIP, Whisper, LLaVA, Stable Diffusion, SAM, BLIP-2, AudioCraft |
| 19 | Emerging Techniques | 6 | MoE, Model Merging, Long Context, Speculative Decoding, Distillation, Pruning |
| 20 | ML Paper Writing | 2 | LaTeX templates (NeurIPS, ICML, ICLR, ACL, AAAI, COLM), Academic Plotting |
| 21 | Research Ideation | 2 | Brainstorming (10 lenses), Creative Thinking (cognitive science) |

### The Autoresearch Orchestration Skill (Crown Jewel)

**Two-Loop Architecture:**
```
Bootstrap (once) --> Inner Loop (fast) <--> Outer Loop (periodic) --> Finalize
```

- **Bootstrap**: Scope question, literature search, identify gaps, form hypotheses, lock metrics
- **Inner Loop**: Pick hypothesis -> write protocol -> execute via domain skill -> measure -> record -> learn
- **Outer Loop**: Review all results -> find patterns -> decide: DEEPEN / BROADEN / PIVOT / CONCLUDE
- **Finalize**: Write paper via ml-paper-writing skill

**Workspace Structure** (what we'd replicate in our UI):
```
{project}/
  research-state.yaml    # Machine-readable state
  research-log.md        # Chronological decisions
  findings.md            # Evolving narrative (agent's memory)
  literature/            # Papers + survey.md
  src/                   # Reusable code
  data/                  # Raw results
  experiments/{slug}/    # One dir per hypothesis
  to_human/              # Progress reports
  paper/                 # Final manuscript
```

### How Skills Integrate
Skills are **plain markdown files placed in agent config directories**:
- Claude Code: `~/.claude/skills/`
- The installer (`npx @orchestra-research/ai-research-skills`) handles placement
- Agent reads relevant `SKILL.md` when encountering a research task
- Autoresearch routes to domain skills by category path

---

## 5. Feature Breakdown & MVP Scope

### P0 -- Core Differentiators (Phase 1, 4-6 weeks)

#### 5.1 Skills Library Browser & Manager
**What**: A visual marketplace to browse, install, and manage the 87 open-source skills.

**UI Components**:
- Skills catalog page with category filters (22 categories), search, tag pills
- Skill detail cards: name, description, tags, dependencies, install status
- One-click "add to project" -- injects skill context into the project's AI conversations
- Per-project skills panel showing active skills
- Skill detail drawer/page with rendered SKILL.md content

**Implementation**:
- Fork/mirror the AI-Research-SKILLs repo or fetch skills at build time
- Store skills as static content (markdown), parse YAML frontmatter for metadata
- Convex table: `projectSkills` (projectId, skillId, installedAt)
- When user activates a skill, inject its SKILL.md content as system context for AI conversations

#### 5.2 Literature Search & Synthesis
**What**: AI-powered paper discovery and Q&A over research literature.

**UI Components**:
- "Literature" tab in project view alongside Editor and Chat
- Search bar with filters (year, venue, topic)
- Paper cards with title, authors, abstract, citation count
- "Add to project" button -> saves to project's literature folder
- "Ask about this paper" -> opens AI chat with paper context
- Literature survey generation (auto-synthesize added papers)

**Implementation**:
- Integrate Semantic Scholar API (free, 100 requests/sec) for paper search
- Integrate arXiv API for preprints
- Store paper metadata in Convex `papers` table
- Use Claude to generate literature surveys from collected papers
- RAG pipeline: chunk papers -> embed -> vector search for Q&A

#### 5.3 Research Ideation & Brainstorming
**What**: Structured AI-assisted research ideation using the brainstorming and creative-thinking skills.

**UI Components**:
- "Ideation" mode in conversation sidebar
- Guided workflow: Problem statement -> 10 ideation lenses -> Evaluation matrix
- Idea cards that can be promoted to hypotheses
- Connection visualization between ideas

**Implementation**:
- Load brainstorming and creative-thinking SKILL.md as system prompts
- Structured output for idea generation (JSON schema for ideas)
- Store ideas in Convex `ideas` table with project association

---

### P1 -- Research Workflow (Phase 2, 6-8 weeks)

#### 5.4 Experiment Tracking & Management
**What**: Visual experiment dashboard mirroring Orchestra's research-state.yaml pattern.

**UI Components**:
- "Experiments" tab in project view (Orchestra has: Research Tree, Chat, Experiments, Docs)
- Hypothesis cards with status (proposed / running / completed / failed)
- Experiment timeline/log view
- Results visualization (charts via recharts, already in deps)
- Optimization trajectory chart ("Karpathy Plot" -- metric improvement over experiments)
- Findings document that evolves as experiments complete

**Implementation**:
- Convex tables: `hypotheses`, `experiments`, `experimentResults`
- research-state stored as structured Convex document (not YAML file)
- findings.md auto-generated from experiment results via Claude
- Git-style protocol: protocol logged before execution, results after

#### 5.5 Autoresearch Agent Orchestration
**What**: The two-loop autonomous research agent, adapted for our platform.

**UI Components**:
- "Start Research" button that kicks off the autoresearch loop
- Real-time status panel showing current phase (Bootstrap / Inner / Outer / Finalize)
- Agent activity feed (what it's reading, thinking, executing)
- Human intervention points ("Agent is asking for direction")
- Pause/resume/redirect controls

**Implementation**:
- Implement autoresearch two-loop as Inngest functions (already have Inngest)
- Bootstrap: literature search -> gap identification -> hypothesis formation
- Inner loop: skill selection -> code generation -> execution -> measurement
- Outer loop: pattern synthesis -> direction decision
- Use Claude with autoresearch SKILL.md as system prompt
- Store state in Convex, surface in real-time via Convex subscriptions

#### 5.6 Billing & Credits System
**What**: Usage-based billing matching Orchestra's model.

**Pricing Tiers** (adapted from Orchestra):

| Plan | Price | Credits/mo | Limits |
|------|-------|-----------|--------|
| Free | $0 | 2,000 | 5 projects, basic features |
| Pro | $29/mo | 10,000 | Unlimited projects, priority support |
| Max | $79/mo | 40,000 | All Pro + priority access, dedicated support |

**One-time credit packs** (no subscription, never expire):
- Boost: $8 for 1,500 credits
- Research: $22 for 5,000 credits
- Sprint: $49 for 15,000 credits

**Implementation**:
- Stripe integration for subscriptions + one-time purchases
- Convex tables: `subscriptions`, `creditBalances`, `creditTransactions`
- Credit deduction per AI call (conversation message, literature search, experiment run)
- Usage dashboard showing credit consumption

#### 5.7 Research Memory & Context
**What**: Persistent memory across research sessions.

**UI Components**:
- "Memory" panel showing what the AI remembers about the project
- Timeline of key discoveries, dead ends, pivots
- Ability to pin/unpin memories
- Cross-project memory search

**Implementation**:
- Convex table: `researchMemory` (projectId, type, content, timestamp)
- Auto-extract key findings from conversations and experiments
- Inject relevant memories as context in new conversations
- Memory types: discovery, dead_end, decision, insight

---

### P2 -- Compute & Community (Phase 3, 8-12 weeks)

#### 5.8 GPU Compute Integration
**What**: Dispatch experiments to serverless GPUs.

**Implementation Options**:
- **Modal** (recommended, Orchestra uses it) -- Serverless GPU functions, T4 to H100
- **SkyPilot** -- Multi-cloud GPU orchestration
- **Lambda Labs** -- Reserved GPU instances

**UI Components**:
- GPU selector (T4, A10G, A100, H100) with credit costs
- Job queue visualization
- Real-time execution logs
- Resource usage dashboard

**Implementation**:
- API routes that dispatch to Modal serverless functions
- Job status tracking in Convex
- Streaming logs via WebSocket or Convex subscriptions
- Credit deduction based on GPU type and duration

#### 5.9 Research Forum / Community
**What**: Community space for sharing research and collaboration.

**UI Components**:
- Forum page with categories (by research domain)
- Post/reply threads
- Upvoting, tagging
- User profiles with research interests

---

### P3 -- Polish & Expansion (Phase 4, ongoing)

#### 5.10 Educational Content (Intro to AI Research)
- Guided lessons with toy models (like Orchestra's gradient clipping, residual connections series)
- Interactive notebooks

#### 5.11 Cross-Domain AI Agents
- Specialized agents per research domain
- Agent routing based on project type

#### 5.12 GitHub Import/Export
- Import existing research repos
- Export projects to GitHub

---

## 6. UI Reference (Orchestra)

Screenshots saved at `/Users/danielxie/Desktop/orchestra-screenshots/`:

### 6.1 Homepage (`01-homepage.png`)
- **Layout**: Clean, centered single-column hero on white background
- **Nav**: Logo (purple circle) left, links center (Mission, Perspectives, Publications, Skills), Sign in right
- **Hero**: Purple announcement pill badge at top -> large bold headline "Vibe Research for [rotating field]" with purple accent color -> subtitle in gray -> feature tags as pill chips (Search literature, Brainstorm, Plan experiments, Run GPU jobs, Analyze results, Draft publications)
- **CTAs**: Filled purple "Get Started" + outlined "Our Mission"
- **Social proof**: "BACKED BY" with NVIDIA, Vercel, Pear logos
- **Below fold**: YouTube launch video embed, problem/solution table, open-source skills section, project showcase cards, blog previews, institutional logos (Harvard, MIT, Stanford, etc.), FAQ accordion
- **Design system**: White bg, purple/indigo primary, black headings, gray body, pill badges, card-based layouts

### 6.2 Product UI (from project showcase)
- **Layout**: Left sidebar (Research Tree, file explorer) + Center (Chat interface) + Top tabs (Research Tree, Chat, Experiments, Docs)
- **Chat**: Standard AI chat with user/assistant messages, markdown rendering
- **Research Tree**: Hierarchical view of the research project structure
- This is very similar to ScholarFlow's current layout (sidebar + editor + chat)

### 6.3 Pricing Page (`02-pricing.png`)
- **Layout**: Classic 3-column pricing cards, centered
- **Header**: "Simple, Transparent Pricing" + Monthly/Yearly toggle (green "Save More" badge on Yearly)
- **Cards**: Free (white, minimal), Pro (purple dashed border, "Most Popular" green badge, gradient CTA button), Max (white, "Best Value" badge, crown icon)
- **Below cards**: "Need More Credits?" one-time purchase section
- **Design**: Green for badges/checkmarks, purple for highlighted card, gradient purple-to-pink for primary CTA

### 6.4 Skills Page (`03-ai-research-skills.png`)
- **Layout**: Centered single-column, similar hero pattern
- **Hero**: Purple pill badge "Open Source | 86 Skills" -> large heading with "Skills" highlighted in lavender box
- **Stats row**: GitHub stars, forks, "Open Source", skill count, category count, MIT license
- **Onboard card**: Toggle between "Prompt" and "Install" modes, code block with copy button, numbered steps
- **Below**: Tag cloud of ML/AI topics, individual skill cards grid

### 6.5 Key Design Patterns to Replicate
- Purple/indigo as primary accent color
- Pill badges for categories and status
- Card-based layouts with subtle borders
- Clean typography hierarchy (bold headings, gray body)
- Gradient CTAs for primary actions
- Stats rows with icon + number pairs
- Toggle switches for plan selection (Monthly/Yearly)
- Announcement banners at top of pages
- Trust logos/social proof sections

---

## 7. Architecture Plan

### Current Architecture
```
Next.js 16 (App Router)
  |-- Clerk (Auth)
  |-- Convex (Database + Real-time)
  |-- Inngest (Background Jobs)
  |-- Claude API (AI)
  |-- CodeMirror 6 (Editor)
```

### Target Architecture
```
Next.js 16 (App Router)
  |-- Clerk (Auth)
  |-- Convex (Database + Real-time)
  |-- Inngest (Background Jobs + Autoresearch Loops)
  |-- Claude API (AI + Skills Context)
  |-- CodeMirror 6 (Editor)
  |-- Stripe (Billing + Credits)          [NEW]
  |-- Semantic Scholar API (Literature)    [NEW]
  |-- arXiv API (Preprints)               [NEW]
  |-- Modal (Serverless GPU Compute)       [NEW - P2]
  |-- Skills Engine (Markdown Parser)      [NEW]
  |-- Vector Store (Literature RAG)        [NEW]
```

### Skills Engine Design
```
/src/features/skills/
  lib/
    skills-loader.ts        # Load/parse SKILL.md files from repo
    skills-metadata.ts      # Parse YAML frontmatter
    skills-search.ts        # Full-text search across skills
    skills-context.ts       # Inject skill content into AI conversations
  data/
    skills/                 # Mirrored/vendored from AI-Research-SKILLs repo
      0-autoresearch-skill/
      1-model-architecture/
      ...
  components/
    skills-catalog.tsx      # Browse all skills
    skill-card.tsx          # Individual skill preview
    skill-detail.tsx        # Full skill view with rendered markdown
    skill-installer.tsx     # Add/remove skills from project
    category-filter.tsx     # Filter by category
  hooks/
    use-skills.ts           # Skills data access
    use-project-skills.ts   # Per-project skill management
```

### Autoresearch Engine Design
```
/src/features/autoresearch/
  inngest/
    bootstrap.ts            # Literature survey, hypothesis formation
    inner-loop.ts           # Experiment execution cycle
    outer-loop.ts           # Synthesis and direction decisions
    finalize.ts             # Paper drafting
  components/
    research-dashboard.tsx  # Main autoresearch view
    hypothesis-card.tsx     # Individual hypothesis status
    experiment-timeline.tsx # Chronological experiment view
    findings-viewer.tsx     # Evolving findings document
    agent-activity.tsx      # Real-time agent status
    karpathy-plot.tsx       # Optimization trajectory chart
  hooks/
    use-autoresearch.ts     # Autoresearch state management
    use-experiments.ts      # Experiment CRUD
```

### Literature Engine Design
```
/src/features/literature/
  lib/
    semantic-scholar.ts     # Semantic Scholar API client
    arxiv.ts                # arXiv API client
    paper-processor.ts      # Extract, chunk, embed papers
  components/
    literature-search.tsx   # Search interface
    paper-card.tsx          # Paper preview
    paper-detail.tsx        # Full paper view
    survey-generator.tsx    # Literature survey builder
    library-view.tsx        # Project's paper collection
  hooks/
    use-paper-search.ts     # Search + filters
    use-project-papers.ts   # Per-project paper management
```

---

## 8. Data Model Changes

### New Convex Tables

```typescript
// convex/schema.ts additions

// Skills
skills: defineTable({
  skillId: v.string(),          // e.g., "grpo-rl-training"
  name: v.string(),
  description: v.string(),
  version: v.string(),
  category: v.string(),         // e.g., "06-post-training"
  categoryNumber: v.number(),
  tags: v.array(v.string()),
  dependencies: v.array(v.string()),
  contentPath: v.string(),      // path to SKILL.md
  referencePaths: v.array(v.string()),
})
  .index("by_category", ["category"])
  .searchIndex("search_skills", { searchField: "name" }),

projectSkills: defineTable({
  projectId: v.id("projects"),
  skillId: v.string(),
  activatedAt: v.number(),
})
  .index("by_project", ["projectId"]),

// Literature
papers: defineTable({
  projectId: v.id("projects"),
  title: v.string(),
  authors: v.array(v.string()),
  abstract: v.string(),
  year: v.number(),
  venue: v.optional(v.string()),
  doi: v.optional(v.string()),
  arxivId: v.optional(v.string()),
  semanticScholarId: v.optional(v.string()),
  citationCount: v.optional(v.number()),
  addedAt: v.number(),
  notes: v.optional(v.string()),
})
  .index("by_project", ["projectId"])
  .searchIndex("search_papers", { searchField: "title" }),

// Experiments & Hypotheses
hypotheses: defineTable({
  projectId: v.id("projects"),
  title: v.string(),
  description: v.string(),
  status: v.union(
    v.literal("proposed"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("abandoned")
  ),
  rationale: v.string(),
  expectedOutcome: v.string(),
  actualOutcome: v.optional(v.string()),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_project", ["projectId"])
  .index("by_status", ["projectId", "status"]),

experiments: defineTable({
  projectId: v.id("projects"),
  hypothesisId: v.id("hypotheses"),
  name: v.string(),
  protocol: v.string(),         // What will be done (committed BEFORE execution)
  status: v.union(
    v.literal("planned"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled")
  ),
  skillsUsed: v.array(v.string()),
  gpuType: v.optional(v.string()),
  results: v.optional(v.string()),
  metrics: v.optional(v.any()),  // { metricName: value }
  logs: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  creditsCost: v.optional(v.number()),
})
  .index("by_project", ["projectId"])
  .index("by_hypothesis", ["hypothesisId"]),

// Research State
researchState: defineTable({
  projectId: v.id("projects"),
  phase: v.union(
    v.literal("idle"),
    v.literal("bootstrap"),
    v.literal("inner_loop"),
    v.literal("outer_loop"),
    v.literal("finalizing"),
    v.literal("completed")
  ),
  currentHypothesisId: v.optional(v.id("hypotheses")),
  findings: v.string(),         // Evolving findings markdown
  researchLog: v.array(v.object({
    timestamp: v.number(),
    action: v.string(),
    details: v.string(),
  })),
  directionDecision: v.optional(v.union(
    v.literal("DEEPEN"),
    v.literal("BROADEN"),
    v.literal("PIVOT"),
    v.literal("CONCLUDE")
  )),
  experimentCount: v.number(),
  lastUpdated: v.number(),
})
  .index("by_project", ["projectId"]),

// Research Memory
researchMemory: defineTable({
  projectId: v.id("projects"),
  type: v.union(
    v.literal("discovery"),
    v.literal("dead_end"),
    v.literal("decision"),
    v.literal("insight"),
    v.literal("context")
  ),
  content: v.string(),
  source: v.optional(v.string()),  // conversation, experiment, literature
  pinned: v.boolean(),
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_type", ["projectId", "type"]),

// Billing
subscriptions: defineTable({
  userId: v.string(),
  plan: v.union(v.literal("free"), v.literal("pro"), v.literal("max")),
  stripeSubscriptionId: v.optional(v.string()),
  stripeCustomerId: v.optional(v.string()),
  creditsPerMonth: v.number(),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("cancelled"),
    v.literal("past_due")
  ),
})
  .index("by_user", ["userId"])
  .index("by_stripe", ["stripeSubscriptionId"]),

creditBalances: defineTable({
  userId: v.string(),
  monthlyCredits: v.number(),     // Resets each billing period
  bonusCredits: v.number(),       // From one-time purchases, never expire
  lastResetAt: v.number(),
})
  .index("by_user", ["userId"]),

creditTransactions: defineTable({
  userId: v.string(),
  projectId: v.optional(v.id("projects")),
  amount: v.number(),             // Negative = spend, positive = purchase/reset
  type: v.union(
    v.literal("ai_message"),
    v.literal("literature_search"),
    v.literal("experiment_run"),
    v.literal("gpu_compute"),
    v.literal("monthly_reset"),
    v.literal("purchase")
  ),
  description: v.string(),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_project", ["projectId"]),
```

---

## 9. Implementation Phases

### Phase 1: Skills + Literature (4-6 weeks)

**Week 1-2: Skills Engine**
- [ ] Fork/vendor AI-Research-SKILLs repo into project (or fetch at build time)
- [ ] Build YAML frontmatter parser for skill metadata
- [ ] Skills catalog page (browse, search, filter by category)
- [ ] Skill detail page (rendered SKILL.md with syntax highlighting)
- [ ] Per-project skill activation (add/remove skills)
- [ ] Inject active skill content into AI conversation system prompts

**Week 3-4: Literature Search**
- [ ] Semantic Scholar API integration
- [ ] arXiv API integration
- [ ] Literature search UI (search bar, filters, paper cards)
- [ ] Paper detail view (title, abstract, authors, citations)
- [ ] "Add to project" flow
- [ ] Project library view
- [ ] AI-powered paper Q&A (inject paper content into conversation)

**Week 5-6: Research Ideation**
- [ ] Ideation mode in conversation sidebar
- [ ] Brainstorming workflow using brainstorming SKILL.md
- [ ] Idea cards with evaluation matrix
- [ ] Idea-to-hypothesis promotion flow

### Phase 2: Experiments + Billing (6-8 weeks)

**Week 7-9: Experiment Tracking**
- [ ] Hypothesis CRUD (create, update status, attach rationale)
- [ ] Experiment dashboard with status cards
- [ ] Experiment timeline/log view
- [ ] Results visualization (charts, tables)
- [ ] Karpathy Plot (optimization trajectory)
- [ ] Evolving findings document
- [ ] Research state management (phase tracking)

**Week 10-11: Autoresearch Agent**
- [ ] Inngest function: bootstrap (literature survey -> hypotheses)
- [ ] Inngest function: inner loop (experiment cycle)
- [ ] Inngest function: outer loop (synthesis + direction)
- [ ] Real-time agent activity feed via Convex subscriptions
- [ ] Pause/resume/redirect controls
- [ ] Human-in-the-loop intervention points

**Week 12-14: Billing**
- [ ] Stripe integration (subscriptions + one-time purchases)
- [ ] Credit balance tracking
- [ ] Usage metering (per AI call, per search, per experiment)
- [ ] Pricing page UI (3 tiers + credit packs)
- [ ] Usage dashboard
- [ ] Plan management (upgrade/downgrade/cancel)

### Phase 3: Compute + Community (8-12 weeks)

**Week 15-18: GPU Compute**
- [ ] Modal integration for serverless GPU dispatch
- [ ] GPU type selector (T4, A10G, A100, H100)
- [ ] Job queue and status tracking
- [ ] Streaming execution logs
- [ ] Credit deduction based on GPU type + duration

**Week 19-22: Community & Polish**
- [ ] Research forum (posts, replies, categories)
- [ ] Educational content (intro lessons)
- [ ] Cross-project memory search
- [ ] Polish, performance, error handling

### Phase 4: Growth (ongoing)

- [ ] GitHub import/export
- [ ] Collaboration features
- [ ] Custom skill authoring
- [ ] Community skill marketplace
- [ ] API for programmatic access

---

## 10. Pricing & Monetization Model

### Adapted from Orchestra (validated pricing)

| Plan | Monthly | Annual (save ~20%) | Credits/mo | Projects | GPU Access |
|------|---------|-------------------|-----------|----------|-----------|
| **Free** | $0 | $0 | 2,000 | 5 | Basic (T4, A10G) |
| **Pro** | $29 | $24/mo | 10,000 | Unlimited | Advanced (A100, H100) |
| **Max** | $79 | $64/mo | 40,000 | Unlimited | Priority + all GPUs |

### Credit Costs (approximate)
| Action | Credits |
|--------|---------|
| AI message (conversation) | 5-20 (based on length) |
| Literature search | 10 |
| Paper Q&A | 15 |
| Brainstorming session | 25 |
| Experiment plan generation | 30 |
| Experiment execution (CPU) | 50 |
| GPU job - T4 (per minute) | 5 |
| GPU job - A10G (per minute) | 10 |
| GPU job - A100 (per minute) | 25 |
| GPU job - H100 (per minute) | 50 |
| Paper draft generation | 40 |

### Revenue Streams
1. **Subscriptions** -- Primary recurring revenue
2. **Credit packs** -- Burst usage without commitment
3. **GPU compute margin** -- Mark up serverless GPU costs
4. **Enterprise** (future) -- Custom plans, SSO, priority support

---

## 11. Legal & Licensing

### AI-Research-SKILLs (MIT License)
- **Can**: Use, modify, distribute, sell, sublicense, incorporate into proprietary software
- **Must**: Include MIT copyright notice (`Copyright 2025 Claude AI Research Skills Contributors`)
- **Cannot**: Claim Orchestra endorsement
- **Note**: Individual skills reference third-party tools with their own licenses -- verify before use

### Recommendations
1. Include the MIT notice in our codebase where we vendor the skills
2. Add an attribution section in our About/Credits page
3. Don't use "Orchestra" in our branding
4. Each underlying tool (PyTorch, vLLM, etc.) has its own license -- we document but don't redistribute those tools
5. Consider contributing improvements back upstream (good community relations)

---

## 12. Competitive Landscape

| Competitor | What They Do | Our Advantage |
|-----------|-------------|---------------|
| **Orchestra Research** | Full research IDE with GPU compute | We already have a mature editor + auth; can move faster on writing features |
| **Elicit** | AI literature review | We offer the full pipeline, not just literature |
| **Semantic Scholar** | Academic search | We integrate search INTO the research workflow |
| **Paperpal / SciSpace** | AI paper reading/writing | We add experimentation and compute |
| **Google Colab** | Notebooks + GPU | We provide research structure, not just execution |
| **Overleaf** | Collaborative LaTeX editing | We add AI research agents and experiment tracking |

### Our Unique Position
ScholarFlow already has a working **LaTeX editor + AI chat + templates + auth**. Adding the research pipeline (skills, literature, experiments) on top creates a product that's:
1. **More writing-focused** than Orchestra (our editor is already good)
2. **Open-source powered** (MIT skills library = no vendor lock-in)
3. **Full lifecycle** from literature review to published PDF
4. **Accessible** with a free tier that actually works

---

## Appendix A: Key URLs

| Resource | URL |
|----------|-----|
| Orchestra Research | https://www.orchestra-research.com |
| AI-Research-SKILLs GitHub | https://github.com/Orchestra-Research/AI-Research-SKILLs |
| npm package | https://www.npmjs.com/package/@orchestra-research/ai-research-skills |
| Skills welcome.md | https://www.orchestra-research.com/ai-research-skills/welcome.md |
| Semantic Scholar API | https://api.semanticscholar.org |
| arXiv API | https://arxiv.org/help/api |
| Modal (GPU compute) | https://modal.com |
| Orchestra Pricing | https://www.orchestra-research.com/pricing-public |
| Orchestra Mission | https://www.orchestra-research.com/perspectives/mission |
| Autoresearch Demo | https://github.com/Orchestra-Research/AI-Research-SKILLs/tree/main/skills/0-autoresearch-skill |

## Appendix B: UI Screenshots

Screenshots captured from orchestra-research.com are saved at:
- `/Users/danielxie/Desktop/orchestra-screenshots/01-homepage.png` -- Landing page hero
- `/Users/danielxie/Desktop/orchestra-screenshots/02-pricing.png` -- Pricing tiers
- `/Users/danielxie/Desktop/orchestra-screenshots/03-ai-research-skills.png` -- Skills marketplace
