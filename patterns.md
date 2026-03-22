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

## Decision framework

Ask these questions in order:

1. **Can a single agent handle it?** If yes, stop here. Most tasks can.
2. **Is the process linear and predictable?** → Sequential workflow.
3. **Are there independent subtasks?** → Parallel workflow.
4. **Do you need domain specialists?** → Hierarchical with specialist agents.
5. **Is it open-ended exploration?** → Collaborative (but think hard about whether you really need this).

The key insight from Anthropic's internal research: multi-agent outperforms single-agent by 90% — but only for "complex tasks requiring pursuit of multiple independent directions simultaneously." For everything else, single-agent wins on cost, simplicity, and debuggability.
