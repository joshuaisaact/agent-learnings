# Architecture Patterns

When to use what. Based on Anthropic's whitepaper + my own experience.

## Single agent

**What:** One agent in a loop — perceive, decide, act, repeat.

**When:** Most of the time. Customer service, document processing, code review, routine analysis, any well-scoped task.

**Why it works:** Simple to build, debug, and observe. A single agent with good skills/tools handles far more than you'd expect. Before reaching for multi-agent, try adding skills to a single agent.

**Watch out for:** Trying to one-shot complex tasks. If the agent is doing too much at once, break the task down — but that doesn't mean you need multiple agents. It might just mean a better prompt or a sequential workflow.

## Sequential workflows

**What:** Predetermined control flow — agent A finishes, hands off to agent B, etc.

**When:** Multi-step processes with clear linear dependencies. Content pipelines (draft → review → publish). Data transformation. Compliance checking.

**Why it works:** Predictable, auditable, each step is focused. You trade latency for accuracy by making each call an easier task.

**Watch out for:** Over-sequencing things a single agent could handle. If there are only 2-3 steps, a single agent with a good prompt might be simpler.

## Parallel workflows

**What:** Fan-out independent tasks to multiple agents simultaneously, merge results.

**When:** Tasks that benefit from multiple perspectives (code review from different angles) or independent analyses that can run concurrently (risk assessment across multiple dimensions).

**Why it works:** Speed (concurrent processing) and coverage (multiple viewpoints on the same problem).

**Watch out for:** Shared mutable state. If parallel agents need to write to the same files/database, you'll get conflicts. Only parallelize truly independent work.

**Git-based task locking:** Anthropic's C compiler project ran 16 parallel Claude instances successfully. The key: agents claim tasks by writing files to `current_tasks/`, and git merge conflicts naturally force re-selection. This turns git into a lightweight coordination layer without needing external orchestration. The difference from Ralph's failed parallel attempts: coordination via git conflicts rather than shared mutable state.

**Fork-join-judge with worktrees:** Cook (`github.com/rjcorwin/cook`) implements a different parallelism pattern: run N agents in isolated git worktrees simultaneously, then have a judge agent compare all results and pick the winner (or merge/synthesize). The isolation is real — separate filesystem trees from the same repo, so agents can't interfere with each other. Three resolution strategies: pick (judge selects best branch), merge (judge synthesizes all branches), compare (judge writes analysis, no merge). Operators compose: `cook "task" review v3 pick` means "run a review loop, race 3 parallel branches, judge picks the best." This solves the shared-mutable-state problem by eliminating it — each agent gets its own copy of the codebase.

## Hierarchical / supervisory

**What:** Supervisor agent delegates to specialist agents, coordinates results.

**When:** Complex problems spanning multiple domains where specialists add real value. The supervisor is basically a router + coordinator.

**Why it works:** Mirrors effective human teams. Specialists focus on their domain, coordinator handles integration.

**Watch out for:** Context management — the supervisor can become a bottleneck as context grows. Token costs are 10-15x a single agent. Only worth it for high-value tasks.

## Collaborative / peer-to-peer

**What:** Autonomous agents communicate directly, negotiate roles, solve problems through distributed intelligence. No central coordinator.

**When:** Open-ended research, brainstorming, problems where emergent behavior is a feature.

**Watch out for:** Unpredictable emergent behavior. Communication complexity. Agents bouncing tasks indefinitely. Hardest pattern to debug.

## Evaluator-optimizer

**What:** Generator creates content, evaluator provides feedback, iterate until quality threshold met.

**When:** Tasks where iterative refinement demonstrably improves quality: code generation with security requirements, content creation, translation, complex analysis with validation.

**Watch out for:** Token costs (2-4 cycles typical). Don't use when first-attempt quality is already sufficient.

## Interrogatory LLM

**What:** Instead of the human writing context for the agent, the agent interviews the human and produces the context document itself. One question at a time, explicitly — letting the model batch questions defeats the discipline. [Martin Fowler's framing](https://martinfowler.com/bliki/InterrogatoryLLM.html).

**When:** The context that needs to exist is in someone's head and they find writing it harder than answering questions. Specification capture, expert review of a draft spec, eliciting tribal knowledge from a domain expert before they leave the team.

**Watch out for:** Leading questions confirm what the model already assumed. Useful counter: have the interview produce a structured artifact (numbered facts, claims tagged with provenance) so review catches drift. Also: don't let the model generate the document and the questions in the same turn; separate "ask" and "synthesize" phases. The interrogatory direction works best when the human is the source of truth and the bottleneck is articulation, not analysis.

## Bug-taxonomy decomposition for review

For code review agents, decompose by vulnerability class rather than by workflow step or role. Sashiko (Google/Linux Foundation's kernel code review agent) runs 7 sequential analysis passes, each focused on one concern domain: (1) architectural correctness, (2) commit-message alignment, (3) logic errors, (4) memory lifecycle, (5) concurrency, (6) security, (7) hardware-specific. Each pass is optimized for recall — intentionally over-reports. Then a dedicated 8th consolidation stage deduplicates findings across all passes and attempts to logically prove or disprove each one before output.

This works because a single "review this code" prompt suffers from attention dilution — the model tries to check everything and checks nothing thoroughly. Narrowing each pass to one concern domain improves depth. The consolidation stage then manages precision, filtering false positives with logical reasoning rather than confidence thresholds.

Results: 53.6% of bugs detected from 1,000 upstream kernel commits that had already passed human review (i.e., bugs humans missed), with under 20% false positive rate using Gemini 3.1 Pro.

The consolidation stage is a variant of the evaluator-optimizer pattern but applied differently: instead of iterating on quality, multiple analysis passes feed into a single adjudicator whose job is to prove or disprove findings. This is reusable anywhere review has multiple independent failure modes (security audit, compliance checking, test coverage analysis).

Sashiko also loads per-subsystem prompts conditionally — a block layer patch gets block-specific review knowledge, a networking patch gets different context. Only the relevant subsystem's prompt is loaded, keeping context lean. This is progressive disclosure applied to domain expertise.

## Decompose by context boundaries, not problem type

The intuitive way to split work across agents is by role: planner, implementer, tester, reviewer. This is usually wrong. Anthropic found that role-based splits cause agents to spend more tokens coordinating than working — the "telephone game" failure mode where each handoff between sequential agents degrades information fidelity.

Instead, decompose by what shares context. A feature and its tests belong in the same agent because they share the same mental model of the code. Tightly coupled work belongs together regardless of what "type" of work it is. Multi-agent is only consistently justified for: (1) context pollution degrading reasoning, (2) genuinely parallelizable subtasks, or (3) 15-20+ tools causing selection confusion.

## Decision framework

Ask these questions in order:

1. **Can a single agent handle it?** If yes, stop here. Most tasks can.
2. **Is the process linear and predictable?** → Sequential workflow.
3. **Are there independent subtasks?** → Parallel workflow.
4. **Do you need domain specialists?** → Hierarchical with specialist agents.
5. **Is it open-ended exploration?** → Collaborative (but think hard about whether you really need this).

The key insight from Anthropic's internal research: multi-agent outperforms single-agent by 90% — but only for "complex tasks requiring pursuit of multiple independent directions simultaneously." For everything else, single-agent wins on cost, simplicity, and debuggability.
