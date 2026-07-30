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
2. **Cloud Auth & Database**: Cloud database (Supabase / PostgreSQL) persists user accounts, organizations, channel message history, Kanban tickets, agent profiles, and file metadata.
3. **Local Engine Daemon & Secure WSS Tunnel**:
   - Local daemon runs on the user's computer (`packages/daemon`).
   - Outbound WebSocket tunnel connects the daemon to the Vercel cloud relay server behind NAT/firewalls.
   - **Online / Offline Telemetry**:
     - `Engine Online`: Local PC is running; real-time native sandbox code execution and terminal streams active.
     - `Agents Offline`: Local PC is offline/sleeping; cloud DB still provides full access to read chat history, project files, and ticket boards.
4. **Mobile Phone Optimization (< 768px Viewports)**:
   - On mobile devices, complex desktop interfaces (Kanban boards, Gantt timelines, React Flow Org canvases) automatically collapse into a focused **Mobile Workspace Chat Hub**.
   - Mobile users can chat 1:1 or in group channels with agents and receive real-time push notifications for one-tap **Report Mode** approvals.

---

## 3. FRONTEND LAYOUT & NAVIGATION
Collapsible primary left sidebar with 5 primary views + bottom status:

- **Navigation Items**:
  1. **Workspace**: Slack/Teams enterprise communication hub (channels, DMs, rich work artifact cards, message reactions).
  2. **Files**: Internal company memory folder tree (codebases, PRDs, QA reports, file preview modal).
  3. **Project Management**: Enterprise suite featuring **Board** (Kanban columns with SVG status icons & multi-filters), **Table / List** (dense spreadsheet view), **Agent Workload** (capacity allocation meters per agent), **Timeline / Gantt**, and **Calendar**.
  4. **AI Directory**: Talent repository card grid (`SOUL.md` profiles, `SKILL.md` learned workflows).
  5. **Org Hierarchy**: Interactive React Flow command canvas (`@xyflow/react`).
- **Bottom Status**: `Engine Online / Agents Offline` daemon WebSocket connection indicator.

---

## 4. ZERO-FRICTION NATIVE OS SANDBOX & GOVERNANCE

### 1. Zero-Friction Native Kernel Sandbox (No Docker Required)
- **Eliminates Docker Friction**: Users do **NOT** need to install or run Docker Desktop.
- **Native Kernel Policies**:
  - **macOS**: `sandbox-exec` / Apple Seatbelt framework.
  - **Windows**: Windows AppContainer & Job Objects.
  - **Linux**: `bwrap` (Bubblewrap) / `seccomp`.
- **Strict Directory Scoping**: Kernel security policies strictly constrain agent file access to the designated `/my-project` directory, completely blocking access to `~/.ssh`, `~/.aws`, system root drives, or unauthorized network ports.
- **Microsecond File Lock Queue**: Daemon manages in-memory file mutex queues (`async-mutex`) to prevent concurrent agent race conditions.

### 2. AST Knowledge Engine (Token Optimization)
- Tree-sitter parser (`graph.json`) injecting exact code syntax nodes instead of raw file dumps, saving up to 70% tokens.

### 3. Governance Systems
- **Report Mode**: Intercepts high-risk operations (terminal scripts, file writes, external API calls) and pauses execution for human approval in UI (mobile push or desktop modal).
- **Goal Mode**: Autonomous closed-loop execution inside sandbox boundaries.

### 4. Model Context Protocol (MCP)
- `@modelcontextprotocol/sdk` connecting Google Workspace, Figma, and Playwright headless browser for self-healing visual test loops.

---

## 5. REPOSITORY STRUCTURE
```
/apps
  /web           # Next.js 14 Web UI (Vercel Deployed)
/packages
  /daemon        # Local Engine Daemon & WSS Relay Client
  /sandbox       # Native OS Kernel Sandbox (sandbox-exec / AppContainer)
  /ast-indexer   # Tree-sitter Parser & AST Graph Generator
  /mcp-client    # MCP Tool Router & Credential Store
```

---

## 6. FEASIBILITY & TIMELINE

### Feasibility: High (9.5/10)
- Zero external software dependencies for end users. Runs natively on macOS, Windows, and Linux out of the box.

### Estimated Project Timeline (6 to 8 Weeks)
- **Weeks 1–2 (Cloud DB & Daemon Core)**: Setup Supabase Auth/DB, build local Node.js daemon, and establish outbound WSS relay tunnel from Vercel to local daemon.
- **Weeks 3–4 (Native OS Sandbox & Governance)**: Implement `sandbox-exec` (Mac) / `AppContainer` (Windows) kernel wrappers, directory boundary enforcement, and Report Mode approval popups.
- **Weeks 5–6 (Agent LLM & MCP Integration)**: Connect Vercel AI SDK / LangChain agent execution loops, `SOUL.md`/`SKILL.md` persistence, and MCP tools (Playwright).
- **Weeks 7–8 (Mobile Responsive Polish & Hardening)**: Finalize mobile chat hub UI, push notification triggers, offline status fallbacks, and launch testing.