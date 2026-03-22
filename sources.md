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

## Building Effective AI Agents: Architecture Patterns — Anthropic

[anthropic.com whitepaper, 2025](https://www.anthropic.com)

Enterprise patterns for agent architectures: single agent, hierarchical, collaborative, sequential/parallel workflows, evaluator-optimizer.

**What I took:** Start simple, scale intelligently. Single agents handle most use cases. Multi-agent outperforms single-agent by 90% — but only for complex tasks requiring multiple independent directions simultaneously. The progression: single agent → single agent with skills → sequential workflow → multi-agent. Most people should stop at step 1 or 2. Skills provide deep specialization without multi-agent complexity. The industry's answer to agent safety is observability + human oversight, not formal methods.

**Key insight:** The best architecture is the simplest one that meets today's requirements while providing a path to tomorrow's capabilities.
