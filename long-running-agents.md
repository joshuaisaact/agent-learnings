# Long-Running Agents

How to make agents work across multiple context windows (hours/days). The core challenge: each new session starts with no memory of what came before.

## The two failure modes

From Anthropic's research and my own experience:

1. **Agent tries to do too much at once.** Attempts to one-shot the whole task, runs out of context mid-implementation, leaves a mess for the next session.
2. **Agent declares victory too early.** Sees some progress has been made, assumes the job is done.

## What works

### Initializer / coder split

First session is special — it sets up the environment for all future sessions:
- Scaffold the project
- Generate a feature list (comprehensive, ordered by dependency, each feature small enough for one session)
- Write helper scripts (start dev server, run verification, reset state)
- Write a progress file with initial decisions and patterns
- Commit everything

Every subsequent session is a "coder" session: read progress, pick next feature, implement, verify, commit, update progress.

### Spec-driven handoff between planner and worker

A more structured variant of the initializer/coder split: a Planner agent produces a full design spec per feature (problem statement, solutions considered, chosen approach, implementation plan, files to modify, verification steps), and a Worker agent implements from that spec in a fresh session with zero conversation history.

The spec file is the coordination primitive. It carries more information than a feature list entry (which is just a title and pass/fail) and is more structured than a progress file (which is a session log). The Worker reads the spec directly from the file system — no information passes through conversation, avoiding the "telephone game" degradation.

An additional benefit: archived specs become searchable decision traces. After hundreds of features, agents doing exploratory work rediscover past specs and learn what was previously considered and rejected. Design decisions that would normally live in Slack threads or people's heads are in the repo as versioned, discoverable artifacts. This is the "optimize for agent legibility" principle applied to decision history.

### Progress file

A structured text file read at start and appended at end of each session. Two sections:

**Codebase Patterns** (top, highest-signal): ORM patterns, file conventions, gotchas discovered. Updated whenever a new pattern is found. This is the cross-session "cache" — the mechanism for preserving learned knowledge between context windows.

**Session log** (bottom, chronological): What was done, files changed, gotchas found.

The progress file is to multi-session agents what prompt caching is to the API — it preserves computation across boundaries. Quality of this file directly impacts cost, because it determines how fast each session orients.

### Feature list as contract

JSON file where agents can ONLY change `passes: false → true`. Prevents goal drift, premature completion, and scope creep. Agents can't remove features, redefine them, or add new ones.

Anthropic uses JSON specifically because "the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files."

### One feature per session

Incremental progress. Never try to do too much. Implement one feature, verify it, commit, move on. This was "critical to addressing the agent's tendency to do too much at once" (Anthropic).

### Get-bearings ritual

Every coder session starts with the same checklist:
1. Read progress file (especially codebase patterns)
2. Read feature list (what's done, what's next)
3. Check git log (recent commits)
4. Start dev server
5. Smoke test (verify app works before touching anything)
6. If broken → fix first, commit, log it

This is part of the prompt, not infrastructure. It's a fixed sequential checklist — doesn't need a state machine or workflow engine.

### Verification scripts

Don't trust self-reporting. The initializer generates scripts that programmatically verify each feature. The coder runs the script after implementing. If it passes, the feature passes. Harder gate than "did you do it? yes I did."

### Git commits between features

Every feature gets its own commit. Clean state, descriptive message, revertable. If the next session finds things broken, `git revert` is faster than debugging.

## What doesn't work

### Parallel execution (without coordination)

Multiple agents writing to the same codebase simultaneously causes write conflicts, inconsistent state, and coordination failures. Sequential is slower but dramatically more reliable for overnight runs.

The exception: Anthropic's C compiler project ran 16 parallel agents successfully using git-based task locking — agents claim tasks by writing files to `current_tasks/`, with merge conflicts forcing re-selection. This works because agents coordinate through git (a structured protocol) rather than through shared mutable state. The task decomposition also matters: they broke a monolithic goal (compile Linux) into independent subtasks by using GCC as an oracle for portions Claude wasn't working on, so agents fixed different bugs in parallel rather than stepping on each other.

### Dynamic replanning

Planners that observe the codebase and generate new items across iterations get confused about what exists vs what doesn't. A one-shot feature list from the initializer works better than continuous replanning.

### Unstructured browser observation

Giving agents raw browser tools (screenshots, console logs) without structure leads to 30+ minute screenshot loops — the agent sees an error, tries to fix it, screenshots again, sees another error, loops forever. The problem isn't browser observation itself, but the lack of tight feedback loops. OpenAI made this work by isolating each task in its own worktree with its own app instance and observability stack, building skills for bounded DOM interaction (not raw CDP), and pairing screenshots with queryable signals (logs, metrics, traces). The agent asks specific questions ("does startup complete in under 800ms?") rather than open-ended "does this look right?"

### No context transfer

Each session starting cold with no memory of previous sessions is the single biggest failure mode. The progress file pattern exists specifically to solve this.

## Compaction: surviving context limits mid-task

Long-running agents inevitably hit context window limits. Compaction is the mechanism for continuing work across that boundary without starting a new session.

OpenAI's Codex CLI (open source at `github.com/openai/codex`, implemented in `codex-rs/core/src/compact.rs`) has three compaction modes:

**Pre-turn compaction** runs before a new user message when token usage is high. The harness asks the model to produce a "handoff summary for another LLM that will resume the task" — what's been done, what's in progress, what decisions were made, what's left. The entire conversation history is then replaced with this summary plus the original system prompt. The agent continues with a compressed but coherent view of the work so far.

**Mid-turn compaction** is trickier. If the agent is deep in a multi-step tool-use loop (edit file → run tests → fix error → run tests again) and hits the token limit, the harness compacts without interrupting the loop. The summary must be injected before the last user message so the model still sees the current task context. Initial reference context (AGENTS.md, etc.) is cleared and re-injected on the next turn, since the compaction summary captures the essential state.

**Remote compaction** (Codex-specific) uses a server-side `/responses/compact` endpoint that operates in latent space — it returns opaque encrypted content that preserves the model's internal understanding without human-readable text. This avoids the lossy translation of "summarize this conversation" and the quadratic cost of growing context windows.

When compaction itself hits context limits (the conversation is too large even for the compaction call), the harness progressively trims the oldest history items and retries. It's compaction all the way down.

The key design principle: compaction is not an afterthought. It's a core loop primitive that fires automatically based on token budgets. If you're building a harness for long-running tasks, design compaction into the agent loop from the start, not as error handling for "context window exceeded."

## Observer agent for automatic memory capture

Claude-Mem (`github.com/thedotmack/claude-mem`) runs a second Claude instance as a "note-taker" — all tools disabled, it can only receive and respond to text. Every tool call from the primary session (file reads, edits, bash commands) is forwarded to the observer via the PostToolUse hook. The observer compresses raw tool I/O into structured records: what was investigated, what was learned, what was completed, what's next. These records go into SQLite with FTS5 search, and are injected back into future sessions via SessionStart.

This separates "doing work" from "recording what happened." The primary agent doesn't spend context on memory management — the observer handles it asynchronously. The tradeoff is real: you're running a second Claude instance processing every tool call, which meaningfully increases API costs. For most projects, a well-maintained progress file achieves 80% of the benefit at zero cost. The observer pattern makes sense for teams running many long sessions on large projects where automated knowledge capture has compounding value and manual progress tracking doesn't scale.

## Git-backed persistent memory

Letta Code (`github.com/letta-ai/letta-code`) takes the progress file pattern to its logical conclusion: agent memory is a first-class, version-controlled data structure that persists across sessions, not a text file the agent appends to.

In Letta's architecture, each agent has a "context repository" — a git-backed store where every change to the agent's memory is a commit with a message describing what was learned. The agent's `/init` command triggers deep codebase analysis that populates initial memories (project structure, key patterns, architectural decisions). The `/remember` command explicitly prompts reflection and knowledge consolidation — the agent reviews what it just did and decides what's worth persisting.

What makes this different from a progress file:

- **Branching**: Multiple subagents can work on divergent memory branches and merge their learnings. One agent explores auth patterns while another explores database patterns; their memories merge when both are done.
- **Rollback**: If an agent learns something wrong (misidentifies a pattern, records a stale convention), the memory change is a commit that can be reverted without losing everything else.
- **Model-independent**: The same memory store works across Claude, GPT, Gemini. The memory layer is decoupled from the model, so switching models doesn't mean starting over.
- **Structured retrieval**: Instead of reading a monolithic text file, the agent queries its memory store for relevant entries. Memories have metadata (when learned, confidence, topic) that supports filtering.

The progress file is still the right starting point — it's simple and it works. But for systems that run hundreds of sessions over weeks, structured persistent memory with version control is the next step. The core insight is the same (preserve computation across context boundaries), but the implementation is more robust.

## The simplest implementation

OG Ralph: 15 lines of bash that pipe a prompt into Claude Code in a loop. The prompt says "read prd.json, pick the next unfinished story, implement it, commit, mark it done." Memory persists via git history and progress.txt. That's it.

Princeton's mini-swe-agent (`github.com/SWE-agent/mini-swe-agent`) takes this even further: ~100 lines of Python that score >74% on SWE-bench Verified. The entire agent loop is: read the issue, explore relevant files, make edits, run tests, submit. No framework, no orchestration, no state machine. The essential agent loop is tiny — everything else is optimization.

Everything else (task orchestration via Petri nets, adaptive strategies, parallel tracks, dynamic replanning) is optimization that may or may not be worth the complexity. Start with the bash loop. Note: this applies to *task orchestration* — safety layers that gate tool access (deterministic hooks, formal safety nets) are a separate concern that sits alongside the agent loop, not a replacement for it.
