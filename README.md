# Must-b — Professional Autonomous AI Operating System

**Must-b** is a locally hosted, enterprise-grade autonomous AI agent platform. It transforms AI from a passive chatbot into an active digital workforce that operates directly on your machine — planning, executing, and iterating without manual intervention.

**Website:** [must-b.com](https://must-b.com) | **Documentation:** [must-b.com/docs](https://must-b.com/docs)

---

## Features

**Autonomous Agent Swarms**
Must-b decomposes high-level goals into parallel execution graphs and spawns specialized sub-agents (PM, Frontend, Backend, QA) that coordinate natively. You give the goal — Must-b handles the rest.

**GhostGuard — System Resource Protection**
Built-in RAM and CPU watchdog. GhostGuard continuously monitors system health, enforces per-tool resource limits, and automatically throttles or defers heavy operations when memory pressure is high — keeping your machine stable during long-running tasks.

**Infinite LTM Memory with Context Compaction**
Must-b never forgets. Episodic and semantic memories are stored in a local vector database. When memory grows large, GhostGuard triggers automatic compaction — old entries are summarized and compressed into semantic nodes rather than deleted. Full context is always available via TF-IDF cosine search.

**NightOwl — Background Execution**
Schedule tasks to run silently in the background. Must-b can execute multi-step workflows overnight and deliver results by morning with no supervision required.

**8-Language Interface**
Full UI and agent language support for English, Turkish, German, French, Spanish, Portuguese, Japanese, and Chinese.

**57+ Embedded Skills**
Ships with a production-ready skill library covering terminal automation, filesystem management, web search, browser control, code analysis, GitHub operations, MetaTrader 5 finance bridge, and more.

---

## Supported Platforms

| Platform | Support |
|---|---|
| Linux (x64) | Full |
| macOS (x64 / Apple Silicon) | Full |
| Windows (PowerShell / x64) | Full |

**Requirements:** Node.js >= 20 and at least one LLM provider API key (OpenRouter, Anthropic, OpenAI, Gemini, Groq, Ollama, and 15+ others supported).

---

## Installation

**Global install via npm (recommended)**

```bash
npm install -g @must-b/must-b@latest
```

**Standalone Installation (No NPM Required)**

Windows (PowerShell):

```powershell
irm https://must-b.com/install.ps1 | iex
must-b gateway
```

macOS / Linux (Bash):

```bash
curl -fsSL https://must-b.com/install.sh | bash
must-b gateway
```

Pre-built binaries and release archives are also available at [must-b.com](https://must-b.com).

---

## CLI Reference

```bash
must-b                          # Start the Cognitive OS & Dashboard
must-b --version                # Check current version
must-b -v                       # Check current version (shorthand)
must-b doctor                   # Run system health check and auto-repair
npm uninstall -g @must-b/must-b # Completely remove Must-b from the system
```

On first launch, Must-b runs an interactive setup wizard to configure your LLM provider and workspace.

---

## License

Proprietary — © 2026 Must-b Inc. All rights reserved.

This software is distributed as a compiled binary. Reverse engineering, decompilation, or redistribution of any kind is strictly prohibited. See [must-b.com/docs](https://must-b.com/docs) for the full license terms.
