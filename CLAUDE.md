# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A collection of opinionated notes on building AI agents. Not a code project — no build system, tests, or dependencies. Just markdown files capturing learnings from hands-on experience and key sources.

## Structure

- **README.md** — Table of contents
- **best-practices.md** — Current beliefs about what works (simple agents, bash, small action spaces, context engineering, verification over self-reporting)
- **patterns.md** — Architecture patterns (single agent, sequential, parallel, hierarchical, collaborative, evaluator-optimizer) with a decision framework
- **long-running-agents.md** — Multi-session agent patterns (initializer/coder split, progress files, feature lists, get-bearings ritual)
- **skills.md** — What makes agent skills effective (anti-rationalization, iron laws, trigger scoping, deterministic scripts, composable chains)
- **lessons-from-ralph.md** — Lessons from 4 versions of an autonomous coding agent (v1-v4 post-mortem)
- **sources.md** — Key sources with opinionated summaries of what was taken from each

## Editorial voice

These notes are first-person, opinionated, and concise. They state what works and what doesn't based on experience. They avoid hedging, generic advice, and academic tone. When editing or adding content, match this style: direct claims backed by specific experience or cited sources.

## Key themes across all files

- Simplicity wins (bash loops over orchestration frameworks, single agents over multi-agent)
- The progress file pattern is the most important innovation for multi-session agents
- Verification must be programmatic, not self-reported
- Context engineering (right info at right time) matters more than prompt wording
- Don't build task orchestration — the agent IS the orchestrator (but DO build safety constraints)
- Skills work when they defend against specific failure modes, not when they describe ideal workflows
