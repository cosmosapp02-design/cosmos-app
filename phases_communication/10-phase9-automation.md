# Phase 9 — Plug the Gateway Into the Existing "Hire" Flow

## Objective
You already have an "AI Agents" feature with a form and a "Hire" button that auto-provisions an agent in the background. This phase does **not** build that flow — it plugs the new token/relay-connection method into it, fully automated. The user's only manual action is filling the form and hitting "Hire."

No companion app yet. You are still testing directly on your local machine with Hermes installed manually — packaging this into a distributable app is later, separate work once the UI/flow is confirmed working end to end.

## Work for the LLM

1. **Form validation — name field:**
   - Only letters and numbers allowed. No spaces, no special characters.
   - Block invalid characters at the input level itself — if the user types a space or a symbol, it should not appear in the field at all (not typed-then-rejected, not silently stripped after the fact). Filter as they type.
   - Show a subtle inline hint near the field (e.g. small helper text under it) stating letters and numbers only, so the behavior isn't a silent mystery.
   - Apply the same allowed-character rule everywhere this name is used downstream (slug generation, local profile folder name, etc.) — one single source of truth for the format, not a separate reformatting function like the old `toProfileSlug()`.

2. **Plug token generation into "Hire":** when the user hits "Hire," the existing background provisioning logic must also:
   - Call the Phase 0 token-generation function to create this agent's `gateway_token_hash` row.
   - **Never surface the raw token to the user.** Instead, the automation itself takes the raw token and appends/writes it directly into the correct local Hermes config file for that new agent profile (the same config location the wrapper reads from). The user does nothing with the token at all.
   - Insert the corresponding `agent_workers`/`agent_gateways` rows in a `starting`/`not yet connected` state.

3. **Plug relay connection into "Hire":** the existing "auto setup in background" step must also configure and auto-start the Phase 3 wrapper for the new agent locally (you're running everything on one machine for testing), so the agent connects to the relay with zero action from the user beyond the original "Hire" click.

4. UI: once `agent_workers.status` flips to `online` for the new agent (same mechanism as every prior phase), the existing "Hire" flow's real-time status update should reflect that and unlock the chat screen — if it doesn't already do this, add it.

## Work for the user
- Try typing a space or a symbol into the name field on purpose — confirm it simply doesn't appear, with the hint text visible nearby.
- Fill out a valid name, hit "Hire," and do nothing else — confirm the agent comes online and the chat unlocks without touching any token, config file, or terminal.

## Test
- Typing invalid characters produces no visible input for those characters; only letters/numbers ever appear in the field; hint text is present.
- After "Hire," the token is generated and written into the local config automatically — inspect the config file to confirm it now contains the correct token, with no manual step having occurred.
- The agent connects and comes online automatically, and the chat screen unlocks in real time — the user's only actions were filling the form and clicking "Hire."

## Note for later (not this phase)
Packaging the local wrapper + Hermes into a one-time-install companion app is future work, once you're happy with the UI and flow on your own machine.
