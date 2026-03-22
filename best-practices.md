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

## Context engineering > prompt engineering

The most important thing you can do for an agent is give it the right context at the right time. This means:

- **Progressive disclosure** — don't dump everything upfront. Use the file system so the agent reads only what it needs. Skills are folders the agent discovers, not walls of text in the prompt.
- **Stable prompts, dynamic context via files** — keep the system prompt identical across sessions. Dynamic context (what to work on, what happened before) should be discovered by the agent reading files, not injected into the prompt. This also helps with prompt caching.
- **Gotchas are the highest-signal content** — if you maintain any kind of instructions file, the most valuable section is the gotchas. Things the agent will get wrong without explicit guidance.

## Don't railroad the agent

Give the agent information and tools. Let it decide the approach. Over-prescriptive prompts ("first do X, then do Y, then do Z") lead to rigid behavior. Describe what good looks like, not how to get there.

The exception: when there's a specific ritual or checklist that must happen (like a "get your bearings" sequence at the start of a session), be explicit about those steps. The distinction is: prescribe the what (read progress, verify app works), not the how (use this specific curl command to test).

## Verification over self-reporting

Don't trust the agent to say "I'm done, it works." Use programmatic assertions — scripts that check exit codes, tests that run automatically, browser automation that verifies UI behavior. The agent runs the verification, but the verification itself is deterministic.

Anthropic's skills team says verification skills are "extremely useful for ensuring Claude's output is correct" and recommends "programmatic assertions on state at each step."

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

## Observable systems

You need to see what the agent is doing and why. This is harder than normal software because agents are non-deterministic. At minimum:
- Log every tool call and result
- Track token usage and cache hit rates
- Trace multi-step reasoning chains
- In multi-agent systems: trace inter-agent communication and delegation patterns
