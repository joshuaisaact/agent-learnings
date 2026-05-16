# Research Directions

Forward-looking research that challenges current tactical practice. Papers that aren't applicable today — they require training new models, modified architectures, or specialized infrastructure — but point at where common patterns may eventually be replaced.

The discipline: stay opinionated about implications. Don't just summarize abstracts. Each entry says what current pattern this would replace, the core mechanism, the result that matters, why a practitioner should care, and when it might actually be usable.

**A pattern runs through these entries:** scaffolding currently built in the harness layer is being absorbed into trained model capabilities. Memory, deliberation, orchestration — all are showing up as research targets with mechanisms that don't need an external wrapper. The implications for what a harness builder should and shouldn't invest in are developed in [harness-vs-model.md](harness-vs-model.md). The entries below are the evidence.

---

## Memory architectures

### δ-mem: a compact online state replaces textual memory
[Lei, Zhang, et al., May 2026](https://arxiv.org/abs/2605.12357)

**Current pattern this challenges:** Almost everything in this repo about memory — progress files, CLAUDE.md, session log as external context object, get-bearings ritual, compaction, RAG over conversation history. All of it is scaffolding that exists because today's models lack effective non-textual memory.

**Core mechanism:** An 8×8 matrix maintained alongside a frozen Transformer backbone, updated by delta-rule learning (online SGD on a key-value association loss) as tokens are processed. At inference, the current input queries the matrix and produces low-rank corrections to the attention computation — not retrieved text, not retrieved embeddings, but direct steering signals injected into the forward pass. Three writing granularities: per-token (TSW), per-message averaged (SSW), and multi-state with parallel sub-matrices (MSW).

**Result that matters:** With explicit context *removed* — the model never sees the source content during the question turn — δ-mem still scores 6.48% EM on HotpotQA vs 0.08% for the no-context baseline. An 8×8 matrix encoded enough signal from prior interactions to recover meaningful answers without any text replay. Against textual memory baselines on Qwen3-4B-Instruct (BM25 RAG, MemoryBank, LLMLingua-2), δ-mem is the only memory approach that *improves* the unaugmented backbone (46.79% → 51.66%); every textual baseline degrades it (BM25 RAG: 44.56%, MemoryBank: 43.88%, LLMLingua-2: 42.96%) because retrieval noise crowds out useful context.

**Why care:** The repo's most innovative memory patterns are downstream of a model-level deficiency, not properties of long-horizon work. The progress file exists because a fresh session can't remember the previous one. CLAUDE.md exists because the model can't accumulate project knowledge across sessions. If something like δ-mem ships in production models, much of that scaffolding becomes legacy. Worth knowing now what you'd stop building later — and worth not over-investing in patterns that solve a problem the model layer will eventually absorb.

**When applicable:** Not yet for general practitioners. Requires training the memory module on your domain (4.87M params, 0.12% of a 4B backbone — small, but a training run). Paper only validates up to ~8K-token write budgets, so real long-horizon agent traces (100K+) are untested. Decoding is slower than vanilla because each step reads and writes the state; memory footprint stays flat. The likely path to practitioner-relevance is a frontier-model release that ships something like this in the architecture by default.

### Contextual Agentic Memory is a Memo, Not True Memory
[Xu, Dai, Zhang, April 2026](https://arxiv.org/abs/2604.27707)

**Current pattern this challenges:** Vector stores, RAG over conversation history, scratchpads, "memory bank" architectures. Even the repo's progress file pattern. Anything that treats memory as "search a database of past notes."

**Core mechanism:** Position paper grounded in Complementary Learning Systems (CLS) theory from neuroscience. Biological memory pairs fast hippocampal exemplar storage (lookup) with slow neocortical weight consolidation (generalization). Current agentic memory implements only the lookup half. Genuine memory, the authors argue, requires weight-level learning — not just retrieval.

**Result that matters:** No empirical results — this is a position paper. The contribution is naming three failure modes that follow structurally from lookup-only memory: (1) indefinite note accumulation without expertise development, (2) a provable generalization ceiling on compositionally novel tasks that no amount of better retrieval can break, (3) persistent vulnerability to memory poisoning across sessions.

**Why care:** This is the theoretical companion to δ-mem's empirical result. δ-mem shows a specific mechanism that works; this paper explains why retrieval-only approaches *can't* work for genuine memory, no matter how good the retrieval gets. If you're building memory architectures and they're "lookup with more sophistication," you inherit the ceiling. The compositional-novelty failure mode is the one that'll bite hardest in practice — agents that handle 100 routine cases fine but can't combine them into a 101st new case.

**When applicable:** Not yet — no implementation here, just a framing. But the practical takeaway lands today: be skeptical of memory systems that promise to scale forever via retrieval quality. They have a ceiling. Build textual memory expecting it to be replaced, not as a permanent foundation.

---

## Skills and orchestration absorption

### HeavySkill: deliberation as a trained skill replaces Best-of-N
[Wang, Guo, Chen et al., May 2026](https://arxiv.org/abs/2605.02396)

**Current pattern this challenges:** Best-of-N orchestration in the harness layer — sampling multiple model responses and picking, voting, or aggregating. More broadly, any "harness assembles deliberation" pattern: plan-then-act loops, retry-on-failure-and-resample, self-consistency sampling.

**Core mechanism:** A two-stage skill — parallel reasoning, then summarization — trained directly into the model via RLVR. Deliberation becomes a learnable model capability rather than something the harness orchestrates via repeated sampling.

**Result that matters:** Internalized heavy thinking consistently outperforms Best-of-N strategies. Stronger backbones approach Pass@N performance — they capture most of the gains of running N independent samples without paying the N× compute. The harness doesn't decide *whether* to deliberate; the model does.

**Why care:** A non-trivial fraction of agent harnesses today are wrappers around "sample more, pick best." If models ship with trained heavy-thinking skills, that wrapping becomes dead weight — slower, more expensive, and worse than just calling the model once with reasoning enabled. Don't double down on Best-of-N orchestration.

**When applicable:** Partially today. Extended-thinking modes in current frontier models (Claude's reasoning, GPT's deliberation) are the early version of this. Prefer single deep-thinking calls over wide sampling when the model supports it. Full instances of HeavySkill-style training will likely land in the next model release cycle.

---

### Conductor (Sakana AI): coordination is a learned policy, not a designed architecture
[Nielsen, Cetin, Schwendeman et al., ICLR 2026](https://arxiv.org/abs/2512.04388)

**Current pattern this challenges:** Manually designed multi-agent orchestration — hierarchical/supervisory patterns, sequential workflows, hand-crafted handoff prompts, role-based decomposition. Everything in `patterns.md` that describes "how to structure work across multiple agents."

**Core mechanism:** A 7B "Conductor" model trained via RL on two simultaneous objectives: designing the communication topology between worker agents (which agent talks to which) and generating specialized prompts for each worker. Adapts at inference to arbitrary worker pools — different model providers, different specializations — and can recursively use itself as a worker. Trained via randomized agent pools to generalize across configurations.

**Result that matters:** State-of-the-art performance on LiveCodeBench and GPQA-Diamond. Gains exceed any individual worker model in the pool. The orchestration policy is learned from data, not configured by a human.

**Why care:** Hand-crafted multi-agent systems are competing with learned orchestrators. The design work that goes into hierarchical agent systems today — who handles what, what prompts each receives, who talks to whom — is becoming the model's job. The harness pattern that survives is providing a pool of capabilities with clear interfaces, plus observability for what the orchestrator decides. Designing topology by hand is becoming the equivalent of writing assembly when a compiler is available.

**When applicable:** Conductor itself isn't drop-in — it required training a 7B specifically as orchestrator. But the design implication for harnesses you build today is immediate: stop investing in elaborate topology configuration; invest in capability boundaries, permissions, and observability. The orchestrator will be a model.

---
