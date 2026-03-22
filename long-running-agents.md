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

### Parallel execution

Multiple agents writing to the same codebase simultaneously causes write conflicts, inconsistent state, and coordination failures. Sequential is slower but dramatically more reliable for overnight runs.

### Dynamic replanning

Planners that observe the codebase and generate new items across iterations get confused about what exists vs what doesn't. A one-shot feature list from the initializer works better than continuous replanning.

### Browser observation as default

Browser tools (screenshots, console logs) are powerful but agents treat them as verification loops — screenshotting, seeing errors, trying to fix, screenshotting again for 30+ minutes. Better to have bounded verification scripts and only use browser tools when the agent needs them for implementation.

### No context transfer

Each session starting cold with no memory of previous sessions is the single biggest failure mode. The progress file pattern exists specifically to solve this.

## The simplest implementation

OG Ralph: 15 lines of bash that pipe a prompt into Claude Code in a loop. The prompt says "read prd.json, pick the next unfinished story, implement it, commit, mark it done." Memory persists via git history and progress.txt. That's it.

Everything else (Petri nets, adaptive strategies, parallel tracks, dynamic replanning) is optimization that may or may not be worth the complexity. Start with the bash loop.
