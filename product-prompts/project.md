# SYSTEM SPECIFICATION: VISUAL MULTI-AGENT SANDBOXED WORKSPACE (FULL PRD)

# PRODUCT VISION

The goal of this platform is not to create AI agents.

The goal is to allow anyone—from solo founders to Fortune 500 companies—to build, manage, and grow their own AI organization.

Instead of chatting with one AI assistant, users build an entire company composed of specialized AI employees that collaborate, learn, execute work, and improve over time.

Each company has:

• A mission
• A culture
• Departments
• Managers
• Employees
• Shared organizational memory
• Projects
• Workspaces
• Tools
• Permissions

Agents are persistent digital employees.

Projects are real work.

The company evolves over time instead of resetting every conversation.

The product should make users genuinely feel like they own and manage a living organization rather than operating isolated AI chatbots.

Every feature should reinforce this experience.

---

## 1. PRODUCT OVERVIEW
A hybrid cloud/local multi-agent workspace combining a **Vercel-hosted Web SaaS UI** with a **zero-friction local engine daemon** running natively on the user's computer. Users build, manage, and monitor real-world AI agent organizations operating inside a **Native OS Kernel-Sandboxed Workspace** per project folder.

---

## 2. SYSTEM & DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│ MOBILE PHONE (On-The-Go)      DESKTOP BROWSER (Anywhere)    │
│  - Focused Workspace Chat      - Full PM Tools & Org Canvas │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTTPS / Cloud Auth           │ HTTPS / Cloud Auth
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 VERCEL CLOUD WEB APP & DB                   │
│   (Next.js 14 App Router + Cloud PostgreSQL / Supabase)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Secure WSS Relay Tunnel
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 USER'S LOCAL COMPUTER                       │
│ (Daemon + Zero-Friction Native OS Sandbox + AST Indexer)    │
└──────────────────────────────┴──────────────────────────────┘
```

1. **Vercel Cloud Web UI**: Hosted globally on Vercel (`https://app.cosmos.ai`). Accessible from desktop or mobile phone anywhere in the world.
2. **Bring Your Own Keys (BYOK) & Per-Agent Model Assignment**:
   - Users insert their own API keys (OpenAI, Anthropic, Gemini, DeepSeek, or local Ollama endpoint).
   - Keys are encrypted locally in `~/.cosmos/vault.json`.
   - **Per-Agent Model Selection**: Each agent can be configured with a specific LLM model (e.g. `Dev-Bot` ➔ `claude-3-5-sonnet`, `Alex` ➔ `gpt-4o`, `QA-Guard` ➔ `gemini-2.5-flash`).
3. **Local Engine Daemon & Secure WSS Tunnel**:
   - Outbound WebSocket tunnel connects the daemon to the Vercel cloud relay server behind NAT/firewalls.
   - `Engine Online` / `Agents Offline` live telemetry.

---

## 3. HERMES-INSPIRED COSMOS AGENT BACKBONE FRAMEWORK

The core agent framework powers all digital employees across the organization:

1. **Self-Learning & Skill Persistence (`SKILL.md`)**:
   - After completing execution tasks, agents synthesize their workflow steps into markdown skill recipes stored in `~/.cosmos/agents/<agent_name>/`.
   - On subsequent tasks, active `SKILL.md` files are injected into prompt context.
2. **Token-Utilization Awareness**:
   - Integrates the Tree-sitter AST syntax parser (`graph.json`) to supply precise function/class context instead of raw file dumps, reducing token costs by up to 70%.
3. **Autonomous Project Management Tool Integration**:
   - Agents autonomously create, update, and close Kanban tickets, add subtasks, adjust point estimates, and post progress comments directly to the website PM suite.
4. **Inter-Agent Collaboration & 5-Message Spiral Circuit Breaker**:
   - Agents collaborate across chains of command (e.g. Manager ➔ Coder ➔ QA).
   - **Infinite Loop Safeguard**: If inter-agent communication reaches **5 turns without human intervention**, execution automatically pauses and notifies the user in the UI: *"Agent discussion limit reached (5 turns). Review thread to approve or guide next step."*

---

## 4. FRONTEND LAYOUT & NAVIGATION
Collapsible primary left sidebar with 5 primary views:

1. **Workspace**: Slack/Teams enterprise communication hub (channels, DMs, work artifact cards, message reactions).
2. **Files**: Internal company memory folder tree (codebases, PRDs, QA reports, file preview modal).
3. **Project Management**: Enterprise suite featuring **Board** (Kanban columns with SVG status icons & multi-filters), **Table / List** (dense spreadsheet view), **Agent Workload** (capacity allocation meters per agent), **Timeline / Gantt**, and **Calendar**.
4. **AI Directory**: Talent repository card grid (`SOUL.md` profiles, `SKILL.md` learned workflows, per-agent model assignment selector).
5. **Org Hierarchy**: Interactive React Flow command canvas (`@xyflow/react`).

---

## 5. ZERO-FRICTION NATIVE OS SANDBOX & GOVERNANCE
- **Native OS Kernel Sandbox**: macOS `sandbox-exec` / Windows AppContainer.
- **Report Mode**: Intercepts high-risk shell commands & file writes for human approval.
- **Model Context Protocol (MCP)**: `@modelcontextprotocol/sdk` (Google Workspace, Figma, Playwright visual QA).