# Harness vs Model

A pattern is emerging across recent agent research: capabilities currently implemented as harness scaffolding are being absorbed into trained model behavior. The harness still matters — but the band of work that genuinely belongs to it is shrinking, and the part that survives is changing shape. Understanding which side a given pattern lives on (or will live on within 18 months) is one of the highest-leverage design questions for anyone building agents today.

## The thesis

For every pattern an agent harness currently assembles externally — Best-of-N sampling, plan-act-review loops, hierarchical orchestration, RAG-style memory — there's a research path that absorbs it into the model itself. The harness in 2024 looked like a workflow engine. The harness in 2027 looks more like an OS kernel.

This isn't speculation. The evidence is in [research-directions.md](research-directions.md):

- **HeavySkill** trains parallel reasoning + summarization into the model parameters. Best-of-N sampling becomes redundant.
- **Conductor (Sakana AI)** trains a 7B model to learn communication topologies and per-agent prompts between worker models. Hand-designed multi-agent orchestration becomes redundant.
- **δ-mem** and **Contextual Agentic Memory is a Memo** point at memory mechanisms that operate at the model level, not the harness level. RAG and progress files become scaffolding to be removed.

Add to this Cursor's RL-trained self-summarization (already in [sources.md](sources.md)), which absorbs context compaction into the model. The direction is consistent across labs, model families, and problem domains.

## The rule

What gets absorbed isn't random. The pattern is sharp:

> **Coordination decisions move into the model; environmental constraints stay in the harness.**

When the model can decide *when* to deliberate, *who* to hand off to, *what* to remember — those decisions move inside. The harness's job becomes providing the substrate those decisions act on: the compute, the worker pool, the storage, the tool surface area.

This gives a clean test for new harness work:

> **The model decides; the harness provides.**

If you're building infrastructure that *makes a decision the model is increasingly capable of making* — pick the best of N samples, route between agents, summarize when context fills — that infrastructure is on borrowed time. If you're building infrastructure that *enables a decision the model can't make for itself* — grant a new tool, gate a permission, run a verification check, audit a trace — that infrastructure survives.

## What gets absorbed

| Today's harness work | Why it's moving into the model |
|---|---|
| Best-of-N sampling, plan-act-review loops, self-consistency aggregators | Deliberation is becoming a trained skill (HeavySkill) |
| Hierarchical agent topology, role decomposition, hand-crafted handoff prompts | Coordination is becoming a learned policy (Conductor) |
| Progress files, RAG over history, vector store memory, scratchpads | Memory is becoming a trained mechanism (δ-mem, Contextual Memory) |
| Compaction, summarization of past sessions | Already a learned skill in production systems (Cursor's RL-trained self-summarization) |
| Skill selection routing in large libraries | Implicit — selection is a decision, and the next move is to train better selection |

## What survives — build here, confidently

The enduring harness role is *environmental* — things the model categorically can't do for itself because they're properties of the world it operates in:

- **Tool definitions and capability boundaries.** The model can't grant itself a new tool. The set of operations available is set by the harness.
- **Permission systems and sandboxing.** What the agent is *allowed* to do is environmental. Will be more important, not less, as orchestration becomes learned and harder to predict per-call.
- **Verification.** Programmatic checks — tests passing, types checking, linters clean, formal proofs — are external. The model can't run them on itself, and a learned orchestrator can't sneak past a deterministic verifier.
- **Skill provenance and trust.** The supply-chain framing from [Skills as Verifiable Artifacts](skills.md#skills-are-untrusted-code) grows with skill catalog size, not shrinks. Trust schemas, capability gates on verification status, audit trails for unverified skills.
- **Observability and trace replay.** The more learned the orchestration, the harder it is to predict and the more critical visibility becomes. You can't debug what you can't see.
- **Storage primitives.** δ-mem says the model decides what to remember, but the harness still provides the storage substrate. Same for files, databases, external APIs, search indexes.
- **Time, identity, and external state.** The model doesn't know what time it is or which environment it's in until the harness tells it.

## Design implications

1. **Wrap deliberation thin, not deep.** Best-of-N orchestration, plan-act-review loops, self-consistency aggregators — build them as thin shims around the model, not as optimized infrastructure. Their replacement is already in training pipelines. Don't put your best engineering into a layer that's on borrowed time.

2. **Stop designing topology. Provide capability pools.** Conductor's implication for design is immediate: the *structure* of multi-agent systems will be learned. Your harness's job is to compose the capabilities — what each worker can do, what permissions it has, what its output looks like — not to decide who routes to whom. If you find yourself drawing org charts for your agents, you're working on the wrong layer.

3. **Treat textual memory as scaffolding.** Progress files, get-bearings rituals, compaction passes, RAG over conversation — these solve a model-level deficiency. Build them so the textual layer can be lifted out cleanly when a model-level memory mechanism lands. Don't bake textual memory into APIs or contracts you'd be embarrassed to deprecate.

4. **Make capability boundaries excellent.** Tool definitions, permission models, sandbox isolation. These are the floor and they survive every model upgrade. If you have a fixed engineering budget, this is where it earns the most compounding return.

5. **Invest in verification.** Programmatic checks have always mattered, but they matter more in a world where coordination is learned and you can't predict in advance what an orchestrator will try. A verifier that can run on any agent output is leverage across every future agent you build.

6. **Build observability assuming you don't understand what the agent will do.** A learned orchestrator is harder to debug than a hand-written one. Logs, traces, replay, decision provenance — the more learned your stack, the more you need them.

## The compiler analogy

The shape of this transition mirrors how compilers absorbed manual assembly programming. A serious systems programmer in 1955 wrote assembly because compilers couldn't generate competitive code. By 1985, writing assembly for new code was an exotic specialization. The compiler didn't make assembly disappear — kernel hot paths, embedded code, specific tight loops still need it — but the *defaults* inverted. High-level code first; assembly only when proven necessary.

The same inversion is starting for agent harnesses. The default today is "build harness logic to coordinate the model." The default within a few years is "let the model coordinate, build harness logic only where the model can't reach." Best-of-N orchestration is becoming the agent-engineering equivalent of writing assembly for a sort routine — sometimes still right, mostly the wrong abstraction layer.

## The harness as kernel

The right framing for what stays harness work: **operating system kernel for an agent**.

The kernel manages capabilities (syscall table → tool catalog), permissions (process privileges → permission tiers), isolation (process boundaries → sandboxes), observability (kernel traces → agent traces), and storage primitives (filesystems → memory substrates). The userland process — the model — decides how to use those primitives.

A good kernel is small, careful, and stable. Userland is where most of the work and most of the diversity lives. That's where agents are heading: a thin, sharp harness that exposes capabilities and enforces invariants, and a model that does the coordination work that used to live in middleware.

## Rough allocation for new harness work

If you're starting a new harness today, the rough allocation of engineering effort that makes sense:

- **20%** — tool definitions, capability boundaries, sandboxing
- **20%** — verification, programmatic checks, formal verifiers where possible
- **15%** — observability, traces, replay, decision provenance
- **15%** — permission and trust systems, including skill verification gating
- **10%** — storage primitives (files, memory substrates, external state)
- **10%** — thin coordination shims (Best-of-N, multi-agent routing), minimal and replaceable
- **10%** — scaffolding memory (progress files, compaction), designed to be lifted out

The numbers aren't load-bearing — the point is the *ratios*. If your harness has the inverse weighting (60% coordination logic and elaborate memory scaffolding, 20% capability surface, 20% everything else), you're putting your best engineering into infrastructure that the next model generation will replace. Reorient.

## Closing

The mistake to avoid is treating today's harness patterns as durable architecture. They're scaffolding around a specific generation of models. The patterns that endure are environmental — what the agent *can* do, who's *allowed* to use it, *how* to see what happened, *whether* the result is correct.

Build the kernel. Let the model be the userland.
