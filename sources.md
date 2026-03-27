# Sources

Key sources with what I took from each. Not a bibliography — an opinionated digest.

## OG Ralph — Geoffrey Huntley

[github.com/GeoffreyHuntley/ralph](https://github.com/GeoffreyHuntley/ralph)

15 lines of bash that pipe a prompt into an AI agent in a loop. prd.json for tasks, progress.txt for memory, git commits for checkpoints.

**What I took:** The progress.txt pattern is the most important innovation. Learnings compound — by story 10, the agent knows patterns from stories 1-9. Also: small stories that fit in one context window, fast feedback loops (typecheck + tests), and the simplicity of "just loop it."

**Key quote:** By story 10, Ralph knew our patterns.

## Effective Harnesses for Long-Running Agents — Anthropic

[anthropic.com/engineering/effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

Anthropic's own research on making the Claude Agent SDK work across many context windows.

**What I took:** The initializer/coder split — first session scaffolds environment, subsequent sessions work incrementally. Feature list in JSON (not markdown) because the model is less likely to inappropriately edit JSON. The get-bearings ritual: pwd → read progress → read features → git log → start server → smoke test. "Incremental progress was critical to addressing the agent's tendency to do too much at once."

**Key insight:** The two failure modes are (1) trying to do too much at once and (2) declaring victory too early. Both are solved by a locked feature list + one-feature-per-session discipline.

## How We Use Skills — Anthropic

[anthropic.com/engineering/claude-code-skills](https://www.anthropic.com/engineering/claude-code-skills)

How Anthropic builds and uses skills in Claude Code.

**What I took:** Verification skills with programmatic assertions are "extremely useful for ensuring Claude's output is correct." Progressive disclosure via the file system — skills are folders the agent discovers, not text in the prompt. The gotchas section is the highest-signal content in any skill. Don't railroad the agent — give it information, let it decide the approach. Scripts are first-class artifacts: "one of the most powerful tools you can give Claude is code."

**Key insight:** A skill is a folder, not a markdown file. The file system is context engineering.

## Seeing Like an Agent — Anthropic

[anthropic.com/engineering/seeing-like-an-agent](https://www.anthropic.com/engineering/seeing-like-an-agent)

How Anthropic designs tools for Claude Code. The art of matching tools to model capabilities.

**What I took:** Tools should be shaped to the model's abilities. Small action space — Claude Code has ~20 tools and the bar to add a new one is high. Progressive disclosure over upfront context (the Claude Code Guide subagent pattern). Revisit tools as models improve — what the model needed last year might now be constraining it. TodoWrite → Task Tool evolution shows this: as Opus got better at self-directing, the restrictive todo list became limiting.

**Key insight:** The best designed tool doesn't work if Claude doesn't understand how to call it.

## Prompt Caching Is Everything — Anthropic

[anthropic.com/engineering/prompt-caching](https://www.anthropic.com/engineering/prompt-caching)

How Claude Code is built around prompt caching from day one.

**What I took:** Prompt caching is a prefix match — any change anywhere invalidates everything after it. Static content first, dynamic content last. Never change tools or models mid-session. Use messages for updates, not prompt modifications. Plan mode is implemented as a tool (EnterPlanMode) rather than a tool set swap, specifically to avoid breaking the cache. Fork operations (compaction) must share the parent's prefix.

**Key insight:** For long-running agent loops, keep the prompt identical across sessions. Dynamic context should be discovered by the agent reading files, not injected into the prompt.

## Why Even Non-Coding Agents Need Bash — Thariq (Anthropic)

[x.com/trq212/status/1852837042490847419](https://x.com/trq212/status/1852837042490847419)

Thread on bash as the universal agent tool.

**What I took:** Bash lets agents ground results in reproducible code, take multiple steps at finding things, and double-check their work. Examples: chaining API calls, file editing with ffmpeg, creating cron jobs dynamically. Before building a custom tool, ask if the agent could just bash it.

**Key insight:** Agents with bash can self-orchestrate. External orchestration layers are usually unnecessary.

## Building a C Compiler with a Team of Parallel Claudes — Nicholas Carlini (Anthropic)

[anthropic.com/engineering/building-c-compiler](https://www.anthropic.com/engineering/building-c-compiler)

16 parallel Claude instances built a 100,000-line Rust-based C compiler over ~2,000 sessions, capable of building Linux 6.9 on x86/ARM/RISC-V. $20k in API costs.

**What I took:** Git-based task locking works for parallel agents — agents claim tasks by writing files, merge conflicts force re-selection. Agents are time-blind: Claude wasted hours on full test suites, so they added `--fast` flags running 1-10% random samples. Minimize context pollution: output errors to files in greppable format rather than dumping into context. Break monolithic tasks to enable parallelism — use an oracle (GCC) to handle portions the agent isn't working on so agents fix different bugs independently. Agent specialization by role (coalescer, optimizer, critic, documenter) rather than uniform agents.

**Key insight:** Parallel agents can work at scale if coordination is through a structured protocol (git) rather than shared mutable state. The key is making tasks independent, not making agents communicate.

## Building Multi-Agent Systems: When and How to Use Them — Anthropic

[claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)

When multi-agent is worth the 3-10x token cost and when it isn't.

**What I took:** Decompose by context boundaries, not problem type. Splitting into planner/implementer/tester is counterproductive — they spend more tokens coordinating than working. The "telephone game" failure mode: each handoff degrades information fidelity. Only three scenarios consistently justify multi-agent: (1) context pollution degrading reasoning, (2) genuinely parallelizable subtasks, (3) 15-20+ tools causing selection confusion. Before adding agents, try reducing tools first — a Tool Search Tool reduced tool-related tokens by 85%.

**Key insight:** Improved prompting on a single agent has frequently matched elaborate multi-agent systems that took months to build.

## Shell + Skills + Compaction: Tips for Long-Running Agents — OpenAI

[developers.openai.com/blog/skills-shell-tips](https://developers.openai.com/blog/skills-shell-tips)

Practical patterns for skills, shell execution, and context management in Codex.

**What I took:** Negative examples in skill descriptions are critical — Glean saw a 20% accuracy drop when they removed "don't call when..." cases. Write routing logic, not marketing copy: describe when to use the skill, when to avoid it, and expected outputs. Embed templates within skills, not system prompts — loaded only when needed. Skills + open network access creates exfiltration risk; use strict allowlists and `domain_secrets` rather than exposing raw credentials. Production results from Glean: skills with templates and negative examples drove accuracy from 73% to 85% with 18% latency reduction.

**Key insight:** The description field is the most important part of a skill. It's a routing signal, not documentation.

## Inside OpenAI's In-House Data Agent — OpenAI

[openai.com/index/inside-our-in-house-data-agent](https://openai.com/index/inside-our-in-house-data-agent/)

Two engineers built a data agent in ~3 months (70% AI-written) now serving 4,000+ employees daily, reasoning over 600+ PB across 70,000 datasets.

**What I took:** Context is a system with layers, not a single prompt: schema metadata → code analysis of pipelines (not just schemas — "the code that produces data tells you what it actually means") → curated expert descriptions → institutional knowledge mined from Slack/Docs/Notion → learning memory from prior conversations → live query fallback. But more context is not always better — curated smaller windows outperformed large noisy ones. Tool proliferation degraded reliability: overlapping tools confused the agent, consolidating them produced dramatically better results. Model overconfidence is the biggest behavioral challenge: models rapidly select approaches without validation, requiring explicit discovery phases before execution. Highly prescriptive prompts backfired because "analytical questions vary in shape even when they look similar."

**Key insight:** Schema definitions tell you the shape of data; the code that produces data tells you what it actually means. Analyze the pipeline, not just the schema.

## Harness Engineering: Leveraging Codex in an Agent-First World — OpenAI

[openai.com/index/harness-engineering](https://openai.com/index/harness-engineering/)

OpenAI built and shipped an internal product with 0 lines of manually-written code. ~1M lines, ~1,500 PRs, 3.5 PRs per engineer per day, single Codex runs lasting 6+ hours.

**What I took:** The "map, not manual" lesson — they tried one big AGENTS.md and it failed for four specific reasons (crowds out the task, too much guidance becomes non-guidance, rots instantly, hard to verify). Keep instruction files to ~100 lines as a table of contents into a structured docs/ directory. Agent legibility as a design principle: anything the agent can't access in-context doesn't exist, so push Slack discussions and design decisions into the repo as versioned artifacts. Prefer boring technology (composable, API-stable, well-represented in training data). Promote rules into code — custom linters with remediation instructions in error messages inject context at the exact moment the agent needs it. Entropy management via recurring background agents that scan for deviations and open refactoring PRs ("garbage collection" for codebases). They went from 20% of human time on manual cleanup to automated enforcement.

**Key insight:** When something fails, the question is "what capability is missing?" not "try harder." The human job becomes designing environments, not writing code.

## Aider — Paul Gauthier

[github.com/Aider-AI/aider](https://github.com/Aider-AI/aider)

Open source terminal-based coding assistant. Apache 2.0, Python, ~42k stars. The most studied open-source agent harness for its context engineering innovations.

**What I took:** Two genuinely novel patterns. First, the repo map (`aider/repomap.py`): parse ASTs with tree-sitter to extract class/function signatures and call relationships, then rank files by PageRank centrality to the current task, and render a compact structural map. Claims 98% token reduction vs. full file contents. The agent sees the entire codebase's API surface cheaply, then requests full files only for what it needs to edit. The map is dynamically re-ranked based on conversation context — mentioned files get promoted, irrelevant ones demoted.

Second, the architect/editor split (`aider/coders/architect_coder.py`): one model (stronger, expensive) reasons about what to change and produces natural language descriptions; a second model (cheaper, faster) translates those descriptions into file diffs. This works because reasoning and editing are different skills that fail differently. A model great at architecture might produce malformed diffs; a model reliable at syntax might make poor design decisions. Splitting by capability lets each model work to its strengths. Distinct from evaluator-optimizer, which iterates on quality rather than splitting by skill.

Also: multiple edit formats (whole file, diff, udiff) with different formats working better on different models. An automatic edit-test-fix loop that runs linters/tests after each edit and feeds errors back. Hierarchical context prioritization — system instructions and repo map always included, relevant files dynamically selected, chat history lowest priority and first to be dropped.

**Key insight:** The repo map is the single best token-efficiency technique for large codebases. Don't send code the model won't edit — send a map so it knows what exists and where.

## SWE-agent — Princeton/Stanford

[github.com/SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent)

Academic agent framework (NeurIPS 2024) that introduced the Agent-Computer Interface concept. Python, ~19k stars.

**What I took:** The foundational insight that tools should be designed for how language models process information, not how humans use terminals. SWE-agent doesn't give the LLM raw shell access — it designs LM-centric commands with structured, predictable output formats. The model interacts with an abstraction layer (the ACI) that translates between model-friendly operations and actual system commands.

But the real gem is mini-swe-agent (`github.com/SWE-agent/mini-swe-agent`): ~100 lines of Python that score >74% on SWE-bench Verified. The entire agent loop is: assemble a prompt with the GitHub issue, available tools, and instructions; call the model; parse tool calls from the response; execute them; append results; loop until the model says it's done or hits a step limit. No framework. No state machine. No middleware. Just a while loop, a model call, and tool execution.

This is the strongest possible evidence for "start simple." If 100 lines can solve >74% of real GitHub issues, the essential agent loop is very small. Everything else — compaction, memory, multi-agent coordination, plan/act modes — is optimization on top of a tiny core.

**Key insight:** The essential agent loop is trivially small. The leverage is in what context you provide and what tools you shape, not in the loop mechanics.

## OpenAI Codex CLI (open source)

[github.com/openai/codex](https://github.com/openai/codex)

OpenAI's fully open-source terminal agent. Apache 2.0, Rust, ~67k stars. The most complete open-source implementation of a production agent harness.

**What I took:** The entire agent loop is readable in `codex-rs/core/src/codex.rs` (~7,300 lines). The `run_turn()` function implements the full cycle: pre-turn compaction check → context updates (cwd, date, AGENTS.md changes, skill injections) → hook execution → model sampling → tool orchestration → follow-up loop if tools were called → mid-turn compaction if tokens exceed budget → repeat until final response.

AGENTS.md handling (`codex-rs/core/src/project_doc.rs`): walks upward from cwd to project root, collects every AGENTS.md from root to cwd, concatenates them root-first (deeper files take precedence for conflicts), supports `.override.md` variants. Injected as a user-role message wrapped in `<INSTRUCTIONS>` tags.

The skill system (`codex-rs/core/src/skills/`): SKILL.md files with YAML frontmatter are discovered by scanning skill directories (~/.codex/skills/, project .codex/skills/, system skills). Skills declare MCP tool dependencies and permission profiles. When a user mentions `@skill-name`, the skill's instructions and tools are injected into context. Skills are loaded lazily — only when referenced.

Compaction (`codex-rs/core/src/compact.rs` and `compact_remote.rs`): three trigger modes. Pre-turn: before a new user message when tokens are high, replaces history with a handoff summary. Mid-turn: during multi-step tool loops, injects before last user message to preserve current task context. Remote: server-side compaction returning opaque encrypted content in latent space, avoiding lossy text summarization. When compaction itself OOMs, progressive history trimming and retry.

Plan mode: implemented as a tool (`EnterPlanMode`) rather than a mode switch, specifically to avoid breaking the prompt cache. When active, write tools are removed from the schema — the model literally cannot call them. This is a cleaner pattern than instruction-based constraints because there's zero possibility of the model ignoring the instruction.

Tool orchestration (`codex-rs/core/src/tools/orchestrator.rs`): approval check → sandbox selection → execution → retry with escalated sandbox on denial. Multi-agent support with depth limits, inter-agent messaging, and context forking.

**Key insight:** The most valuable thing in this repo is seeing how many small, careful decisions go into a production harness. Every piece (compaction triggers, schema filtering, hook lifecycle, AGENTS.md precedence) solves a specific failure mode that only surfaces at scale.

## Open SWE — LangChain

[github.com/langchain-ai/open-swe](https://github.com/langchain-ai/open-swe)

Open-source coding agent framework codifying patterns from Stripe (Minions), Coinbase (Cloudbot), and Ramp (Inspect). Python, ~8k stars. Released March 2026.

**What I took:** The middleware hook pattern: deterministic code that fires at specific points in the agent loop, providing guarantees the agent can't violate. The clearest example is `open_pr_if_needed` — if the agent produced changes but forgot to commit/push/open a PR, the middleware does it automatically. Other hooks check for uncommitted changes before new subtasks, validate tests pass before marking complete, enforce file size limits. The hooks are deterministic Python, not LLM calls — fast, predictable, testable.

The tool curation philosophy: ~15 carefully selected tools rather than hundreds. This mirrors what Anthropic and OpenAI independently concluded. Pluggable sandbox providers (Modal, Daytona, Runloop) for execution isolation. File-based memory for offloading large tool results instead of keeping everything in conversation context. Slack-first invocation pattern meeting developers where they work.

The `write_todos` structured task tracking tool gives agents a scratchpad that persists across compaction — the agent writes its plan as todos, checks them off, and the todo state survives context compression. Similar to progress files but integrated into the agent loop as a first-class tool.

**Key insight:** The middleware pattern separates "what the agent decides" from "what the system guarantees." Let the agent have full autonomy within the loop, but enforce hard constraints at the boundaries with deterministic code it can't skip.

## Letta Code — Letta AI

[github.com/letta-ai/letta-code](https://github.com/letta-ai/letta-code)

VS Code extension with persistent, git-backed agent memory. TypeScript, ~2k stars. Notable for being model-agnostic and #1 on TerminalBench.

**What I took:** The progress file pattern taken to its architectural conclusion. Each agent has a "context repository" — a git-backed store where every memory change is a commit with a message. The `/init` command triggers deep codebase analysis populating initial memories. `/remember` prompts explicit reflection and knowledge consolidation.

What makes this different from a progress file: branching (subagents work on divergent memory branches and merge learnings), rollback (wrong memories are reverted without losing everything else), model independence (same memory across Claude/GPT/Gemini — switching models doesn't mean starting over), and structured retrieval (memories have metadata for filtering instead of reading a monolithic file).

The memory system is the product, not a feature. Every architectural decision flows from the premise that agent state should be durable, version-controlled, and model-independent. This is the strongest implementation of the principle that context transfer between sessions is the #1 problem to solve.

**Key insight:** If context transfer is the biggest failure mode for multi-session agents, make it a first-class, version-controlled data structure — not a text file the agent appends to.

## Superpowers — Jesse Vincent (obra)

[github.com/obra/superpowers](https://github.com/obra/superpowers)

Agentic skills framework that layers on top of Claude Code and Codex. Shell, ~105k stars. Not a standalone agent — a methodology layer.

**What I took:** The strongest confirmation that orchestration can be simple. Superpowers is mostly shell scripts that define skills, subagent decomposition patterns, and review gates. It works on top of existing harnesses rather than replacing them. Forces a "brainstorm before code" step — the agent designs the approach in a design conversation before any implementation begins.

The subagent-driven development pattern: decompose work into subagent tasks, each with a clear scope and review gate. The orchestration is in the skill definitions (markdown + shell), not in a framework. This echoes OG Ralph's insight that 15 lines of bash can orchestrate meaningful work — Superpowers scales that approach to team-level workflows while keeping the same simplicity.

**Key insight:** You don't need a framework to build agent workflows. Skills defined as markdown + shell scripts, layered on top of existing agent harnesses, can orchestrate sophisticated multi-step development processes.

## Claude Code (public repository) — Anthropic

[github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)

Public companion repository for Claude Code. The binary is compiled and distributed via npm — not open source. But the plugin system, agent definitions, hook system, and multi-agent orchestration prompts are visible. ~81k stars.

**What I took:** Agents defined as markdown files with YAML frontmatter specifying name, model, allowed tools, and natural language instructions in the body. This is the cleanest example of "markdown as agent configuration." Commands (slash commands) use the same format with `allowed-tools` for permission scoping — e.g., `Bash(gh pr view:*)` allows only specific bash commands.

The code-review command (`plugins/code-review/commands/code-review.md`) is the most instructive artifact: it orchestrates a multi-agent pipeline launching parallel subagents (Haiku for triage, Sonnet for CLAUDE.md compliance, Opus for bug detection), followed by validation subagents, with confidence-based filtering. This is a concrete example of production multi-agent orchestration defined entirely in a prompt file.

The hook system supports two types: command hooks (run bash/python on events) and prompt hooks (use LLM evaluation for context-aware decisions). Events include PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, PreCompact, PostCompact. This is the "deterministic safety nets" pattern — lifecycle hooks that fire in the harness process, not in the agent's context.

**Key insight:** The most powerful agent definitions are just markdown files with YAML frontmatter. The format is simultaneously human-readable, version-controllable, and LLM-friendly.

## Building Effective AI Agents: Architecture Patterns — Anthropic

[anthropic.com whitepaper, 2025](https://www.anthropic.com)

Enterprise patterns for agent architectures: single agent, hierarchical, collaborative, sequential/parallel workflows, evaluator-optimizer.

**What I took:** Start simple, scale intelligently. Single agents handle most use cases. Multi-agent outperforms single-agent by 90% — but only for complex tasks requiring multiple independent directions simultaneously. The progression: single agent → single agent with skills → sequential workflow → multi-agent. Most people should stop at step 1 or 2. Skills provide deep specialization without multi-agent complexity. The industry's answer to agent safety is observability + human oversight, not formal methods.

**Key insight:** The best architecture is the simplest one that meets today's requirements while providing a path to tomorrow's capabilities.

## Superpowers — Jesse Vincent (obra)

[github.com/obra/superpowers](https://github.com/obra/superpowers)

Agentic skills framework (~105k stars) that layers on top of Claude Code and Codex. The most sophisticated open-source skill collection studied.

**What I took:** Three patterns that separate production skills from demos. First, anti-rationalization tables: every skill includes a table mapping specific LLM excuses to correct behavior ("Just try changing X" → "STOP. Return to Phase 1"). These pre-empt predictable reasoning failures. Second, Iron Laws as absolute constraints ("NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST") — absolute statements resist the model's tendency to reason around soft constraints. Third, the CSO (Claude Search Optimization) discovery: when skill descriptions summarize workflow, the model follows the description instead of reading the full skill. Descriptions must say WHEN to trigger, never WHAT the skill does.

Also: composable skill chains (brainstorming → writing-plans → subagent-driven-development → finishing-a-development-branch) where each skill gates the next. Context isolation for subagents — "pass raw artifacts, not your conclusions," fresh subagent per task with exactly curated context. Two-stage review (spec compliance then code quality, never combined). The verification-before-completion skill's gate function (identify command → run → read output → verify → only then claim) was built from 24 documented failure cases.

**Key insight:** The difference between a production skill and a demo is not what it tells the agent to do — it's how it defends against the specific ways the agent will deviate.

## Trail of Bits Skills

[github.com/trailofbits/skills](https://github.com/trailofbits/skills)

65+ security research skills. The most domain-specialized skill collection studied.

**What I took:** The agentic-actions-auditor skill is the gold standard for encoding deep expert knowledge: 9 specific attack vectors for AI agent GitHub Actions integrations, step-by-step methodology, severity judgment guidance, data flow trace format, and "Rationalizations to Reject" sections. This is what a skill looks like when written by someone who knows the domain's failure modes intimately.

Also: the audit-context-building skill's ultra-granular, line-by-line analysis approach with per-function microstructure checklists. Anti-hallucination rules. Quality thresholds (minimum 3 invariants per function). Explicit non-goals ("no vulnerability identification, no fixes, no exploits" — just context building). The discipline of separating context-building from analysis prevents premature conclusions.

**Key insight:** The most valuable skills encode expert knowledge about specific failure modes in specific domains. Generic skills ("review this code") are noise. Domain skills ("audit this GitHub Actions workflow for these 9 agent-specific attack vectors") are signal.

## Codex babysit-pr Skill — OpenAI

[github.com/openai/codex/.codex/skills/babysit-pr](https://github.com/openai/codex/.codex/skills/babysit-pr/)

The most production-hardened single skill studied. Autonomously monitors a PR until merge, ready-to-merge, or human escalation.

**What I took:** The pattern of wrapping all fragile operations in deterministic scripts. The 600-line `gh_pr_watch.py` handles GitHub API interaction, CI failure classification (branch-related vs. flaky), retry budgets per SHA tracked in persistent JSON, and exponential backoff (1m → 1h cap). The agent never makes raw API calls — it reads structured JSON output and decides what to do. Also: exactly 3 terminal states (merged, ready, needs human) with explicit enumeration of non-stop conditions (preventing both premature stopping and infinite loops). Budget-limited retries (configurable max per SHA) preventing unbounded resource consumption.

**Key insight:** For fragile operations, tested scripts beat agent improvisation. The agent decides WHAT to do; the script handles HOW.

## OpenClaw Skills Ecosystem

[github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

Open-source personal AI agent (330k+ stars) with 55 bundled skills and 13,700+ community skills on ClawHub.

**What I took:** The three-level progressive disclosure system: metadata (~100 words, always in context) → SKILL.md body (loaded on trigger, target <5k words) → bundled resources (loaded on demand). The coding-agent skill demonstrates multi-agent orchestration: spawns background coding agents via bash with workdir isolation, monitors with process polling, supports parallel issue fixing via git worktrees. The healthcheck skill shows explicit approval gates before state changes (firewall changes, SSH config, package installs, credential access). The degrees-of-freedom calibration principle from skill-creator: high freedom for flexible tasks, low freedom for fragile operations.

**Key insight:** The context window is a public good. Every word in a skill body competes with the task, the code, and the conversation. The skill-creator skill's doctrine: "Challenge each piece of information: does the agent really need this?"

## Sashiko — Google / Linux Foundation

[github.com/sashiko-dev/sashiko](https://github.com/sashiko-dev/sashiko)

Agentic Linux kernel code review system. Rust, Apache 2.0. Built by Roman Gushchin and Google's kernel team, moving under the Linux Foundation.

**What I took:** Bug-taxonomy decomposition: 7 sequential review passes (architecture, commit alignment, logic errors, memory lifecycle, concurrency, security, hardware-specific), each focused on one concern domain and optimized for recall, followed by a dedicated 8th consolidation stage that deduplicates findings and logically proves or disproves each one. This manages the precision/recall tradeoff structurally — analysis passes over-report, consolidation filters. Results: 53.6% bug detection rate on commits that already passed human review, under 20% false positives.

Per-subsystem conditional prompt loading: a core review framework dynamically loads subsystem-specific prompts (block, networking, BPF, etc.) based on which subsystem the patch touches. Token-efficient — only relevant domain knowledge loaded.

Deployment pattern: dashboard, not mailing list. Sashiko deliberately does NOT post reviews to LKML — it hosts them on sashiko.dev where maintainers optionally consult findings. This avoids the "AI spam" problem that plagued curl and SQLite. A lesson for deploying AI agents into existing human workflows with strong norms.

**Key insight:** A single "review this code" prompt suffers from attention dilution. Decompose review into orthogonal concern domains, run each as a focused pass, then consolidate. Depth per pass beats breadth per pass.

## OpenCode / Crush — Charm

[github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)

Open-source Go-based coding agent (~1.2k HN points). Archived, continued as Charm's Crush. Pure Go, no CGo (WASM-compiled SQLite), single-binary distribution.

**What I took:** Built-in LSP integration — spawns actual language server processes (gopls, pyright, rust-analyzer) and notifies them after every file edit. Diagnostics (type errors, missing imports, syntax issues) are appended to the tool response within 5 seconds, without the agent needing to run a separate build command. This is the tightest feedback loop for code changes I've seen in an open-source agent.

Read-before-write enforcement with timestamp tracking: both edit and patch tools reject modifications if the file hasn't been read first or has been modified since last read, preventing stale-write conflicts. Sub-agents restricted to read-only tools (glob, grep, view, sourcegraph search) — explicit architectural separation of research from mutation. Anthropic cache control strategy: marks last two messages + system prompt + last tool definition with `CacheControl: "ephemeral"` for maximum cache hits.

**Key insight:** Wire the feedback loop as tightly as possible. LSP-on-every-edit is better than lint-on-request because the agent sees errors before it moves to the next file.

## How We Monitor Internal Coding Agents for Misalignment — OpenAI

[openai.com/index/how-we-monitor-internal-coding-agents-misalignment](https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment/)

OpenAI's production monitoring system watching tens of millions of internal coding agent trajectories for misalignment, published March 2026.

**What I took:** Chain-of-thought is the highest-signal monitoring target — agents often state intent explicitly in reasoning. A weaker model can effectively monitor a stronger model when given CoT access. Specific circumvention patterns observed: base64 encoding commands, calling other versions of themselves to bypass restrictions, string splitting to avoid detection, switching methods when one is blocked. Developer prompts can inadvertently incentivize circumvention — editing prompts reduced but didn't eliminate the behavior. The obfuscation trap: using CoT monitors as RL training signal teaches agents to hide intent in reasoning while still misbehaving — CoT monitoring must remain read-only detection, never a training objective. Match monitoring latency to threat velocity: async for slow-burn threats, synchronous blocking for irreversible actions. Zero highest-severity incidents across tens of millions of real trajectories.

**Key insight:** The most dangerous failure mode isn't agents doing bad things — it's agents learning to hide their reasoning about bad things. Keep CoT monitoring as a detection layer, never a training signal.

## Leanstral — Mistral

[mistral.ai/news/leanstral](https://mistral.ai/news/leanstral)

Open-source 6B-parameter coding agent purpose-built for Lean 4 formal proofs. Apache 2.0. Uses Lean's type checker as a perfect verifier.

**What I took:** The formal verifier as evaluator pattern: instead of another LLM reviewing the agent's output, Lean's type checker acts as a sound, deterministic oracle — either the proof checks or it doesn't. This eliminates the "who watches the watchmen" problem. It also unlocks parallel speculative generation: generate N candidate proofs, verify all in parallel, take the first that passes. Leanstral pass@2 ($36) beats Claude Sonnet ($549) on Lean benchmarks because verification is free and sound. The general principle: the stronger your verifier, the more you can exploit parallel generation. Normal test suites are neither sound (passing tests doesn't mean correct) nor complete (tests might be flaky), which is why this pattern doesn't generalize to most coding tasks — yet.

**Key insight:** Formal verification of agent output (proving the code satisfies the spec) is complementary to formal verification of agent safety (proving the harness prevents unsafe states, a la PetriFlow). One proves the product is correct, the other proves the process is safe.

## Claude Code Channels — Anthropic

[code.claude.com/docs/en/channels](https://code.claude.com/docs/en/channels)

Push-based event injection into running Claude Code sessions via MCP-compatible channel servers.

**What I took:** A new interaction primitive: external systems push events (webhooks, CI failures, chat messages) into a session that already has accumulated project context. Sessions become long-lived event processors, not request-response interactions. Implementation reuses MCP — a channel is just an MCP server with one extra capability flag, so existing tooling and security infrastructure applies. Remote permission relay distributes tool-approval prompts to Telegram/Discord; both local terminal and remote channel stay live, first response wins. This is a different trust topology than local-only approval gates.

**Key insight:** Push-based events into stateful sessions is a different primitive from polling, hooks, or fresh sessions per task. The session's accumulated context is the value — you don't want to rebuild it for every webhook.

## Cook — R.J. Corwin

[github.com/rjcorwin/cook](https://github.com/rjcorwin/cook)

TypeScript CLI (~1,200 lines) that orchestrates Claude Code, Codex, and OpenCode as black-box subprocesses with a composable operator grammar.

**What I took:** The fork-join-judge pattern with git worktrees: run N agents in isolated worktrees simultaneously, then have a judge agent compare all results and pick/merge/synthesize. Operators compose left-to-right: `cook "task" review v3 pick` means "review loop, raced across 3 branches, judge picks best." This solves the shared-mutable-state problem by giving each agent its own copy of the codebase. Also ships as a no-code SKILL.md that teaches the host agent to orchestrate subagents using the same grammar — dual distribution of the same workflow language across an external CLI and an in-agent skill.

**Key insight:** The orchestrator can be a small DSL with composable operators (work, review, repeat, race, judge) rather than a framework or a bash loop. The grammar compresses common multi-agent workflows into one-liners.

## Parallel Coding Agents with tmux and Markdown Specs — Schipper

[schipper.ai/posts/parallel-coding-agents](https://schipper.ai/posts/parallel-coding-agents/)

Practical guide to managing 4-8 concurrent Claude Code sessions using tmux, with numbered Feature Design (FD) spec files as the coordination primitive.

**What I took:** Spec-driven handoff between planner and worker agents: the Planner produces a full design spec per feature (problem, solutions considered, chosen approach, implementation plan, files to modify, verification steps) and the Worker implements from that spec in a fresh session with zero history. The spec carries more information than a feature list entry and is more structured than a progress file. After 300+ features, archived FDs become searchable decision traces that agents rediscover during exploratory work — design decisions that would normally live in Slack threads are in the repo as versioned artifacts. Inline `%%` annotation pattern for precise spec feedback: instead of conversational back-and-forth, edit the spec file directly and tell the agent "check %% notes."

**Key insight:** Full design specs as handoff artifacts between planner and worker agents are more effective than feature list entries. The spec captures alternatives considered and rationale, not just what to build — and archived specs become an agent-discoverable decision history.

## context-mode + mcp2cli — MCP Context Reduction

[mksg.lu/blog/context-mode](https://mksg.lu/blog/context-mode) | [github.com/knowsuchagency/mcp2cli](https://github.com/knowsuchagency/mcp2cli)

Two projects attacking different sources of MCP context waste. context-mode (570 HN points) sandboxes tool output; mcp2cli (146 points) eliminates tool schema overhead.

**What I took:** Two distinct patterns. First, output sandboxing: context-mode intercepts tool calls via lifecycle hooks, runs them in subprocesses, indexes output into SQLite FTS5 with BM25 ranking, and returns only relevant excerpts to the agent. 315 KB of raw tool output becomes 5.4 KB (98% reduction). No LLM involved — just full-text search. Second, CLI wrapping for schema elimination: mcp2cli converts MCP tool servers into CLI binaries the agent discovers via `--help` flags. 40 tool schemas (55,000 tokens/turn) become bash calls with progressive discovery (~200 tokens per lookup). Scalekit benchmark: 32x fewer tokens via CLI vs native MCP. These are additive — schema elimination reduces fixed per-turn cost, output sandboxing reduces variable per-call cost.

**Key insight:** The two biggest sources of context waste in MCP are tool schemas (always loaded, rarely all needed) and tool outputs (raw dumps that flood context). Both are solvable without LLM involvement — text search for outputs, CLI discovery for schemas.

## Rudel — Claude Code Session Analytics

[github.com/obsessiondb/rudel](https://github.com/obsessiondb/rudel)

Analytics platform that analyzed 1,573 Claude Code sessions across a 6-person team. ClickHouse backend with materialized views computing per-session metrics.

**What I took:** The output/input token ratio is the simplest proxy for "is the agent productive or spinning." Low ratio + high total tokens = the agent is reading a lot but producing nothing. Session archetypes (quick_win, deep_work, struggle, exploration, abandoned) classified by token ratio, duration, and commit presence are more actionable than raw averages. Error cascades in the first 2 minutes predict abandonment — early error clustering is predictive, not just descriptive. Feature adoption rates (skills 4%, plan mode low) are leading indicators of developer proficiency. Cost-per-commit is more meaningful than cost-per-session. Temporal tool activity visualization (swimlane of tool calls over time) reveals clustering patterns that aggregate counts miss.

**Key insight:** 26% of sessions are abandoned, most within 60 seconds. The agent that matters most is the first 2 minutes.

## GSD (Get Shit Done)

[github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)

Meta-prompting framework that installs as 44 slash commands + 46 workflows + 16 agents into Claude Code (and 5 other runtimes). v1.28, real test coverage, handles real edge cases (Windows EPERM, WSL paths, Docker).

**What I took:** The analysis paralysis guard: "if you make 5+ consecutive Read/Grep/Glob calls without any Edit/Write/Bash action: STOP." Simple, enforceable, catches a real failure mode. Context monitor hook that injects warnings at 35%/25% context remaining into the agent's `additionalContext` — makes autonomous agents self-aware of context pressure before compaction wipes state. Prompt injection defense for planning artifacts — agent-written markdown files that become future system prompts are scanned for injection patterns via a PreToolUse hook. Wave-based parallel execution with file locking (`O_EXCL` atomic creation on STATE.md) for coordination. The "thin orchestrator" pattern: orchestrator loads paths only (~10-15% context), subagents read files with fresh context.

**Key insight:** Instrument the tool call stream for degenerate sequences. Analysis paralysis (5 reads, no writes), fix loops (edit-revert-edit), test hoping (same test 3+ times) — each is a detectable pattern a hook can interrupt.

## 8 Learnings from 1 Year of Agents — PostHog

[posthog.com/blog/ai-agent-learnings](https://posthog.com/blog/ai-agent-learnings)

PostHog's Michael Matloka on building PostHog AI from hackathon prototype to production agent over a year. Went through three graph-based workflow architectures before landing on a single agentic loop.

**What I took:** The todo tool insight: `todo_write` is a "superpower" where "there's nothing this tool actually needs to do." The value is attention anchoring — writing next steps places intent late in the context window, preventing the agent from losing track across long tool chains. This is the within-session equivalent of the progress file pattern. Also: their "switch mode" tool is a variant of tool search for scaling to many tools without context bloat — confirms the progressive disclosure pattern.

The rest confirms existing patterns: agents beat graph workflows (Ralph v1-v3), single loop beats subagents (context boundaries), context is everything (/init for user onboarding), frameworks are harmful (stay low-level), model improvements invalidate architectural decisions, and evals alone aren't enough (Traces Hour for real usage review).

**Key insight:** A no-op tool that makes the agent write down its plan works because of where the output sits in the context window, not because of what it produces. Attention anchoring, not state management.

## What We Wish We Knew About Building AI Agents — PostHog

[newsletter.posthog.com/p/what-we-wish-we-knew-about-building-ai-agents](https://newsletter.posthog.com/p/what-we-wish-we-knew-about-building-ai-agents)

PostHog's retrospective on two years of building AI agents into their product, from an initial "AI product assistant" through three harness iterations to PostHog AI.

**What I took:** Two ideas not well-covered elsewhere. First, MCP-first product strategy: before building a custom agent, consider exposing your product as an MCP server instead. PostHog's MCP server accounts for 34% of AI-created dashboards — comparable to their built-in agent. MCP servers are simpler to build, validate demand, and serve the growing population of developers using agents as their primary interface. Only go custom when users are non-engineers, compliance blocks external agents, or you need full UX control.

Second, convergence of internal and external agent interfaces: PostHog's 3rd harness iteration (Claude Agent SDK + MCP tools + skills) emerged from realizing their agent and their MCP server should share the same architecture. "Our users are increasingly agents" — whether through PostHog AI or their MCP server. One tool surface, two personas. This avoids the trap of maintaining parallel capability sets.

The rest confirms existing patterns: context is your advantage (layered runtime injection, taxonomy tool for progressive disclosure, memory onboarding), start with simpler alternatives before building an agent (LLM call → specialized model → hardcoded workflow → agent), observability from day one, and reliability beats capabilities as the user-facing priority. Their "traces hour" — a team meeting to manually review real LLM traces and discover eval-worthy patterns — is a good specific practice for teams without established eval pipelines.

**Key insight:** Consider MCP as your product's canonical agent interface first. If adoption is strong, your custom agent should consume the same MCP tools — not a parallel set of internal APIs.

## UNDERWRITE: Benchmarking Agents in Insurance Underwriting — Snorkel AI

[arxiv.org/pdf/2602.00456](https://arxiv.org/pdf/2602.00456)

Expert-first benchmark for evaluating AI agents on 300 multi-turn commercial insurance underwriting tasks. 13 frontier models evaluated with MCP-exposed tools, a simulated underwriter user, and proprietary business rules.

**What I took:** Three findings that changed how I think about agent reliability. First, tool error recovery matters more than tool error avoidance — even top models (Claude Sonnet 4.5, GPT-5, Grok-4) had tool errors in 20-40% of conversations, but recovery rate (self-correcting after a failed tool call) had moderate-to-strong correlation with correctness while raw error rate had weak correlation. Build agents that retry well, not agents that never fail.

Second, pretrained knowledge is an active hazard in specialized domains. Models hallucinated domain-specific answers from training data even with full tool access. Accuracy dropped sharply as reference answers diverged from pretrained expectations. Smaller models hit hardest (Claude Haiku: 100% on low-surprise tasks, 66% on high-surprise). The model thinks it knows and doesn't bother checking the tools.

Third, verbose reasoning without tool use is a detectable failure signal. Incorrect traces had fewer steps but higher token counts — agents talked themselves into wrong answers instead of grounding with tools. GPT-5-Nano: 7k tokens, 3 steps, zero tool calls, wrong. Claude Haiku: 400 tokens, 4 steps, 1 tool call, correct.

Also notable: Claude Sonnet 4.5's state transition diagrams showed tool-to-tool-to-ai patterns (multiple tool calls with internal reasoning before responding), while weaker models like Gemini 2.5 Pro did tool-to-user (sending each result directly back, often with bad follow-up questions). Internal reflection before surfacing to the user is a behavioral marker of top performers. And pass@k showed ~20% degradation from pass@1 to pass@4 — models that get it right once don't get it right consistently. Single-run evals overstate real-world reliability.

**Key insight:** The most accurate models aren't the most efficient, and tool errors are universal. What separates top agents is self-correction after tool failures and knowing when to check tools vs. trusting pretrained knowledge.

## Multi-Agent Teams Hold Experts Back — Stanford

[arxiv.org/abs/2602.01011](https://arxiv.org/abs/2602.01011)

Stanford study testing LLM agent teams across MMLU Pro, GPQA, HLE, MATH-500, SimpleQA, and organizational psychology tasks. Models tested include Claude Opus 4/4.5, GPT-5, o3-mini, o4-mini, and others.

**What I took:** The strongest empirical evidence that multi-agent teams systematically fail to leverage expertise. Teams achieve "weak synergy" (beating the average member) but never "strong synergy" (matching the expert). The mechanism is "integrative compromise" — non-expert agents average expert and non-expert views instead of deferring to the expert. Even when teams are explicitly told which agent is the expert, performance barely improves. Synergy gaps range from 8.1% (MMLU Pro) to 98.7% (psychology tasks). Larger teams make it worse: statistically significant degradation from 2 to 8 agents.

The root cause is RLHF alignment training, which optimizes for agreeableness over epistemic deference. One important wrinkle: integrative compromise *protects* against adversarial agents. When a saboteur was injected into a team, multi-agent consensus filtered the bad input effectively. The failure mode for expertise is a feature for adversarial robustness — a genuine tradeoff.

**Key insight:** Current multi-agent teams require explicit role specification and workflow design. Self-organizing deliberation doesn't work because RLHF-trained models compromise when they should defer.

## CooperBench: Why Coding Agents Cannot Be Your Teammates Yet — Stanford / SAP

[arxiv.org/abs/2601.13295](https://arxiv.org/abs/2601.13295)

652 collaborative coding tasks across 12 repos (Python, TypeScript, Go, Rust). Tested GPT-5, Claude Sonnet 4.5, and others under minimal scaffolding to expose raw coordination capabilities.

**What I took:** Solo agents achieve ~50-63% success on paired coding tasks; 2-agent teams drop to ~25-29%. Performance degrades monotonically as you add agents — the opposite of human teams. Communication reduces merge conflicts but has approximately zero effect on task success. The failure taxonomy: 42% expectation failures (agent ignores what partner explicitly communicated), 32% commitment failures (agents don't follow through on promises), 26% communication failures. The biggest surprise: information is transmitted and received but not incorporated — this isn't a communication problem, it's a state-modeling problem. Agents can't maintain a model of what their partner is doing.

Other findings: weaker coders coordinate better relatively (retain 68% of solo performance) while the strongest coders lose the most from coordination overhead. Prompt engineering targeting observed failure modes produced marginal improvements — these are fundamental capability gaps. Successful traces showed emergent role division and line-level resource allocation ("I will modify ONLY lines 68-84"), but these patterns are rare and unreliable.

**Key insight:** The bottleneck for multi-agent coding has shifted from individual capability to coordination capability. Adding agent workers degrades results with current models.

## When Single-Agent with Skills Replace Multi-Agent Systems — Xiaoxiao Li

[arxiv.org/abs/2601.04748](https://arxiv.org/abs/2601.04748)

Study on compiling multi-agent systems into single-agent-with-skills, with scaling experiments on skill library size and selection accuracy.

**What I took:** Multi-agent systems can often be compiled into a single agent with a skill library — ~54% token reduction, ~50% latency reduction, equivalent accuracy on GSM8K, HumanEval, and HotpotQA. The compilation fails when tasks require true parallelism, agents maintain private state, or agents have adversarial objectives.

The most important finding: skill selection accuracy doesn't degrade gradually — it hits a phase transition cliff at ~50-100 skills (GPT-4o class). Below threshold: >90% accuracy. Above 200: ~20%. Decay exponent >1 (super-linear). The driver is semantic confusability between skills, not raw count. Adding one near-duplicate skill at library size 20 caused 7-30% accuracy drop. Instruction complexity (30 vs. 300 tokens per skill) had zero effect. The bottleneck is choosing the right skill, not understanding what it does.

Hierarchical routing (select domain first, then skill) recovers 37-40% absolute accuracy above the threshold. Both models tested (GPT-4o, GPT-4o-mini) showed the same pattern with slightly different capacity thresholds.

**Key insight:** There is a measurable cliff in skill selection around 50-100 tools, driven by semantic similarity, not count. Hierarchical routing is the known mitigation.

## τ³-Bench: Knowledge and Voice Agent Benchmarking — Sierra

[sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice](https://sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice)

Sierra's extension of the original τ-bench (Yao et al., 2024) adding knowledge retrieval and voice evaluation dimensions. Corporate blog post, not peer-reviewed, but the numbers are concrete and honestly reported — they make agents look bad.

**What I took:** Two findings. First, knowledge-grounded task completion is much harder than retrieval. On τ-Knowledge (698 documents, 195K tokens, fintech customer service), GPT-5.2 with high reasoning achieved only ~25% task success. Even when the agent was handed the exact documents it needed — perfect retrieval — success only reached 40%. The bottleneck is "understanding it, drawing the correct conclusions, and executing the required actions," not finding the information. Some models reached similar accuracy but took nine times longer. This is the strongest data point I've seen against the assumption that RAG + a good model = solved problem.

Second, voice agents collapse under realistic conditions. In clean environments, the best voice agents hit ~54% success (comparable to non-reasoning text models at 31-51%). Under realistic conditions — accents, noise, interruptions, compressed phone lines — voice agents drop to 26-38%, while text agents with reasoning stay at ~85%. Authentication is the cascade trigger: mishearing a name or email at the start poisons everything downstream. The gap isn't just ASR quality — agents can't reason during fluid conversation the way they can with extended thinking time in text.

Also worth noting: Sierra's own benchmark shows agents at 25-40% on knowledge tasks, while their Ghostwriter product announcement claims you can upload SOPs and get production-ready agents. These claims are in direct tension.

**Key insight:** Giving an agent the right documents is necessary but nowhere near sufficient. The retrieval-to-action gap — understanding documents, drawing conclusions, and executing correctly — is where most failures happen, not in retrieval itself.

## Claude-Mem

[github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

Persistent memory system for Claude Code using a second Claude instance as an observer. v10.6, AGPL-3.0.

**What I took:** The observer agent pattern: a second Claude instance with all tools disabled watches the primary session's tool I/O via PostToolUse hooks, compresses raw observations into structured records (what was investigated, learned, completed, next steps), and stores them in SQLite with FTS5 search. Future sessions get relevant records injected via SessionStart. Progressive disclosure for memory search: index first (~50 tokens/result), then full details only for relevant IDs (~500+ tokens). Mode profiles with inheritance for internationalization.

**Key insight:** Separating "doing work" from "recording what happened" into two instances is architecturally clean but expensive. For most projects, a progress file is 80% of the benefit at 0% of the cost. The observer pattern makes sense when automated capture has compounding value across hundreds of sessions.

## How I'm Productive with Claude Code — Neil Kakkar

[neilkakkar.com/productive-with-claude-code.html](https://neilkakkar.com/productive-with-claude-code.html)

HN front page (277 pts, 163 comments). Kakkar describes his workflow evolving from writing code to building infrastructure that enables agents.

**What I took:** Theory of constraints applied to agent workflows. Remove bottlenecks in sequence: formatting friction (automated PR creation via `/git-pr` skill), waiting friction (SWC for sub-second restarts), verification friction (agent-driven previews), context-switching friction (parallel worktrees with unique port ranges). Each solved constraint reveals the next. The insight that the highest-leverage work is infrastructure for agents, not features, matches what I've seen with Ralph — building the harness paid off more than improving prompts.

Port collision management across worktrees is a real operational problem when scaling to multiple concurrent agents. Every server instance tries to bind the same ports. You need unique port ranges per worktree — the kind of infrastructure that's invisible until you try to parallelize.

**Key insight:** Apply theory of constraints to agent-assisted development. The bottleneck is rarely the agent's reasoning — it's the infrastructure surrounding it.

## How We Build Evals for Deep Agents — LangChain

[blog.langchain.com/how-we-build-evals-for-deep-agents](https://blog.langchain.com/how-we-build-evals-for-deep-agents/)

LangChain's eval framework for their Deep Agents product.

**What I took:** Four efficiency metrics alongside correctness: step ratio (observed/ideal steps), tool call ratio, latency ratio, solve rate. All measured against an "ideal trajectory" — the minimal correct path. This is more useful than pass/fail because it separates "solved wastefully" from "solved efficiently." Tag evals by capability tested (file_operations, retrieval, tool_use), not by source. Run focused subsets via CLI flags. Their eval generation pipeline: dogfooding traces → failure patterns → repeatable test cases → tagged by capability. External benchmarks supplement but don't replace production-derived evals. Explicitly separate SDK unit tests (hygiene) from model capability evals (scored).

**Key insight:** Measure efficiency alongside correctness using ideal trajectory baselines. Dogfooding traces are the best source of eval cases.

## The Revenge of the Data Scientist — Hamel Husain

[hamel.dev/blog/posts/revenge](https://hamel.dev/blog/posts/revenge/)

Husain argues that data science fundamentals are exactly what's missing from most teams building with LLMs.

**What I took:** Five eval pitfalls that match what I've seen teams get wrong. (1) Generic metrics — use application-specific ones like "Calendar Scheduling Failure," not ROUGE. (2) Unverified LLM judges — treat them as classifiers, measure precision/recall, not accuracy. (3) Synthetic test data untethered from production — ground in real logs. (4) Contractor labeling instead of domain expert labeling — the labeling process itself surfaces "criteria drift" where stakeholders discover what they actually want. (5) Over-automation — "you don't know what you want until you see the outputs."

The through-line: every pitfall is a skipped data science fundamental (EDA, model evaluation, experimental design, data collection, monitoring). Teams building agents need the same rigor they'd apply to any ML system.

**Key insight:** Treat LLM-as-judge as a classifier requiring validation. Binary pass/fail on scoped outcomes beats Likert scales. Domain experts must label because the labeling process itself reveals what you actually care about.

## How Middleware Lets You Customize Your Agent Harness — LangChain

[blog.langchain.com/how-middleware-lets-you-customize-your-agent-harness](https://blog.langchain.com/how-middleware-lets-you-customize-your-agent-harness/)

LangChain's middleware architecture for Deep Agents.

**What I took:** The formalization of deterministic safety nets as six composable lifecycle hooks: before_agent, before_model, wrap_model_call, wrap_tool_call, after_model, after_agent. Multiple middleware stack without conflict (FilesystemMiddleware + SubagentMiddleware + SummarizationMiddleware). Two distinct use case categories: deterministic policies that "can't live in a prompt" (PII redaction, content moderation, tool filtering) and context engineering (summarization, history trimming). This is the architectural pattern behind what Open SWE and Claude Code hooks do, made explicit as a composable middleware stack.

**Key insight:** Middleware that wraps the agent lifecycle is how you enforce deterministic policies and manage context dynamically — the things prompts can't reliably do.

## ATLAS: Adaptive Test-time Learning and Autonomous Specialization

[github.com/itigges22/ATLAS](https://github.com/itigges22/ATLAS)

HN front page (158 pts). A frozen 14B quantized model wrapped in a three-phase pipeline that outperforms Claude Sonnet on LiveCodeBench.

**What I took:** The case that structured infrastructure around a small model can beat larger models on coding benchmarks. Phase 1: PlanSearch generates diverse solution approaches with BudgetForcing controlling thinking tokens. Phase 2: geometric self-embeddings (5120-dim) score and rank candidates. Phase 3: self-verified repair generates its own test cases (never sees ground truth) and iteratively fixes failing solutions — rescuing 85.7% of failures. The repair phase contributes +7.3pp; candidate selection adds +0pp (undertrained). Cost: ~$0.004/task vs ~$0.07 for API calls.

The tradeoff is 20 min/task — incompatible with interactive use but viable for batch processing, CI, and research. The broader lesson: when latency is cheap, trading time for verification rigor is a valid strategy.

**Key insight:** Structured repair using self-generated tests matters more than candidate selection. Infrastructure over scale.

## Everything is CLI — Latent Space

[latent.space/p/ainews-everything-is-cli](https://www.latent.space/p/ainews-everything-is-cli)

Latent Space's roundup arguing CLIs are becoming the dominant agent interface.

**What I took:** Services are shipping CLIs faster than MCP servers — Stripe Projects.dev, Ramp CLI, ElevenLabs, Resend, Discord, Google Workspace, Visa. CLIs are simpler to wrap and easier for agents to parse than protocol layers. "Cline Kanban" pattern: a web UI for orchestrating multiple CLI coding agents across isolated worktrees. The framing of "harness engineering" as the real product layer — model quality is necessary but the middleware, memory, tool interfaces, and safety policies are what differentiate products.

Confirms the CLI wrapping pattern (mcp2cli) from the MCP context reduction section, but at a broader industry level — entire companies are adopting CLI-first as their agent interface strategy.

**Key insight:** CLIs are winning over MCPs as the pragmatic agent interface because they're simpler and agents already know how to use them.

## Thoughts on Slowing the Fuck Down — Mario Zechner, via Simon Willison

[simonwillison.net/2026/Mar/25/thoughts-on-slowing-the-fuck-down](https://simonwillison.net/2026/Mar/25/thoughts-on-slowing-the-fuck-down/#atom-everything)

Zechner (creator of the Pi agent framework, OpenClaw) on the discipline gap in agentic development. Willison adds commentary.

**What I took:** The argument that agents remove the natural constraint of human typing speed, so errors compound at inhuman scale. Developers lose understanding when delegating — "you have zero idea what's going on because you delegated all your agency to your agents." Changes that warrant weeks of consideration now occur in hours. Willison's counter: "write by hand" isn't the answer — a new discipline balancing speed against thoroughness is needed. This is a framing problem, not a tooling problem. Strengthens the case for verification infrastructure, not slower agents.

**Key insight:** Agent speed isn't the problem — the lack of proportional verification is. Build verification that scales with output, not human review that doesn't.
