# Writing Effective Skills

What makes a skill actually work vs. being ignored or misapplied. Based on studying production skills across Claude Code (Superpowers, Trail of Bits, Anthropic's official plugins), Codex (babysit-pr, skill-creator, curated catalog), OpenClaw (55 bundled skills, 13,700+ community), and Cursor/Cline rule systems (BMAD-METHOD, RIPER-5, steipete/agent-rules).

The skill format varies by framework (SKILL.md with YAML frontmatter for Claude Code/Codex/OpenClaw, .mdc files for Cursor, .clinerules for Cline), but the patterns that make skills effective are framework-agnostic.

## Skills vs CLAUDE.md

Skills handle reusable expertise; CLAUDE.md handles project conventions. Anthropic flags this split as one teams routinely get wrong: domain knowledge ("here's how migrations work in our system") ends up in CLAUDE.md where it loads on every session whether the task touches migrations or not, while project conventions ("we use snake_case for SQL columns") end up scattered across skills.

The split has a mechanical justification. CLAUDE.md is always loaded; skills are conditionally loaded. Anything universal to the project pays its context cost once and belongs in CLAUDE.md. Anything that only matters when working in a specific area should be a skill, scoped so it activates only there. Treating these as the same primitive is how teams end up with a 12KB always-loaded prompt that contains domain knowledge for code they'll touch twice a year.

## Anti-rationalization tables

The single most effective technique for preventing known LLM failure modes. A table mapping specific excuses the model will generate to the correct behavior:

| Rationalization | Correct Response |
|---|---|
| "Just try changing X and see if it works" | STOP. Return to root cause investigation. |
| "I'll write tests after the implementation" | Tests passing immediately prove nothing. Write the failing test first. |
| "This is a simple change, no need for the full process" | Simple changes are where most bugs hide. Follow the process. |
| "Keep the broken code as reference" | You'll adapt it instead of rewriting. Delete it. |
| "I'm confident this works based on reading the code" | NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE. Run it. |
| "You're absolutely right, great point!" | NEVER use performative agreement. State your technical assessment. |

Superpowers pioneered this pattern — every skill includes a rationalization table targeting the specific failure modes relevant to that skill's domain. Trail of Bits' security skills do the same thing ("Rationalizations to Reject" sections). These work because they pre-empt the exact reasoning chains the model will follow. Instead of hoping the model won't rationalize, you intercept the rationalization explicitly.

The discovery that makes this work: LLMs generate rationalizations in predictable patterns. "I'll do it later," "this case is different," "that's probably fine" — the same excuses appear across models, across frameworks, across tasks. You can enumerate them.

## Iron Laws

Absolute constraints stated as non-negotiable rules. Not guidelines, not recommendations — laws.

- "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST." (Superpowers systematic-debugging)
- "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST." (Superpowers TDD)
- "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE." (Superpowers verification)
- "NEVER proceed to next task until current task is complete AND tests pass." (BMAD-METHOD)
- "If ANY issue is found requiring deviation from the plan, IMMEDIATELY return to PLAN mode." (RIPER-5)

These work better than graduated guidance because LLMs are good at reasoning their way around soft constraints. "You should generally run tests before claiming completion" leaves room for "but in this case the change is trivial." "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" does not.

Superpowers' verification-before-completion skill operationalizes this as a gate function: (1) identify the command that proves the claim, (2) RUN it fresh, (3) READ the full output, (4) VERIFY it confirms the claim, (5) ONLY THEN make the claim. Forbids "should," "probably," "seems to." Forbids expressing satisfaction before verification ("Great!", "Perfect!", "Done!"). Drawn from 24 documented failure cases where trust was broken.

## Suppression rules so skills don't become spam

Iron Laws defend against the model rationalizing its way out of the right behavior. Suppression rules defend against the *user* rationalizing their way around the skill — by ignoring it once it starts feeling like nagging.

DrCatHicks' [learning-opportunities skill](https://github.com/DrCatHicks/learning-opportunities) (offers 10–15 minute reflection exercises after architectural changes) ships with two suppression conditions baked in:
- Won't suggest if the user declined an exercise this session
- Won't suggest after two completed exercises in a session

The mechanism is structural, not polite. A skill that fires every time it could fire trains the user to dismiss it without reading. A skill with quotas stays meaningful because each invocation costs the skill its next opportunity. This is the user-side mirror of degrees-of-freedom calibration: the more the skill imposes on user attention, the more it should impose on itself.

The general form: any skill that interrupts the user (suggests an exercise, requires a confirmation, asks a question) should declare its own ceiling — per-session, per-day, per-decline. Without one, the skill optimizes for its own activation rate at the user's expense.

## Trigger scoping

The `description` field in a skill is a routing signal, not documentation. It determines when the skill activates. Getting this wrong causes two failures: false positives (skill triggers when it shouldn't) and false negatives (skill doesn't trigger when it should).

Superpowers discovered a critical subtlety: when skill descriptions summarize the workflow, the model follows the description instead of reading the full skill body. The model sees "Step 1: brainstorm approaches, Step 2: evaluate tradeoffs, Step 3: write spec" in the description and executes that abbreviated version rather than loading and following the detailed SKILL.md. They call this "Claude Search Optimization" (CSO) — descriptions must say WHEN to trigger (conditions, contexts, user intent), NEVER WHAT the skill does (workflow, steps, outputs).

Good: "Use when the user wants to design a solution before implementing. Trigger on requests for architecture, design, or approach discussion. Do NOT trigger for direct implementation requests, bug fixes, or questions."

Bad: "Brainstorming skill that explores context, asks clarifying questions, proposes 2-3 approaches with tradeoffs, writes a spec document, and runs a review loop."

Negative examples ("do NOT trigger when...") are critical. Glean measured a 20% accuracy drop when they removed negative examples from skill descriptions. OpenAI's curated skills are very specific: "Trigger only when the user explicitly requests security best practices guidance. Do not trigger for general code review, debugging, or non-security tasks."

## Degrees of freedom

Match instruction specificity to task fragility. Not all instructions should be equally prescriptive.

**High freedom** (text guidance, multiple valid approaches) — Use for creative tasks, design decisions, flexible implementations. The skill describes goals and constraints but lets the agent choose the approach. Example: "Create a responsive layout that works on mobile and desktop" without specifying CSS framework or layout technique.

**Medium freedom** (pseudocode, parameterized patterns) — Use when a preferred pattern exists but variation is acceptable. The skill provides a template or algorithm but allows adaptation. Example: "Follow this error handling pattern, adjusting for your specific error types."

**Low freedom** (specific scripts, few parameters) — Use for fragile, error-prone, or security-sensitive operations. The skill provides tested, deterministic code that the agent executes rather than reimplements. Example: Codex's babysit-pr ships a 600-line Python script for all GitHub API interaction; the agent reads its structured JSON output rather than making raw API calls.

The principle: the more ways something can go wrong, the more constrained the skill should be. Read-only analysis gets high freedom. Sending messages to users gets low freedom. The OpenClaw skill-creator teaches this explicitly as "degrees of freedom calibration."

## Deterministic scripts for fragile operations

Every production skill that touches external APIs, sends messages, modifies infrastructure, or handles credentials wraps those operations in tested scripts rather than letting the agent write ad-hoc code.

Codex's babysit-pr (`scripts/gh_pr_watch.py`, ~600 lines) handles all GitHub API interaction: polling CI status, classifying failures (branch-related vs. flaky), tracking retry budgets per SHA in a persistent JSON file, implementing exponential backoff (1m → 2m → 4m → ... → 1h cap), and producing structured JSON output the agent interprets. The agent never makes raw `gh` API calls — it reads the script's output and decides what to do.

Codex's gh-fix-ci (`scripts/inspect_pr_checks.py`, ~350 lines) handles field drift gracefully — when `gh pr checks` changes its output format between versions, the script parses the error message for available field names and retries with fallbacks. An agent writing ad-hoc code would just fail.

OpenClaw's openai-image-gen ships a tested `gen.py` for all API interaction. The agent provides parameters; the script handles authentication, rate limits, error recovery, and output formatting.

The pattern: scripts are the low-freedom end of degrees of freedom. When an operation is fragile, tested code beats agent improvisation. The agent's job is to decide WHAT to do; the script handles HOW.

## Composable skill chains

Skills that reference each other create a methodology, not a collection of tips.

Superpowers implements a complete development lifecycle as a chain:

1. **brainstorming** — Explore context, ask clarifying questions, propose 2-3 approaches with tradeoffs, write spec document, run spec review loop via subagent. Hard gate: "Do NOT invoke any implementation skill or write any code until design is approved."
2. **writing-plans** — Create bite-sized implementation plans for "an engineer with zero context and questionable taste." Each task includes exact file paths, complete code snippets, exact test commands with expected output, and explicit TDD steps. Plans reviewed by a plan-document-reviewer subagent.
3. **subagent-driven-development** — Execute plans by dispatching a fresh subagent per task with two-stage review: spec compliance first, code quality second. The controller reads the full plan and provides exactly the context each subagent needs.
4. **finishing-a-development-branch** — Verify tests, present exactly 4 completion options (merge, PR, keep, discard), execute chosen option.

Each skill gates the next. Brainstorming blocks implementation. Plans block execution. The chain enforces a discipline that individual skills can't — you can't skip design because the implementation skill requires a spec that only brainstorming produces.

BMAD-METHOD does the same thing with phases: Analysis (product briefs, research) → Planning (PRD, UX, stories) → Solutioning (architecture, readiness checks) → Implementation (dev stories with TDD, code review, QA). Each phase's outputs are inputs to the next.

The key insight: composable chains solve the problem of agents skipping steps. A single skill that says "first design, then plan, then implement" gets compressed. Separate skills with explicit handoff gates enforce the sequence structurally.

## Context isolation for subagents

When dispatching subagents, give each one exactly the context it needs — nothing more. Subagents should never inherit the parent's session history.

Superpowers' subagent-driven-development implements this rigorously. The controller reads the plan once and extracts all tasks with their full text. Each subagent receives:
- The specific task description (copied verbatim from the plan, not summarized)
- Relevant file contents (only what that task touches)
- Project conventions (from a shared reference, not the controller's memory)
- Nothing else — no conversation history, no other tasks, no controller opinions

Rules for what crosses the isolation boundary:
- "Pass raw artifacts, not your conclusions" — send the actual file content, not your summary of it
- "Avoid showing expected answers" — don't tell the subagent what you think the solution is
- "Clean up subagents' artifacts between iterations" — prevent context bleed between tasks

This prevents context pollution (the subagent reasons about the current task, not 50 previous tasks) and reduces the telephone game effect (information degradation across handoffs). It also makes subagent work embarrassingly parallel — tasks with no shared context can run simultaneously.

The four subagent statuses define clear escalation: DONE (merge and continue), DONE_WITH_CONCERNS (review concerns, decide), NEEDS_CONTEXT (controller provides missing info), BLOCKED (escalate to human). No ambiguity about what happens next.

## Promote recurring patterns from skills into rules

As your skill collection grows, cross-cutting patterns emerge — the same principle appearing in 3+ skills. These should be promoted into rules (always-loaded, project-wide constraints) rather than staying buried in individual skills.

Everything Claude Code's "rules-distill" workflow: scan all installed skills, extract principles that appear in 2+ skills, propose them as rule candidates with explicit justification. An anti-abstraction safeguard prevents over-promotion — a pattern must be genuinely cross-cutting, not just similar-sounding across two niche skills.

This is the skill equivalent of refactoring: when you see the same pattern repeated, extract it. But with an important constraint — only promote what's truly universal. A rule that says "validate inputs at boundaries" helps everywhere. A rule that says "use BM25 for search" is too specific. The test: would this rule improve an agent's behavior in a project that uses none of your current skills?

## When not to write a skill

The default reflex is to add a skill for every recurring pain point. Resist it. James Pritchard's [critique](https://martinfowler.com/fragments/2026-05-14.html), via Fowler's fragments: many agent failures are better fixed by architecture or code patterns than by markdown. If the agent keeps misusing an API, a wrapper that makes misuse impossible is stronger than a skill that says "don't misuse it." If the agent keeps writing similar files, a generator or template removes the work from the agent's hands entirely. Skills are the right tool when the failure is in judgment or sequencing — choosing the wrong approach, skipping a verification step, writing before planning. They are the wrong tool when the failure is structural and code can foreclose it.

The cost of getting this wrong is real: skill libraries grow until they hit the phase-transition cliff around 50–100 skills where selection accuracy collapses. Every skill that should have been a code change competes for the same selection budget as the ones that genuinely require model judgment.

## What separates production skills from demos

After studying hundreds of skills across platforms, the dividing line is clear:

**Production skills** have anti-rationalization defenses, verification gates, deterministic scripts for fragile operations, tight trigger scoping with negative examples, and explicit stop/escalation conditions. They encode expert knowledge about failure modes — not just what to do, but what the agent will try to do wrong and how to intercept it.

**Demo skills** read like documentation. They describe a workflow without defending against the ways the agent will deviate from it. They have broad trigger descriptions that cause false activations. They let the agent improvise operations that should be scripted. They say "verify your work" without operationalizing what verification means.

The difference is not length or complexity. Superpowers' verification-before-completion skill is short. But it's specific about the gate function, it bans specific words ("should," "probably"), it bans specific behaviors (expressing satisfaction before evidence), and it was built from 24 documented failures. That's a skill written by someone who watched an agent fail and encoded the fix.
