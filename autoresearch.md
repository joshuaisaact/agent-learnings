# Autoresearch

Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) (March 2026) is a ~630-line Python setup that lets an AI coding agent autonomously run ML experiments on a single GPU. No framework, no orchestrator — just a training script, a data prep script, and a markdown file of instructions.

It's the clearest example I've seen of the "agent as researcher" pattern actually working.

## How it works

Three files:
- `prepare.py` — data prep, tokenizer, eval. Read-only. The agent can't touch it.
- `train.py` — model, optimizer, training loop. The **only** file the agent edits.
- `program.md` — instructions, constraints, and methodology for the agent.

The loop: agent reads code, forms a hypothesis, edits `train.py`, commits to git, trains for exactly 5 minutes wall-clock, checks if `val_bpb` improved, keeps or reverts, repeats forever until you stop it.

That's it. The entire orchestration framework is a markdown file and git.

## Results

Over 2 days, ~700 experiments, ~20 real improvements. Time-to-GPT-2 dropped 11%. Found things Karpathy missed after two decades — forgotten weight decay on value embeddings, insufficiently tuned Adam betas. These interacting hyperparameters are exactly where autonomous exploration beats human intuition.

Tobi Lutke ran it overnight: 37 experiments, 19% performance gain.

## What makes it work

**One file, one metric.** `train.py` is the only mutation point. `val_bpb` is the only objective. This is the "small action space" principle taken seriously — the agent can't wander into yak-shaving because there's nothing else to touch.

**Fixed time budget.** 5 minutes per experiment. Makes results comparable across hardware, gives you ~100 experiments overnight. The time constraint is doing real work — it forces the agent to make changes that matter within a tight window rather than chasing elaborate multi-hour training schemes.

**Git as experiment log.** Every experiment is a commit. Full history of what was tried, what worked, what was reverted. No separate experiment tracking system needed.

**Simplicity as explicit constraint.** From `program.md`: a 0.001 improvement from deleting code is worth keeping. A minor improvement requiring 20 lines of hacky code is not. This prevents the agent from accumulating clever garbage that makes future experiments harder to reason about.

**The instructions *are* the system.** `program.md` is itself an optimizable artifact. Karpathy frames these instruction files as objects you can meta-optimize — tune the instructions to get better agent behavior, which gets better experiments.

## What's generalizable

The pattern doesn't need a GPU or ML training. The core loop is:

1. Agent edits code
2. Agent runs it and measures a metric
3. Keep or revert based on the metric
4. Repeat

This works for anything with a programmatic evaluation: optimizing latency, throughput, prompt quality, memory usage, bundle size. The GPU is an implementation detail of *this particular instance*.

For the ML case specifically, the GPU doesn't need to be local. People have decoupled the agent from compute:
- SkyPilot: Claude Code locally, training dispatched to cloud H100s via `sky launch`. ~910 experiments in 8 hours, ~$300.
- Google Cloud Run: Serverless GPUs billed per-second, ~$2/hour.
- Various forks for consumer GPUs (RTX), Mac, AMD.

Claude Code (Opus) works as the agent — `program.md` is structurally a Claude Code skill. Someone already [turned it into one](https://alirezarezvani.medium.com/i-turned-karpathys-autoresearch-into-a-agent-skill-for-claude-code-that-optimizes-anything-here-97de83f2b7f0).

## Case study: autoresearch-sudoku (no GPU, pure algorithms)

[autoresearch-sudoku](https://github.com/Rkcr7/autoresearch-sudoku) proves the pattern works without ML or GPUs. Same loop — edit code, benchmark, keep or revert — applied to optimizing a Sudoku solver in Rust. Claude Code as the agent. 312 experiments over ~24 hours, zero human-written solver code.

The results are hard to believe: beat [Tdoku](https://t-dillon.github.io/tdoku/) (the #1 general-purpose Sudoku solver since 2019) on the hardest benchmarks. 49% faster on Hard 11+, 93% faster on Hard 1106 (hardest known puzzles). Tdoku only wins on trivial puzzles where its SIMD propagation solves without backtracking.

**Setup mirrors Karpathy's exactly:**
- One editable file: `src/solver.rs`
- One metric: microseconds per puzzle across 748K benchmark puzzles
- `program.md` with constraints, strategy hints, and "NEVER STOP"
- `results.tsv` as experiment log, git as version control
- Full benchmark runs in ~60-90 seconds (vs Karpathy's 5-minute training runs)

**What's new and interesting:**

*The human steered via `program.md` updates.* Not fire-and-forget — the author updated `program.md` 8-10 times during the run. Biggest intervention: switching from a fast 20-puzzle eval (Phase 1, 255 experiments) to the real 748K-puzzle benchmark suite (Phase 2, 57 experiments). This is "human as research advisor" — set direction, the agent does the work.

*Deliberately unreachable targets.* The `program.md` includes targets no solver has ever achieved simultaneously, to prevent the agent from declaring victory and getting conservative. "No solver in history has achieved all 5 simultaneously. We will be the first." This is clever prompt engineering — manufactured ambition.

*Agent loss aversion is real.* After achieving good results, the agent started playing it safe — "let me focus on something I CAN do NOW." Had to be told to be fearless and do complete rewrites. This matches a known failure mode: coding agents get conservative after wins. The fix was direct in `program.md`: "be fearless, rewrite everything."

*76% discard rate is healthy.* 222 of 312 experiments were reverted. The agent tried radical rewrites that failed (FSSS2 bitboard: 6x slower, Tdoku SIMD port: crashed) and that's fine because git makes reverting free. High experiment volume with cheap failure is the whole point.

*The agent re-derived decades of human work.* Constraint propagation, hidden singles, locked candidates, OR-accumulation, SIMD vectorization, band-oriented data structures — all independently discovered by the agent and combined in ways no existing solver does.

## Connection to other learnings

This validates several things from [best-practices](best-practices.md) and [long-running-agents](long-running-agents.md):

- **The progress file pattern.** `results.tsv` is a progress file. The agent logs every experiment, reads it to understand history, and uses it to decide what to try next.
- **Verification over self-reporting.** The agent doesn't decide if an experiment worked — the metric does. Programmatic evaluation, not vibes.
- **Simple agents over complex orchestration.** No multi-agent system. No task queue. One agent, one loop, one markdown file.
- **The agent IS the orchestrator.** There's no separate system deciding what experiments to run. The agent reads results, forms hypotheses, and picks the next thing to try.
- **Bash loops over frameworks.** The entire experiment infrastructure is `uv run train.py > run.log 2>&1` and `git revert`.

## The "Loopy Era" thesis

Karpathy uses autoresearch to argue a broader point: agents that close feedback loops without human intervention will become standard. He distinguishes this from old AutoML, which was grid search over a predefined config space. Autoresearch uses an LLM that can read source code, form novel hypotheses, access research, and write arbitrary changes. The search space is unbounded.

His stated next step: not emulating a single PhD student, but emulating a research community — multiple agents exploring different directions asynchronously.

Key quote: "If you can't evaluate it, then you can't auto-research it." The hard prerequisite is an objective, programmatic metric. Everything else is details.
