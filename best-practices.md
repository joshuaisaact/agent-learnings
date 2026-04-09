# Best Practices

What I currently believe works for building AI agents. This will change.

## Start simple

The best architecture is the simplest one that meets your requirements. A single agent with a good prompt beats a multi-agent system for 90% of use cases. Don't add orchestration until a single agent demonstrably can't handle the task.

The progression is: single agent → single agent with skills → sequential workflow → parallel workflow → multi-agent. Most people should stop at step 1 or 2.

The evidence for this keeps getting stronger. Stanford tested LLM agent teams across MMLU Pro, GPQA, HLE, MATH-500, and organizational psychology tasks and found that teams *systematically* fail to leverage their best member's expertise. The mechanism is "integrative compromise" — non-expert agents average expert and non-expert views instead of deferring. Even when teams are explicitly told which agent is the expert, performance barely improves. Larger teams make it worse: statistically significant degradation from 2 to 8 agents. The root cause is RLHF alignment training, which optimizes for agreeableness over epistemic deference. The agents are trained to be helpful and collaborative, which means they compromise when they should defer.

CooperBench confirms this for coding specifically: solo agents achieve ~50-63% success on collaborative coding tasks, while 2-agent teams drop to ~25-29%. Communication between agents reduces merge conflicts but has approximately zero effect on task success — agents talk past each other. 42% of failures are "expectation failures" where an agent ignores what its partner explicitly communicated. The information was received; it just wasn't incorporated. Prompt engineering targeting these failure modes produced marginal improvements — these are fundamental capability gaps, not prompt-fixable.

One wrinkle: the same integrative compromise that kills expert performance *protects* against adversarial agents. If you have untrusted participants in the mix, multi-agent consensus has value. But if all agents are trusted, a single expert agent outperforms a team.

A separate study found that multi-agent systems can often be "compiled" into a single agent with a skill library — achieving ~54% token reduction and ~50% latency reduction with equivalent accuracy on GSM8K, HumanEval, and HotpotQA. The compilation fails when tasks require true parallelism, agents maintain private state, or agents have adversarial objectives. For sequential workflows, single-agent-with-skills is strictly better.

## Give agents bash

Bash is the most powerful general-purpose tool you can give an agent. It lets the agent compose operations, chain steps, verify its work, and handle complex multi-step tasks without needing specialized tools or orchestration frameworks. Before building a custom tool, ask: could the agent just do this with a bash command?

Agents with bash can self-orchestrate. They can write scripts to sequence work, use files to track state, use git for checkpoints, chain commands with `&&` and pipes. External orchestration layers (Petri nets, DAGs, workflow engines) are usually unnecessary because the agent itself is the orchestrator.

## Small action space

Claude Code has ~20 tools and the bar to add a new one is high. Every tool you add is one more option the model has to think about. Before adding a tool, consider whether the existing tools (especially bash) already cover the use case.

If you need to expand capabilities without adding tools, use progressive disclosure — point the agent to files/folders it can discover and explore on demand, rather than dumping everything into the prompt.

The failure mode isn't just decision fatigue — it's ambiguity. OpenAI's data agent team found that when they gave the agent its full tool set, overlapping functionality confused it. Consolidating and restricting tools produced "dramatically better results." If two tools can do similar things, the agent will pick wrong half the time.

There's a hard number for this. Skill/tool selection accuracy doesn't degrade gradually as the library grows — it hits a phase transition cliff at ~50-100 skills (GPT-4o class models). Below that threshold: >90% selection accuracy. Above 200: ~20%. The decay is super-linear (exponent >1), not gradual. And the driver is semantic confusability between skills, not raw count — adding one near-duplicate skill at a library size of 20 caused a 7-30% accuracy drop, while adding semantically distinct skills had no effect. Instruction complexity (30 tokens vs. 300 tokens per skill definition) had zero measurable effect on selection accuracy. The bottleneck is choosing the right tool, not understanding what it does.

The fix for large libraries is hierarchical routing: select a domain/category first, then select a specific skill within it. This recovers 37-40% absolute accuracy above the threshold by ensuring each decision stage operates within the reliable capacity regime. Claude Code's Tool Search mechanism and Codex's skill system both implement variants of this pattern.

## Context engineering > prompt engineering

The most important thing you can do for an agent is give it the right context at the right time. This means:

- **Progressive disclosure** — don't dump everything upfront. Use the file system so the agent reads only what it needs. Skills are folders the agent discovers, not walls of text in the prompt.
- **Stable prompts, dynamic context via files** — keep the system prompt identical across sessions. Dynamic context (what to work on, what happened before) should be discovered by the agent reading files, not injected into the prompt. This also helps with prompt caching.
- **Gotchas are the highest-signal content** — if you maintain any kind of instructions file, the most valuable section is the gotchas. Things the agent will get wrong without explicit guidance.
- **Map, not manual** — keep instruction files short (~100 lines) and use them as a table of contents pointing to deeper sources of truth. OpenAI tried one big AGENTS.md and it failed: context is scarce so a giant file crowds out the actual task, too much guidance becomes non-guidance, monolithic files rot instantly and agents can't tell what's still true, and a single blob is hard to verify mechanically for freshness or coverage. A structured docs/ directory with indexed, cross-linked artifacts works better.
- **Intent debt kills before context debt does** — context engineering assumes the goals are captured somewhere and just need to be surfaced. But often they aren't. "Intent debt" (Margaret-Anne Storey's term) is when goals, rationale, and constraints were never written down — they live in Slack threads, meetings, or people's heads. The agent can't work toward goals that don't exist as artifacts. This is upstream of context engineering: before optimizing what context the agent sees, make sure the intent is captured at all.
- **Precision over recall in context retrieval** — missing context is recoverable (the agent can search again); bad context is corrosive (it pollutes downstream reasoning). Cognition's SWE-grep trains with weighted F1 where precision matters more than recall. This flips the intuition that more context is safer — it's not, because irrelevant context actively degrades the agent's reasoning about the relevant parts.
- **Context is a system, not a prompt** — OpenAI's data agent uses six layers of context: schema metadata → code analysis of pipelines → curated expert descriptions → institutional knowledge (mined from Slack, Docs, Notion) → learning memory from prior conversations → live query fallback. Each layer adds signal. But more context is not always better — curated, accurate, smaller context outperformed large noisy context. The investment is in curation, not volume.
- **Hierarchical instruction files** — Claude Code discovers instruction files by walking up the directory tree from the working directory, collecting `CLAUDE.md` (and variants like `.local.md`) at each level, capped at 4KB per file and 12KB total. This means a monorepo can have org-level instructions at the root, team-level instructions in subdirectories, and project-level instructions deeper still — they layer additively. This is a better pattern than one giant instructions file: each level is small, scoped, and maintainable by the team that owns that directory.

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

The capability split is increasingly also a cost split. Open models (GLM-5, MiniMax M2.7) now match frontier models on core execution tasks — file operations, tool use, instruction following — at ~20x lower cost and ~2x lower latency (LangChain benchmarks, April 2026). This means the architect/editor pattern can double as a cost optimization: use a frontier model for planning and reasoning, an open model for execution. The split isn't just about what each model is good at — it's about not paying frontier prices for work that doesn't need frontier reasoning.

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

There are two distinct enforcement mechanisms here, and they solve different problems. **Structural enforcement** removes capabilities from the schema — the model never sees tools it shouldn't use. Claude Code's permission model does this: each tool declares a required permission level (ReadOnly, WorkspaceWrite, DangerFullAccess), and tools above the current session's permission level are filtered from the tool list before it reaches the model. In read-only mode, write tools don't exist as far as the model is concerned. Zero chance of violation because there's nothing to violate. **Behavioral enforcement** runs code alongside tools the model can see — hooks that inspect, block, or modify tool calls in flight. Claude Code's hook exit codes formalize this: `0` = allow, `2` = deny, anything else = warn and continue. Hook stdout gets merged into the tool result, so a hook can inject context the model sees on the next turn.

Use structural enforcement when the constraint is absolute (the agent should never write in read-only mode). Use behavioral enforcement when the constraint is contextual (this specific bash command looks dangerous, but bash in general is fine).

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

## KV cache hit rate is the #1 production metric

Agent workloads have approximately 100:1 prefill-to-decode ratios — the model re-reads the entire conversation on every turn before generating a few tokens of output. This makes KV cache efficiency the single most important production metric for agent systems. A cache miss means re-processing the full context from scratch on every turn.

The practical implication beyond "don't change your prompt": never dynamically add or remove tools mid-iteration. Tool definitions sit near the front of the context, and any change invalidates the KV cache for all subsequent tokens. If you need to restrict available actions based on state (e.g., plan mode vs. act mode), use a state machine that constrains action selection within the same tool set rather than modifying the tool definitions themselves. Claude Code's plan mode (implemented as an `EnterPlanMode` tool rather than a schema swap) is an example of this — the tool set stays constant, preserving the cache.

## Prompt caching matters

For the Claude API, prompt caching works by prefix matching. This means:
- Static content first, dynamic content last
- Never change tools mid-session (use tools to model state transitions instead)
- Never switch models mid-session (use subagents for different models)
- Fork operations (compaction, summarization) should share the parent's prefix
- Use messages for updates, not prompt modifications

If you're building a loop that calls the API repeatedly, the prompt should be identical across calls. Dynamic context goes in the file system, not the prompt.

Claude Code's system prompt has an explicit `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker that separates the static prefix (persona, instructions, tool schemas) from the dynamic suffix (environment info, git status, CLAUDE.md contents). Everything before the boundary is identical across turns and sessions — maximizing cache hits. Everything after is rebuilt each turn. If you're building a harness, draw this line explicitly in your prompt structure rather than letting static and dynamic content intermingle.

## Optimize for agent legibility

From the agent's point of view, anything it can't access in-context effectively doesn't exist. Slack discussions, design decisions in Google Docs, knowledge in people's heads — none of it is usable unless it's in the repo as a versioned, discoverable artifact.

This means pushing context into the repository over time. That Slack thread where the team aligned on an architectural pattern? If it's not discoverable by the agent, it's as unknown as it would be to a new hire joining three months later.

This also shapes technology choices. Prefer "boring" technology: composable, API-stable, well-represented in the training data. Agents model these better. In some cases it's cheaper to have the agent reimplement a subset of functionality (with full test coverage and tight integration) than to work around opaque behavior from external libraries.

There's a deeper structural version of this: some codebases are inherently more "harnessable" than others. Strongly-typed languages, clear module boundaries, and established frameworks give agents — and the harnesses around them — more to grip. This is Ashby's Law applied to codebases: constraining the solution space (e.g., defined service topologies, strict type systems, enforced dependency direction) makes it possible to build comprehensive harnesses. Unbounded variety makes full coverage impossible regardless of how good the harness is. The implication is that technology and architecture choices made for human reasons (type safety, modularity) pay compound dividends when agents enter the picture.

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

The inverse failure is equally detectable: verbose reasoning without tool use. UNDERWRITE found that incorrect agent traces had fewer steps but *higher* token counts — the agent talked itself into an answer instead of grounding it with tools. GPT-5-Nano generated 7k output tokens across 3 steps with zero tool calls and got it wrong. Claude Haiku used 400 tokens across 4 steps with 1 tool call and got it right. High output tokens + low tool call count is a measurable signal that the agent is confabulating rather than investigating. A hook that flags this pattern (e.g., >2k tokens generated without a single tool call) could interrupt before the agent commits to a wrong answer.

## Optimize for tool error recovery, not avoidance

Tool errors are normal. UNDERWRITE evaluated 13 frontier models on 300 insurance underwriting tasks and found that even the top 3 models made at least one tool error in 20-40% of conversations. The correlation between raw tool error rate and answer correctness was weak. What actually differentiated top performers was the *recovery rate* — how often the agent made a corrected call to the same tool after an error. Recovery rate had a moderate-to-strong positive correlation with correctness.

This means agent builders should stop trying to prevent all tool errors (better descriptions, simpler schemas, guardrails on inputs) and instead ensure the agent can notice and retry. Concretely: return informative error messages that tell the agent what went wrong and how to fix it. Include metadata retrieval tools so the agent can look up correct usage after a failure. Don't terminate the session on the first tool error — let the agent self-correct. The best agents treat tool errors as a normal part of their reasoning loop, not as failures.

Claude Code implements this structurally: tool execution errors are returned as tool results with `is_error: true` — structurally identical to successful results from the conversation loop's perspective. The loop doesn't branch on success vs. failure; it just feeds the result back and lets the model decide what to do next. This is cleaner than try/catch patterns that treat errors as exceptional control flow.

## Pretrained knowledge is an active hazard in specialized domains

Giving an agent tools doesn't mean it will use them. UNDERWRITE found that models hallucinate domain-specific answers from pretraining even when they have full tool access to the correct information. Smaller models are hit hardest: Claude Haiku scored near 100% on tasks where reference answers matched pretrained expectations but dropped to 66% when answers were "surprising" (divergent from what the model would expect). GPT-5-Mini and GPT-5-Nano hallucinated insurance products not in the guidelines 58-66% of the time in product recommendation tasks.

The failure mode: the model is confident it already knows the answer, so it doesn't check. This is especially dangerous when working with proprietary business logic, company-specific rules, or any domain where the correct answer contradicts general knowledge. The model's pretraining becomes a liability — it "knows" things that are wrong for your specific context.

Mitigations: force tool use before final answers in domains with proprietary knowledge. Build skills that require evidence from tools as a gate before any recommendation. Use anti-rationalization tables targeting the specific excuse "I already know this from my training." For evaluation, measure how accuracy changes as answers diverge from what the model would expect — if accuracy holds on "obvious" tasks but drops on surprising ones, the model is leaning on pretraining instead of tools.

## Todo tools as attention anchoring

A todo/task tool that makes the agent write down its plan and next steps after each action keeps it on track across long tool-use chains. The mechanism isn't state management — it's attention reinforcement. Writing "next I need to do X" places that intent late in the context window where it has maximum influence on the next turn. PostHog found this was the difference between agents getting lost after a few tool calls and agents sustaining coherent multi-step execution across dozens of steps. Claude Code's Task Tool and Open SWE's `write_todos` implement the same pattern. The tool barely needs to do anything — the value is in the act of writing, not the output.

This is the within-session equivalent of the progress file pattern for cross-session work. Progress files anchor the agent at session start; todo tools anchor it at every step.

## Theory of constraints for agent workflows

The highest-leverage work isn't writing features — it's removing bottlenecks that prevent agents from working effectively. Neil Kakkar describes the progression: first remove formatting friction (automated PR creation via a `/git-pr` skill), then waiting friction (sub-second server restarts via SWC), then verification friction (agent-driven previews), then context-switching friction (parallel worktrees with unique port ranges per worktree).

Each solved constraint makes the next one visible. This is textbook theory of constraints applied to agent-assisted development. The implication: before optimizing prompts or adding tools, ask what's actually slowing the agent down. Often it's infrastructure — slow builds, port collisions, manual approval steps — not the agent's reasoning capability.

A specific operational problem worth noting: running multiple agents in parallel worktrees fails when every server instance binds to the same ports. You need a system that assigns unique port ranges per worktree. This is the kind of infrastructure that's invisible until you try to scale past one concurrent agent.

## CLIs are becoming the dominant agent interface

Services are shipping CLIs faster than MCP servers — Stripe, Ramp, ElevenLabs, Resend, Discord, Google Workspace all recently launched CLI tools. CLIs are simpler to wrap, easier for agents to parse, and require less standardization overhead than protocol layers.

This matters for agent builders because CLI wrapping gives you progressive disclosure for free: the agent discovers capabilities via `--help` flags instead of loading full tool schemas upfront. The Cline Kanban pattern takes this further — a web UI for orchestrating multiple CLI coding agents (Claude Code, Codex, Cline) across isolated git worktrees, solving both inference-bound waiting and merge-conflict management.

The broader framing from Latent Space: "harness engineering" — the middleware, memory, tool interfaces, and safety policies around the model — is the real product layer. Model quality is necessary but no longer the whole story.

## Agent speed removes natural bottlenecks

Mario Zechner (creator of the Pi agent framework used by OpenClaw) argues that agents remove the natural constraint of human typing speed, and this is dangerous. When a human writes code, their speed is the bottleneck that limits daily mistakes. Agents remove that constraint — thousands of lines per day — so errors compound at inhuman scale before anyone notices.

The deeper problem: developers lose understanding when they delegate. "You have zero idea what's going on because you delegated all your agency to your agents." Changes that normally warrant weeks of consideration now occur within hours.

Simon Willison's counter: "write by hand" isn't the answer. The new discipline is balancing speed against thoroughness when code generation is no longer the bottleneck. This is a framing problem, not a tooling problem — and it argues for stronger verification infrastructure, not slower agents.

## Context pressure awareness for autonomous agents

For long-running autonomous agents (multi-hour Codex runs, overnight Ralph loops), the agent itself should know when context is filling up. GSD implements this as a hook that monitors context usage and injects warnings at 35% and 25% remaining into the agent's `additionalContext`. The agent can then checkpoint its progress before compaction wipes working state.

This matters less for interactive sessions (where compaction handles it) and more for unattended agents that need to preserve state across compaction boundaries. The agent can't checkpoint what it doesn't know it's about to lose.

A subtler variant: context anxiety. Cognition found that Sonnet 4.5 tracked its remaining context and prematurely wrapped up tasks — rushing to finish before hitting the limit, even when there was plenty of room. The fix: enable a larger context window than you actually intend to use, so the model never feels close to the boundary. Parallel execution amplifies this because parallel tool calls burn context faster. The model's *perception* of remaining context affects behavior independently of actual token usage.

On compaction itself: Claude Code triggers auto-compaction based on cumulative input token count (default ~200k), not message count. When it fires, it preserves the 4 most recent messages and replaces everything before them with a synthetic System message containing a structured summary — message counts by role, tool names used, inferred pending work (extracted from text patterns), and referenced file paths. This is smarter than simple truncation because it preserves the shape of the work so far. The agent knows what tools it used and what files it touched, even if the details are gone. The token-based trigger is also better than message-count-based: a conversation with 50 short messages and one with 5 massive tool outputs have very different context pressure, and the token count captures that.

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

## Eval metrics for deep agents

LangChain's eval framework for Deep Agents measures four efficiency dimensions alongside correctness:

- **Step ratio** — observed steps / ideal steps
- **Tool call ratio** — observed tool calls / ideal tool calls
- **Latency ratio** — observed time / baseline time
- **Solve rate** — expected steps / observed latency (0 if task fails)

All four are measured against an "ideal trajectory" — the minimal correct path for a task. For novel tasks, use the best-performing model as baseline, then refine as capabilities improve. This is more useful than pass/fail because it distinguishes "solved but wastefully" from "solved efficiently" — two agents with the same success rate can have very different step ratios.

Their eval organization is worth copying: tag evals by capability tested (file_operations, retrieval, tool_use, memory) not by source. This lets engineers run focused subsets via CLI flags. They explicitly separate SDK unit tests (hygiene, all models should pass) from model capability evals (scored, differentiate models).

The pipeline for generating evals: dogfooding traces reveal failure patterns → failures become repeatable test cases → test cases get tagged by capability. External benchmarks (Terminal Bench 2.0, BFCL) supplement but don't replace production-derived evals.

## Five pitfalls of LLM evaluation

Hamel Husain identifies five ways teams get agent evaluation wrong, all of which boil down to skipping data science fundamentals:

1. **Generic metrics.** Teams adopt off-the-shelf eval frameworks without understanding their specific failures. Application-specific metrics ("Calendar Scheduling Failure") matter more than ROUGE or BLEU. Explore traces first, then decide what to measure.

2. **Unverified judges.** Using LLMs as judges without validation is common but dangerous. Treat the judge as a classifier: generate human labels on train/dev/test splits, measure trustworthiness, report precision/recall instead of accuracy (which masks rare failure modes).

3. **Bad experimental design.** Synthetic test data generated via prompts is unrepresentative. Ground synthetic examples in real production logs. Replace subjective Likert scales with binary pass/fail on scoped outcomes.

4. **Poor data practices.** Domain experts should label, not contractors. Labeling itself surfaces "criteria drift" — stakeholders discover what they actually want by looking at outputs. Getting product teams in front of raw agent outputs matters more than dashboards.

5. **Over-automation.** LLMs generate boilerplate but can't substitute for human judgment about what to measure. "You don't know what you want until you see the outputs."

## Infrastructure over scale

ATLAS demonstrates that wrapping a frozen 14B model in structured infrastructure can outperform frontier API models on coding benchmarks. On LiveCodeBench v5: 74.6% pass@1 on a consumer RTX 5060 Ti, vs Claude Sonnet at 65.5%. Cost: ~$0.004/task vs ~$0.07 for API calls.

The architecture is a three-phase pipeline: (1) PlanSearch generates diverse solution approaches with BudgetForcing controlling thinking tokens, (2) geometric self-embeddings score and rank candidates, (3) self-verified repair generates its own test cases and iteratively fixes failing solutions — rescuing 85.7% of failures. The repair phase contributes more than candidate selection in ablation studies.

The tradeoff: 20 minutes per task. This is incompatible with interactive use but viable for batch processing, CI pipelines, and science workflows. The broader lesson: when latency is cheap, trading time for verification rigor is a valid strategy — especially when the verifier is strong enough that you can run candidates in parallel and take the first that passes.

## Agent-generated code has higher churn

An empirical study of ~110,000 open-source PRs across five coding agents (Codex, Claude Code, Copilot, Jules, Devin) found that agent-generated code has higher churn rates over time — more rework, more modifications in subsequent commits. Claude Code and Codex PRs merge at higher rates than human PRs, while Copilot and Devin merge at lower rates. But even merged agent code gets modified more frequently downstream.

This is the empirical confirmation of Mario Zechner's argument about agent speed removing natural bottlenecks. The code ships faster, but the maintenance cost is higher. It argues for stronger verification gates before merge — not to slow agents down, but to catch the quality issues that show up as churn later. The Sashiko pattern (multi-pass review with consolidation) and the evaluator-optimizer pattern both address this, but most teams aren't using them yet.

A separate study of 3,109 PRs with code review agents found that CRA-only PRs (no human reviewer) achieve a 45% merge rate vs. 68% for human-reviewed PRs, with 60% of CRA feedback falling in the 0-30% signal range. 12 of 13 code review agents studied had average signal ratios below 60%. Code review agents without human oversight generate mostly noise. The industry claim that CRAs can handle 80% of PRs without human involvement doesn't hold up empirically.

## Agent middleware as composable lifecycle hooks

LangChain's Deep Agents implements middleware as six composable hooks around the agent loop: before_agent, before_model, wrap_model_call, wrap_tool_call, after_model, after_agent. Multiple middleware stack without conflict — FilesystemMiddleware, SubagentMiddleware, and SummarizationMiddleware all coexist.

This is the architectural formalization of the "deterministic safety nets" pattern. The key distinction from plugins: middleware is stackable and wraps the full lifecycle, while plugins typically extend a single point. Use cases split into two categories:

**Deterministic policies** that "can't live in a prompt" — PII redaction, content moderation, tool filtering based on request context. These need consistent enforcement across all executions, not probabilistic compliance.

**Context engineering** — token management through summarization, history trimming, verbose output compression. This is middleware doing what prompt engineering can't: reliably managing what's in context based on dynamic conditions rather than static rules.
