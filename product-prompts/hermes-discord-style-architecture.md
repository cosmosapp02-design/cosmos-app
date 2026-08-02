# Discord-Style Communication with Hermes Agents — Architecture Overview

## Purpose

This document explains how our app connects to Hermes AI agents (e.g. Lisa, Montie) using the same communication model Discord uses to connect to bots. It is written for knowledge transfer — no commands or code, just the concepts and data flow.

---

## 1. The Core Idea

Discord bots don't sit and wait for Discord to find them. Instead, the bot process reaches **outward** and opens a persistent connection to Discord's servers, using a unique bot token as its identity. Discord then pushes messages down that connection, and the bot pushes replies back up it.

We're replicating this exact pattern, except instead of Discord's servers, the agent connects outward to **our own relay server**.

Key implication: each agent (Lisa, Montie, etc.) is not a fixed "location" we call — it's an outbound connection that shows up when the agent is running, and disappears when it's not. Our backend's job is to keep track of who's currently connected, and route messages accordingly.

---

## 2. Where the Agents Actually Run

Hermes agents run **locally on each user's own computer**, not on our servers. This means:

- We are not hosting or paying for agent compute.
- The agent only exists — and only has memory, skills, and personality — while it is running on the user's machine.
- "Access from anywhere" is achieved by having the *user interface* be cloud-based (accessible from any device), while the *agent itself* stays tied to one machine and reconnects whenever that machine is online.
- If the user's computer is off, the agent is offline. Messages sent during that time are stored and delivered once the agent reconnects.

---

## 3. The Three Layers

**Layer 1 — Agent Identity**
Each agent has its own separate profile: its own name, personality/instructions (SOUL.md), skills, and memory. This is what makes Lisa "Lisa" and not a generic assistant — her identity lives in local configuration, not in something we inject at chat time.

**Layer 2 — The Relay Connection**
This is the "communication pipe," equivalent to the Discord bot token + Discord's gateway. Each agent is issued a unique secret token. When the agent starts up, it uses that token to open a connection to our relay server. Our relay server checks the token, figures out which user and which agent this is, and registers that connection as "online."

**Layer 3 — Our App Backend**
This is the layer our users' web/mobile UI actually talks to. It never talks to the agent directly — it writes messages into our database, and our backend figures out (via the relay server's registry) where to forward that message, i.e. which agent connection is currently active for that user.

---

## 4. End-to-End Message Flow

1. User types a message in our app (on any device).
2. Message is saved to our database and marked as pending.
3. Our backend checks whether that user's agent is currently connected via the relay server.
4. If connected: the message is forwarded down that agent's relay connection.
5. The agent (running locally) processes the message using its own memory/skills/personality.
6. The agent sends its reply back up the same relay connection.
7. Our backend saves the reply to the database.
8. Any open instance of our UI (phone, laptop, browser tab) updates in real time, because they're all subscribed to the same database, not to the agent directly.

If the agent isn't connected at step 3, the message stays queued and gets delivered once the agent reconnects — same as how a Discord bot processes messages it missed while offline, once it comes back online.

---

## 5. Multi-Agent and Multi-User Considerations

- **Multiple agents per user** (Lisa and Montie): each one is a completely separate identity, with its own token and its own relay connection. They don't share memory or personality — running two agents is like running two independent Discord bots.
- **Multiple users:** since each agent lives on each user's own machine, this scales naturally without us needing to host anything extra per user. Our relay server just needs to track more simultaneous connections as more users come online — a fairly standard scaling problem, not a per-user compute cost problem.
- **Private vs. shared agents:** because agents run locally per user, every agent is inherently private and personalized to that user by default. There's no shared-instance model to manage.

---

## 6. Automating Agent Creation (No Manual Setup for Users)

Goal: user clicks "Create Agent," fills in a form (name, role, personality/SOUL.md content), hits submit, and can start chatting shortly after — without touching a command line.

**The one unavoidable manual step:** a web browser cannot install software or start local processes on someone's computer for security reasons. So there needs to be a small one-time installation of a lightweight "companion" background app on the user's machine (bundling Hermes). This is a one-time setup per user, done once, ever — not per agent.

**Everything after that is automated:**

1. User submits the "Create Agent" form in our app.
2. Our backend generates a unique secret token for this new agent and records a "provisioning job" — essentially an instruction saying "set up an agent with this name, this personality, and this token."
3. The companion app running on the user's machine picks up this job automatically (it's watching for new jobs tied to that user's account).
4. The companion app performs the setup that used to be manual: creating the agent's local profile, writing its personality file, and configuring it to connect to our relay server using the generated token.
5. The companion app starts the agent, which immediately opens its relay connection.
6. Our backend detects the new connection coming online and marks the job as complete.
7. Our UI, watching for that status change in real time, automatically unlocks the chat screen for that agent — no page refresh or manual step needed.

From the user's perspective: fill out a form, wait a few seconds, start chatting. The complexity (profile creation, token generation, connection setup) is invisible to them, handled by the companion app and our backend working together.

---

## 7. Summary of Responsibilities

| Component | Responsibility |
|---|---|
| User's local machine | Runs the actual agent (identity, memory, skills, personality) |
| Companion app (local) | Automates agent creation and connects it to our relay server |
| Relay server (ours, cloud) | Accepts outbound agent connections, verifies tokens, tracks who's online |
| App backend (ours, cloud) | Stores messages, routes them to the right online agent, handles offline queuing |
| Web/mobile UI (ours, cloud) | Talks only to our backend/database — works from any device, regardless of where the agent runs |

