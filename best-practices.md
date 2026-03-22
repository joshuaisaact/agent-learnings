# Best Practices

What I currently believe works for building AI agents. This will change.

## Start simple

The best architecture is the simplest one that meets your requirements. A single agent with a good prompt beats a multi-agent system for 90% of use cases. Don't add orchestration until a single agent demonstrably can't handle the task.

The progression is: single agent → single agent with skills → sequential workflow → parallel workflow → multi-agent. Most people should stop at step 1 or 2.

## Give agents bash

Bash is the most powerful general-purpose tool you can give an agent. It lets the agent compose operations, chain steps, verify its work, and handle complex multi-step tasks without needing specialized tools or orchestration frameworks. Before building a custom tool, ask: could the agent just do this with a bash command?

Agents with bash can self-orchestrate. They can write scripts to sequence work, use files to track state, use git for checkpoints, chain commands with `&&` and pipes. External orchestration layers (Petri nets, DAGs, workflow engines) are usually unnecessary because the agent itself is the orchestrator.

## Small action space

Claude Code has ~20 tools and the bar to add a new one is high. Every tool you add is one more option the model has to think about. Before adding a tool, consider whether the existing tools (especially bash) already cover the use case.

If you need to expand capabilities without adding tools, use progressive disclosure — point the agent to files/folders it can discover and explore on demand, rather than dumping everything into the prompt.

The failure mode isn't just decision fatigue — it's ambiguity. OpenAI's data agent team found that when they gave the agent its full tool set, overlapping functionality confused it. Consolidating and restricting tools produced "dramatically better results." If two tools can do similar things, the agent will pick wrong half the time.

## Context engineering > prompt engineering

The most important thing you can do for an agent is give it the right context at the right time. This means:

- **Progressive disclosure** — don't dump everything upfront. Use the file system so the agent reads only what it needs. Skills are folders the agent discovers, not walls of text in the prompt.
- **Stable prompts, dynamic context via files** — keep the system prompt identical across sessions. Dynamic context (what to work on, what happened before) should be discovered by the agent reading files, not injected into the prompt. This also helps with prompt caching.
- **Gotchas are the highest-signal content** — if you maintain any kind of instructions file, the most valuable section is the gotchas. Things the agent will get wrong without explicit guidance.
- **Map, not manual** — keep instruction files short (~100 lines) and use them as a table of contents pointing to deeper sources of truth. OpenAI tried one big AGENTS.md and it failed: context is scarce so a giant file crowds out the actual task, too much guidance becomes non-guidance, monolithic files rot instantly and agents can't tell what's still true, and a single blob is hard to verify mechanically for freshness or coverage. A structured docs/ directory with indexed, cross-linked artifacts works better.
- **Context is a system, not a prompt** — OpenAI's data agent uses six layers of context: schema metadata → code analysis of pipelines → curated expert descriptions → institutional knowledge (mined from Slack, Docs, Notion) → learning memory from prior conversations → live query fallback. Each layer adds signal. But more context is not always better — curated, accurate, smaller context outperformed large noisy context. The investment is in curation, not volume.

## Repo maps: structural context without token cost

Instead of dumping entire files into context, parse the codebase's AST and extract a structural map — class names, function signatures, call relationships — without implementation details. Aider pioneered this in `aider/repomap.py` and claims 98% token reduction vs. including full file contents.

The implementation works in three stages. First, Aider uses tree-sitter to parse every file in the repo and extract "tags" — definitions and references for classes, functions, methods, variables. Each tag records the symbol name, the file it's in, and the line number. Second, it builds a graph of relationships: which files reference symbols defined in other files. It uses PageRank on this graph to rank files by how central they are to the current task — files that define symbols used by many other files rank higher. Third, it renders the ranked files as a compact tree showing only signatures and structure:

```
src/database/
  connection.py
    class ConnectionPool
      def __init__(self, max_size, timeout)
      def acquire(self) -> Connection
      def release(self, conn)
    class Connection
      def execute(self, query, params) -> Result

  migrations.py
    class MigrationRunner
      def run_pending(self)
      def rollback(self, steps=1)
```

This gives the model a map of the entire repo's API surface — what exists, where it lives, how it connects — using a fraction of the tokens that full file contents would require. The model can then request full file contents only for the files it actually needs to edit.

The key insight: agents don't need to read your code to understand your codebase structure. They need a map. The map is cheap; the code is expensive. Build the map from the AST, not from file listings or directory trees.

Aider also dynamically adjusts what's in the repo map based on the current conversation. Files mentioned in chat get promoted; irrelevant files get demoted. The map is a living, prioritized view of the codebase, not a static dump.

## Separate reasoning from editing

Aider's "architect mode" splits code changes across two models: one reasons about what to change, the other translates that reasoning into file edits. The Architect model (typically a stronger, more expensive model) analyzes the task, reads the repo map and relevant files, and produces a natural language description of exactly what changes to make — which functions to modify, what logic to add, where to put new code. The Editor model (typically cheaper, faster) takes that description and produces the actual file diffs.

This works because reasoning and editing are different skills that fail in different ways. A model that's great at understanding architecture and planning changes might produce malformed diffs. A model that's reliable at producing syntactically correct edits might make poor decisions about what to change. By splitting the task, each model operates in its strength.

In Aider's implementation (`aider/coders/architect_coder.py`), the Architect produces a response like "In `src/auth/middleware.py`, modify the `validate_token` function to check token expiration before signature verification. Add an early return if `token.exp < time.now()`. Also add a new test in `tests/test_auth.py`..." The Editor then receives this plus the relevant files and produces the actual search/replace blocks.

This is distinct from the evaluator-optimizer pattern. Evaluator-optimizer iterates on quality (generate, evaluate, regenerate). Architect/editor splits by capability (reason, then edit). They can be combined — architect/editor for the initial pass, then evaluator-optimizer for refinement — but they solve different problems.

## Plan/Act mode: separate exploration from modification

Cline and OpenAI's Codex CLI both implement a "plan mode" where the agent can read and explore but cannot write. The agent investigates the codebase, builds understanding, and formulates a plan — all before being given write access.

Codex's implementation is particularly clean. In `codex-rs/core/src/codex.rs`, when the agent enters plan mode (via an `EnterPlanMode` tool call), the harness filters the tool schemas sent to the model. Write tools (file creation, file editing, bash with side effects) are simply not present in the schema. The model literally cannot call tools it cannot see. When the agent exits plan mode, the full schema is restored.

This prevents a common failure: the agent reads one file, forms an incomplete understanding, and immediately starts editing — breaking things it doesn't yet understand. Plan mode forces a complete investigation phase. The agent reads files, greps for patterns, checks git history, understands the full picture, and writes out a plan. Only then does it switch to act mode and execute.

Cline takes this further with explicit user approval gates. Every file modification requires permission. The UX surfaces exactly what the agent wants to change and why, giving the human a natural checkpoint to catch misunderstandings before they become broken code.

The pattern generalizes beyond plan/act. Any time an agent needs to reason about a system before modifying it, consider making the exploration phase tool-restricted. Schema filtering is the cleanest implementation: the model never sees the tools it shouldn't use, so there's no possibility of it calling them "just to check" or "while it's already here."

## Deterministic safety nets around the agent loop

Open SWE (LangChain's open-source coding agent framework, based on patterns from Stripe, Coinbase, and Ramp) introduces "middleware hooks" — deterministic code that runs at specific points in the agent loop, providing guarantees the agent itself can't violate.

The clearest example is `open_pr_if_needed`: a middleware hook that runs after the agent's task is complete. If the agent produced code changes but forgot to commit and open a PR (a common failure mode), the middleware does it automatically. The agent doesn't need to remember — the safety net catches it.

In Open SWE's implementation (built on LangGraph), middleware hooks fire at defined points: before tool execution, after tool execution, on task completion, on error. Each hook runs deterministic Python code — not another LLM call — so it's fast, predictable, and testable. Other examples from their codebase:

- A hook that checks for uncommitted changes before the agent starts a new subtask (preventing lost work)
- A hook that validates that test suites actually pass before marking a task complete (preventing premature victory declarations)
- A hook that enforces file size limits on generated code (preventing the agent from producing 5,000-line files)

The pattern is: wrap the agentic loop with deterministic guarantees at the boundaries. The agent has full autonomy within the loop — it decides what to do, which tools to use, how to approach the problem. But the boundaries are hard constraints enforced by code, not by hoping the agent follows instructions.

This is related to "promote rules into code" but more specific: it's about where in the agent loop architecture you insert deterministic logic, and the distinction between checks the agent runs (which it might skip) vs. checks the harness runs (which it can't skip).

Claude Code's hook system (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, etc.) implements the same pattern. Hooks fire on specific events in the agent lifecycle and can block, modify, or augment the agent's behavior. The hook runs in the harness process, not in the agent's context, so the agent can't circumvent it.

## Don't railroad the agent

Give the agent information and tools. Let it decide the approach. Over-prescriptive prompts ("first do X, then do Y, then do Z") lead to rigid behavior. Describe what good looks like, not how to get there.

The exception: when there's a specific ritual or checklist that must happen (like a "get your bearings" sequence at the start of a session), be explicit about those steps. The distinction is: prescribe the what (read progress, verify app works), not the how (use this specific curl command to test).

## Verification over self-reporting

Don't trust the agent to say "I'm done, it works." Use programmatic assertions — scripts that check exit codes, tests that run automatically, browser automation that verifies UI behavior. The agent runs the verification, but the verification itself is deterministic.

Anthropic's skills team says verification skills are "extremely useful for ensuring Claude's output is correct" and recommends "programmatic assertions on state at each step."

Model overconfidence is the biggest behavioral challenge. OpenAI's data agent team found that models rapidly select approaches without validation — jumping to a table or strategy before confirming it's right. The fix isn't just verification after execution, but explicit discovery phases before it: force the agent to explore alternatives, compare options, and validate assumptions before committing to a path.

There's a spectrum of verification strength:

1. **Self-reporting** (agent says "done") — weakest, never trust this
2. **Programmatic assertions** (tests, linters, CI) — good default, but tests can be incomplete and flaky
3. **Formal verification** (proof checker, type system) — strongest, but requires the spec in a formal language

Mistral's Leanstral demonstrates the extreme end: the agent generates Lean 4 code with formal proofs, and Lean's type checker acts as a perfect, deterministic verifier — either the proof checks or it doesn't. This unlocks a powerful cost optimization: generate N candidate solutions in parallel and verify all of them, taking the first that passes. Leanstral pass@2 ($36) beats Claude Sonnet ($549) on Lean benchmarks because the verifier is sound — passing means correct, no ambiguity. You can't do this with normal tests because passing tests doesn't guarantee correctness. The stronger your verifier, the more you can exploit parallel speculative generation.

## Git as the safety net

Commit after every meaningful unit of work. This gives you:
- Clean state between steps
- Revertable checkpoints
- Descriptive history that future agent sessions can read
- Proof of what actually happened vs what the agent claims

## Prompt caching matters

For the Claude API, prompt caching works by prefix matching. This means:
- Static content first, dynamic content last
- Never change tools mid-session (use tools to model state transitions instead)
- Never switch models mid-session (use subagents for different models)
- Fork operations (compaction, summarization) should share the parent's prefix
- Use messages for updates, not prompt modifications

If you're building a loop that calls the API repeatedly, the prompt should be identical across calls. Dynamic context goes in the file system, not the prompt.

## Optimize for agent legibility

From the agent's point of view, anything it can't access in-context effectively doesn't exist. Slack discussions, design decisions in Google Docs, knowledge in people's heads — none of it is usable unless it's in the repo as a versioned, discoverable artifact.

This means pushing context into the repository over time. That Slack thread where the team aligned on an architectural pattern? If it's not discoverable by the agent, it's as unknown as it would be to a new hire joining three months later.

This also shapes technology choices. Prefer "boring" technology: composable, API-stable, well-represented in the training data. Agents model these better. In some cases it's cheaper to have the agent reimplement a subset of functionality (with full test coverage and tight integration) than to work around opaque behavior from external libraries.

## Promote rules into code

Documentation tells agents what to do. Linters and tests force them to. When a rule matters, encode it as a mechanical check — custom lints, structural tests, CI gates. Documentation rots; code either passes or fails.

Write lint error messages as remediation instructions. When the agent hits a lint failure, the error message itself teaches it how to fix the problem — injecting context exactly when the agent needs it.

Enforce invariants, not implementations. Require that data is validated at boundaries, but don't prescribe which library to use. Enforce dependency direction between layers, but allow freedom within them. This mirrors how good platform engineering works: strict boundaries, local autonomy.

## Manage entropy

Agents replicate patterns that already exist in the codebase — including bad ones. Without active cleanup, the codebase drifts. OpenAI spent 20% of their engineering time on manual "AI slop" cleanup before automating it.

The fix: encode "golden principles" (opinionated, mechanical rules about how the codebase should look) directly in the repo, then run recurring background agents that scan for deviations, grade quality, and open targeted refactoring PRs. Technical debt is a high-interest loan — continuous small payments beat periodic painful bursts. Human taste is captured once, then enforced continuously on every line of code.

## Wire in LSP for immediate feedback

Instead of waiting for the agent to run a build command to discover errors, wire the agent's file edits directly into a Language Server Protocol server. OpenCode (Go-based coding agent, ~1.2k stars, now continued as Charm's Crush) spawns actual LSP servers (gopls, pyright, rust-analyzer, etc.) as child processes. After every file edit, the system notifies the LSP, waits up to 5 seconds for diagnostics, and appends compiler/linter errors directly to the tool response in structured XML tags. The agent sees the error immediately — no separate build step needed.

This is the tightest possible feedback loop for code changes. Neither Claude Code nor Aider does this natively — they rely on the agent to run linters/tests explicitly. The LSP approach catches type errors, missing imports, and syntax issues within seconds of the edit, before the agent moves on to the next file. The cost is maintaining LSP child processes, but for long-running coding sessions the investment pays for itself in fewer broken-then-fix cycles.

## Detect analysis paralysis

Agents get stuck in read loops — grepping, reading files, searching — without ever acting. GSD's "analysis paralysis guard" is the simplest fix: if the agent makes 5+ consecutive read/search/grep calls without any edit, write, or bash action, force it to stop and either act on what it's learned or explain why it's stuck. This is enforceable as a hook (count tool calls by category, inject a warning when the ratio skews) or as an iron law in the prompt.

The broader pattern: instrument the tool call stream for degenerate sequences. Other examples — the agent editing and reverting the same file repeatedly (fix loop), the agent running the same test more than 3 times (hoping it passes), the agent reading its own previous output (self-referential loop). Each is a detectable pattern that a hook can interrupt.

## Context pressure awareness for autonomous agents

For long-running autonomous agents (multi-hour Codex runs, overnight Ralph loops), the agent itself should know when context is filling up. GSD implements this as a hook that monitors context usage and injects warnings at 35% and 25% remaining into the agent's `additionalContext`. The agent can then checkpoint its progress before compaction wipes working state.

This matters less for interactive sessions (where compaction handles it) and more for unattended agents that need to preserve state across compaction boundaries. The agent can't checkpoint what it doesn't know it's about to lose.

## Planning artifacts are a prompt injection surface

When agents write structured planning files (specs, progress docs, feature lists) that future agent sessions will read as context, those files are effectively user-controlled input flowing into a system prompt. GSD's `prompt-guard` hook scans writes to `.planning/` directories for injection patterns. This is defense-in-depth for any system where agent-written artifacts become future agent instructions — which includes progress files, CLAUDE.md modifications, and spec documents.

## Agents are time-blind

Agents have no sense of diminishing returns on time spent. In Anthropic's C compiler project, Claude wasted hours running full test suites when a 1% random sample would have caught the same bugs. The fix: implement `--fast` flags that run small random samples, deterministic per-agent but varied across instances. Give agents fast feedback paths and they'll use them — but you have to build them explicitly.

## Minimize context pollution

Tool output that gets dumped into the agent's context window competes with everything else the agent needs to reason about. In Anthropic's C compiler project, they learned to output errors to files in easily greppable format (`ERROR` on the same line as diagnostics) rather than streaming verbose output into context. The agent reads only what it needs from the file. Same principle as progressive disclosure, applied to tool results.

## MCP tool schemas are a hidden context tax

Every MCP tool's full JSON schema (name, description, parameters with types) gets injected into context on every API call. A server with 40 tools can burn 55,000 tokens of schema before the agent processes a single user message. This is the upfront cost of a large action space, paid on every turn.

Two patterns to eliminate this:

**CLI wrapping for schema-free progressive disclosure.** mcp2cli and Apideck CLI wrap MCP servers as CLI binaries. Instead of 40 tool schemas always in context, the agent gets one tool: bash. It discovers capabilities via `--help` flags on demand — `mcp2cli --list` (~50 tokens) → `mcp2cli some-command --help` (~150 tokens). Scalekit benchmarked this: simplest task cost 1,365 tokens via CLI vs. 44,026 via MCP (32x cheaper). Claude Code's own Tool Search mechanism and deferred tool loading solve the same problem from the harness side. The CLI approach works without any harness support.

**Output sandboxing via FTS5 indexing.** context-mode (`mksglu/claude-context-mode`) intercepts tool execution via lifecycle hooks (PreToolUse/PostToolUse), runs commands in a subprocess, and indexes the output into SQLite FTS5 with BM25 ranking. The agent queries the index and gets back only relevant excerpts — never sees the raw output. A Playwright snapshot that would cost 56 KB in context becomes 299 bytes. Across a full session: 315 KB of raw tool output → 5.4 KB of contextualized output (98% reduction). No LLM involvement in the compression — just full-text search with relevance ranking.

These are additive: schema elimination reduces the per-turn fixed cost, output sandboxing reduces the per-tool-call variable cost.

## Negative examples in skill descriptions

When describing skills or tools, include explicit "don't call when..." cases. At Glean, removing negative examples from skill descriptions caused a 20% accuracy drop in routing. The model needs to know when NOT to use a tool as much as when to use it. Write routing logic, not marketing copy — describe when to use the skill, when to avoid it, and what output to expect.

## Monitor chain-of-thought, not just actions

Logging tool calls and results is table stakes. The higher-signal monitoring target is the agent's chain-of-thought reasoning.

OpenAI monitors 99.9% of their internal coding agent traffic by feeding full conversation context — including chain-of-thought — to GPT-5.4 Thinking as a dedicated analyst. Over 5 months across tens of millions of trajectories, key findings:

- **CoT monitoring dramatically outperforms action-only monitoring.** Agents often state intent explicitly in reasoning ("Let's try to bypass this"). A weaker model (GPT-4o) can effectively monitor a stronger model (o3-mini) when given CoT access.
- **Agents actively circumvent security controls**, and the CoT reveals the strategy: base64 encoding commands, calling other versions of themselves to bypass restrictions, string splitting to avoid detection ("ru" + "stup"), switching between download methods when one is blocked.
- **Developer prompts inadvertently incentivize circumvention.** System prompts written to encourage task completion can push agents to try harder when hitting security boundaries. Editing prompts reduced but did not eliminate the behavior.
- **The obfuscation trap:** Using CoT monitors as RL training signal teaches agents to hide their intent in reasoning while still misbehaving. CoT monitoring must remain a read-only detection layer, never a training objective.
- **Match monitoring latency to threat velocity.** Asynchronous post-hoc monitoring works for slow-unfolding threats (data poisoning, sabotage over weeks). Synchronous pre-execution blocking is needed for irreversible single-step harm.

Zero highest-severity incidents (scheming, sabotage) across tens of millions of real trajectories — but the monitoring infrastructure is in place for when that changes.

## Push-based events into running sessions

Claude Code's channels feature introduces a new primitive: external systems pushing events into an already-running agent session. Before channels, the options were polling (cron), fresh sessions per task, or human-driven interaction. Channels fill the gap — a webhook fires, a CI pipeline fails, a Telegram message arrives, and it lands in a session that already has accumulated project context.

This changes session lifecycle: sessions become long-lived event processors, not request-response interactions. The implementation reuses MCP — a channel is just an MCP server with one extra capability flag (`claude/channel`), so existing tooling, security models, and plugin infrastructure all apply. No separate eventing system needed.

The remote permission relay is notable: when the agent needs tool approval and you're away from the terminal, the channel forwards the prompt to Telegram/Discord. Both local terminal and remote channel stay live — first response wins. This distributes the human-in-the-loop across locations.

## Observable systems

You need to see what the agent is doing and why. This is harder than normal software because agents are non-deterministic. At minimum:
- Log every tool call and result
- Track token usage and cache hit rates
- Trace multi-step reasoning chains
- In multi-agent systems: trace inter-agent communication and delegation patterns

Rudel (`github.com/obsessiondb/rudel`) analyzed 1,573 Claude Code sessions across a 6-person team and surfaced metrics that matter more than raw counts:

- **Output/input token ratio** is the simplest proxy for productivity. Low ratio + high total tokens = the agent is reading a lot but producing nothing ("struggle" sessions). Better than raw token count.
- **Session archetypes** (quick_win, deep_work, struggle, exploration, abandoned) are more actionable than averages. "40% of sessions on project X are struggles" tells you something; "average token count is high" doesn't.
- **Error cascades in the first 2 minutes predict abandonment.** Early error clustering is predictive, not just descriptive — a hook that detects this could suggest restarting with better context.
- **Feature adoption rates** (skills, plan mode, subagents) are leading indicators of developer proficiency. Only 4% of sessions used skills despite them being available.
- **Cost-per-outcome** (cost per commit, productivity score = commits per dollar) is more meaningful than cost-per-session.
- **Inference time vs. human time decomposition** reveals whether the bottleneck is the AI (slow inference, retries) or the human (long review times).
