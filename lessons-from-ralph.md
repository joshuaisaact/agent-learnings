# Lessons from Ralph

I built 4 versions of an autonomous coding agent called Ralph. Each version tried a different approach to "take a goal, build a project." Here's what I learned.

Full code and detailed findings: [github.com/joshuaisaact/ralphv2](https://github.com/joshuaisaact/ralphv2)

## v1 — Petri net executor

**Approach:** Parse a PRD into work items, model as a Petri net, fire transitions concurrently as dependencies are satisfied. Review each item against acceptance criteria, retry on failure. Audit loop that reads the built code, finds issues, generates fix items, wires them into the net, repeats until clean.

**What worked:** The audit loop was genuinely good. A Trello clone went through 4 rounds (14 items → 8 fixes → 6 fixes → 3 fixes → clean). It caught auth bypass, API mismatches, missing UI — things a human reviewer would find. 39-47% faster than sequential baseline due to parallelism.

**What didn't:** The Petri net was over-engineering *for task orchestration*. Using a formal dependency graph to decide which work items to build in what order added complexity (deadlocks, cascading failures) without meaningful benefit over an ordered list. Agents with bash can self-orchestrate their work — they don't need an external graph engine telling them what order to build things in.

**Important distinction:** This lesson is specifically about Petri nets for *task orchestration* — modeling work items and their dependencies. Petri nets for *tool access control* (gating which tools an agent can use at any given moment) are a different application of the same formalism, and they address a different problem. Task orchestration replaces the agent's judgment about what to do. Tool gating constrains what the agent *can* do while leaving the decision-making to the agent — which is exactly the "enforce invariants, not implementations" pattern. PetriFlow (the safety framework I built after Ralph) uses Petri nets this way: `require backup before delete` doesn't tell the agent what to build, it prevents unsafe tool sequences. The formal verification that was overkill for task ordering is genuinely valuable for proving safety properties — that no sequence of agent actions can bypass a safety gate.

## v2 — Goal-driven iterative planner

**Approach:** Added autonomous planning on top of v1. Give it a goal ("build me a trello clone"), it generates a PRD, executes, observes the codebase, replans with new items.

**What worked:** Zero-human-input planning from goal to working app is compelling.

**What didn't:** Planners got confused across iterations. Thought code existed when it didn't. Claimed goals were satisfied when nothing was built. Dynamic replanning is fragile — a one-shot feature list from an initializer works better.

## v3 — Adaptive strategy selection

**Approach:** Added strategy selection (different approaches for different types of tasks), parallel tracks, continuous testing, reflection snapshots.

**What didn't:** Everything. More failure modes than v2 with marginal improvement. Classic over-engineering — added complexity without solving the actual problems.

## v4 — Browser observation

**Approach:** v2 + chrome-devtools-mcp so agents could take screenshots, check console errors, verify the running app.

**What worked:** When it worked, agents caught bugs they'd have missed from code alone.

**What didn't:** Agents spent 30+ minutes in screenshot loops instead of writing code. The observation tools became a time sink rather than a verification aid. Also leaked orphaned MCP processes — no cleanup on timeout/abort.

**What I'd do differently now:** The problem wasn't browser observation — it was unstructured browser observation. OpenAI's Codex harness made this work by giving each task an isolated app instance (bootable per git worktree), building structured skills for DOM interaction rather than exposing raw CDP, and pairing visual checks with queryable signals (logs via LogQL, metrics via PromQL). The agent queries specific things ("does this span exceed 2 seconds?") rather than staring at pixels hoping to spot problems. The investment is heavy but the feedback loop is tight.

## Cross-cutting failures

These problems appeared in every version:

1. **No context transfer between sessions.** Each agent invocation started cold. No memory of what previous agents learned or did. This was the #1 failure mode.
2. **Parallel agents on shared state.** Multiple agents writing to the same codebase caused conflicts, inconsistencies, and deadlocks.
3. **Complexity fighting the agent.** Every layer of *task orchestration* I added (Petri net work scheduling, adaptive strategies, parallel tracks) was complexity the agent had to work around rather than with. The agent is smarter than my orchestration. The exception: safety constraints that gate tool access don't fight the agent — they constrain the action space, which actually helps the agent make better decisions within clearer boundaries.

## What I'd tell past me

1. Start with a bash loop piping a prompt into Claude Code. That's OG Ralph and it works.
2. Add a progress file for context transfer between sessions. This is the single most impactful thing you can do.
3. Use an initializer agent to scaffold + generate a feature list. This removes the need for human story-writing.
4. Generate verification scripts, not just feature descriptions. Programmatic assertions > self-reporting.
5. One feature per session, sequential, committed to git. Don't parallelize.
6. Don't build task orchestration. The agent IS the orchestrator for deciding what to do. Give it bash and get out of the way. But DO build safety constraints — deterministic guardrails that gate tool access are a different kind of layer that helps rather than hinders. The distinction: orchestration replaces agent judgment, safety constrains the action space.
