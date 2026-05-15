# Evals

How to evaluate AI agents well. This is harder than evaluating LLMs because agents take multi-step actions, use tools, and exhibit stochastic behavior across runs. Most teams get this wrong by either not evaluating at all or evaluating the wrong things.

## The hard prerequisite

If you can't evaluate it, you can't improve it. The autoresearch pattern makes this concrete: one file, one metric, git as experiment log. The agent doesn't decide if an experiment worked — the metric does. Programmatic evaluation, not vibes. This applies at every scale, from a single coding agent to a fleet of specialized agents.

## Grade outcomes, not paths

The most important principle in agent evals. A transcript records everything the agent did; the outcome is the final environment state. Judge the result, not whether the agent took the "expected" route. An agent that solves a bug via an unexpected but valid approach should score the same as one that follows your imagined ideal path.

Log the full trajectory for debugging — but the grader judges the final state.

## Three levels of evaluation

This is the pattern that Google, LangChain, Anthropic, and Langfuse have all converged on independently. If you only pick one framework for thinking about agent evals, pick this one.

1. **Final response (black-box)**: Evaluates only input and final answer. Simplest to set up. Works with any agent framework. Cannot diagnose failures. Start here.

2. **Trajectory (glass-box)**: Compares the agent's actual sequence of tool calls against expected sequences. Pinpoints *where* in the reasoning chain failure occurred. Three matching modes: exact match (strict ordering), in-order match (correct sequence, extra steps allowed), any-order match (all required steps present, order doesn't matter).

3. **Single step (white-box)**: Unit tests for agent reasoning. Tests each decision point in isolation. Validates search queries, API parameters, tool selections. Most expensive to build, most diagnostic when failures are subtle.

Most production systems combine all three. Level 1 catches regressions. Level 2 tells you where it broke. Level 3 tells you why.

## Prefer deterministic grading

Three tiers of grading, in order of preference:

1. **Code-based graders**: Use wherever possible. Unit test pass/fail, regex matching, JSON schema validation, exact string match. SWE-bench uses only this — tests pass or they don't. No ambiguity.

2. **LLM-as-judge**: For subjective or complex evaluations where code can't express the criteria. Three sub-patterns: score without reference (rubric only), score with reference (gold-standard comparison), pairwise comparison (judge picks better of two outputs). Treat the judge as a classifier — measure its precision and recall against human labels, not just its "accuracy." Watch for two well-documented failure modes: **position bias** (judges favor the first or last option in pairwise comparisons — mitigate by randomizing order and averaging) and **self-preference bias** (models rate their own outputs higher — use a different model family as judge than the one that generated the output).

3. **Human graders**: For calibration and edge cases. Use humans to validate that your automated graders agree with expert judgment, then rely on automation. Humans don't scale; they're for building trust in the automated pipeline.

Don't force an LLM eval where a regex would do. Every LLM judge adds cost, latency, and its own non-determinism.

## Binary scoring over scales

A 1-5 Likert scale introduces subjectivity between adjacent scores (what's the difference between a 3 and a 4?) and requires larger sample sizes to detect differences. Binary pass/fail forces clearer success criteria and is more statistically tractable.

If the task is too complex for a single binary check, decompose it into multiple binary checks. "Did the agent reference information not in the retrieved documents?" is a good eval. "Was the response good?" is not.

## Handle non-determinism or your evals are noise

Agent performance is stochastic. Running one trial and treating the result as ground truth is the most common eval mistake.

- **Report SEM (Standard Error of the Mean)** alongside every eval score. 95% confidence interval = mean +/- 1.96 x SEM.
- **Clustered standard errors** when questions are grouped (e.g., multiple questions per document). Naive SE can be 3x too optimistic.
- **Paired-difference analysis** for comparing two agents: report mean differences, standard errors, confidence intervals, and correlations.
- **Pass@k**: Measures probability that at least 1 of k attempts succeeds. UNDERWRITE found ~20% degradation from pass@1 to pass@4 — models that get it right once don't get it right consistently. Single-run evals systematically overstate real-world reliability.

## Track cost and latency as first-class metrics

Every eval run should automatically produce cost/latency/token-usage alongside accuracy. When comparing agents or configurations, cost-efficiency ratios (accuracy per dollar) matter as much as raw accuracy. An agent that scores 95% at $0.50/task may be worse than one scoring 90% at $0.02/task depending on your use case.

LangChain's eval framework formalizes this with four efficiency metrics alongside correctness: step ratio (observed/ideal steps), tool call ratio, latency ratio, solve rate. All measured against "ideal trajectory" baselines.

## What to evaluate for agent-specific behaviors

Beyond correctness, agent evals should cover:

- **Tool selection correctness**: Did the agent pick the right tools?
- **Argument validity**: Were tool arguments correct and aligned to the task?
- **Invocation order**: Were tools called in a sensible sequence?
- **Efficiency**: Did the agent make redundant calls or use unnecessary tools?
- **Recovery rate**: When tool calls failed, did the agent recover? UNDERWRITE found tool error recovery rate has moderate-to-strong correlation with correctness, while raw error rate has only weak correlation. Build agents that retry well, not agents that never fail.
- **Context anxiety**: Devin found that models track remaining context tokens and prematurely wrap up tasks. This is invisible in benchmarks but devastating in production.
- **RL behavioral debt**: Benchmark improvements can introduce UX regressions (overthinking, excessive verification, verbose output). Evaluate the user experience, not just the score.

## Dogfooding traces are the best eval source

Production-derived evals beat synthetic benchmarks for finding real failures. LangChain's pipeline: dogfooding traces -> failure pattern identification -> repeatable test cases -> tagged by capability. External benchmarks supplement but don't replace this.

CursorBench sources tasks from real developer sessions rather than synthetic generation. The result is evals that actually predict production performance.

Ground synthetic data in real logs. Synthetic test data untethered from production is one of Hamel Husain's five eval pitfalls. The others: generic metrics (use application-specific like "Calendar Scheduling Failure," not ROUGE), unverified LLM judges, contractor labeling instead of domain experts, and over-automation without exploratory analysis first.

## The retrieval-action gap

Giving an agent the right documents is necessary but nowhere near sufficient. Sierra's tau3-Bench found that even with perfect retrieval, agents only achieve ~40% success on knowledge-grounded tasks. The bottleneck is understanding documents, drawing correct conclusions, and executing required actions — not finding information. Eval retrieval and action separately; a failure at "action given perfect context" is a fundamentally different problem than a retrieval failure.

## Start small, iterate

Start with 20-50 test cases drawn from real failures. Early changes have large effect sizes, so small sample sizes suffice. Don't over-invest in dataset size before you have signal.

The progression: manual spot-checks -> 20-50 targeted cases -> capability-tagged suite -> production-derived continuous eval. Most teams should be at stage 2 before they start building infrastructure for stage 4.

## Architecture: separate agents from tasks

The defining architectural decision in an eval system. Tasks are data + grading logic. Agents are execution logic. Keep them orthogonal.

Inspect AI exemplifies this: a Task binds a Dataset (test cases with inputs and targets), a Solver (how the model generates output), and a Scorer (grading logic) into a runnable unit. You swap models via configuration, not code changes. SWE-bench does the same — task instances are Docker images; any agent connects via bash.

The pattern: define tasks as data (YAML, JSON, or typed Python objects), define graders as functions, and let the agent be a pluggable parameter.

## Sandbox by risk tier

Three tiers of isolation have emerged across frameworks:

1. **Container-level (Docker)**: Default for most evals. Each sample can get its own container. Cheap, fast, sufficient for most tasks.
2. **Orchestrator-level (Kubernetes)**: One pod per sample with auto-provisioning/teardown. For running evals at scale.
3. **VM-level (Proxmox, Firecracker)**: For high-risk evaluations (cybersecurity, capability evals). Dedicated kernels per workload. Inspect AI supports this natively.

Zero-trust networking: block all outbound by default, whitelist only required endpoints.

## Make evals composable

Patterns that work for building eval systems that last:

- **Registry pattern**: All components (models, tasks, metrics) registered via a uniform system with lazy loading. EleutherAI's harness does this well.
- **Plugin/extension APIs**: Sandbox providers, model providers, scorers all pluggable. Inspect AI's extension API is the cleanest abstraction.
- **Declarative configs**: Define evals as YAML/JSON data, not code. Enables sharing, version control, and exact replication.
- **Version everything**: Track which model version, prompt version, and dataset version produced each result. Without this, you can't reproduce or compare.

## Inject failures to test failure handling

Martin Fowler poses this as ["Chaos Monkey for AI"](https://martinfowler.com/fragments/2026-05-14.html): deliberately introduce hallucinated or corrupted outputs in your test harness to evaluate whether your system detects and recovers from them. Most agent evals measure happy-path correctness; very few measure whether the surrounding system catches the model being wrong.

Failure injections to consider:
- Plausible-but-false tool outputs (fake test results, fake file contents)
- Confident wrong answers in retrieval (correct schema, wrong values)
- Plausibly malformed structured outputs (valid JSON, wrong types)
- Tools that succeed silently while doing nothing

The system passes if downstream verification or human review catches the injected failure. The system fails if the agent integrates the false output into its next action without protest. This catches the failure mode James Shore warns about — code shipping because no human ever actually looked at it.

## Framework landscape

Not exhaustive, but these are the ones worth knowing:

| Framework | Best for | Notes |
|-----------|----------|-------|
| **Inspect AI** (UK AISI) | Comprehensive agent evals | Composable Task/Solver/Scorer primitives, tiered sandboxing, multi-model. METR transitioning from Vivaria to this. The current leader. |
| **EleutherAI Harness** | Standard LLM benchmarks | Backend for HuggingFace leaderboard. Registry pattern. Not agent-specific. |
| **DeepEval** | Pytest-style agent testing | 50+ metrics, trajectory analysis, synthetic data generation. |
| **Promptfoo** | CLI-first eval + red teaming | YAML configs, 50+ providers, CI/CD integration. Now part of OpenAI. |
| **Pydantic Evals** | Type-safe, code-first | YAML/JSON serialization, OpenTelemetry traces. New but well-designed. |
| **Langfuse** | Open source tracing + eval | Self-hostable, agent execution graphs, LLM-as-judge. |
| **LangSmith** | Full-lifecycle observability | Cloud platform, not fully open source. Strong trajectory evaluation. |
| **SWE-bench** | Coding agent benchmarks | Gold standard for coding evals. Binary pass/fail via test suites. |

## Anti-patterns

Things I've seen go wrong:

- **Evaluating only final output**: Misses compounding errors in agent trajectories. The response may look fine while the agent took a catastrophic path that happened to land correctly.
- **"Rate the quality 1-5"**: Tells you nothing actionable. Decompose into specific, testable assertions.
- **Overfitting to the eval set**: Repeatedly optimizing against the same test cases improves scores without improving production performance. Rotate and expand.
- **One trial per task**: Agent performance is stochastic. Always aggregate across multiple runs.
- **LLM judges where code checks suffice**: Adds cost, latency, and non-determinism unnecessarily.
- **Ignoring efficiency metrics**: An agent that takes 47 steps to do what should take 5 has a problem, even if it gets the right answer.
- **Benchmarks as product metrics**: Devin found that RL training improved benchmarks while degrading UX (overthinking, excessive verification). Production metrics and benchmark metrics can diverge. Measure both.
