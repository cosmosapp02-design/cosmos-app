# Phase 4 — Rich Content Parsing & Mention Resolution

## Objective
Turn an agent's raw text output into the structured `content_blocks` format so the UI can render it like Discord: collapsible thinking, headings, code blocks, and highlighted mentions — but only for names that are real org members.

## Work for the LLM

1. Build a parser (can live in the relay or a small backend function — LLM's call on placement) that takes raw Hermes output and produces a `content_blocks` array, e.g.:
```json
[
  { "type": "thinking", "text": "..." },
  { "type": "heading", "level": 2, "text": "..." },
  { "type": "body", "text": "..." },
  { "type": "code", "lang": "bash", "text": "..." },
  { "type": "mention", "target_id": "<agent_or_user_uuid>", "raw": "@Zara" }
]
```
2. Detection rules (define these explicitly and document them for future reference):
   - Thinking: whatever delimiter Hermes actually emits for reasoning (check current Hermes output format — it may already use a tag or fenced block; use that rather than inventing a new one).
   - Code: standard triple-backtick fences, capture the language hint if present.
   - Headings: markdown `#`/`##` style if Hermes emits them, otherwise treat clearly short all-caps or title-cased lines followed by body text as headings (LLM should confirm actual Hermes output samples before finalizing this rule).
   - Mentions: `@Name` tokens. Resolve against `agents.name` **and** org members **within the same `org_id` as the message** — never resolve across orgs. Unmatched names remain plain body text, not a mention block.
3. Store the result in `messages.content_blocks` for the reply row.

## Work for the user
- Provide a couple of real sample Hermes outputs (including one with a mention and one with code) so the LLM builds the parser against real formatting rather than guessing.

## Test (must pass before Phase 5)
- Send a test prompt through the Phase 3 wrapper designed to produce thinking + a code block + a heading + a mention of a real org member + a mention of a made-up name.
- Inspect the resulting `content_blocks` JSON: confirm each block type is correctly identified, the real member is a `mention` type with a valid `target_id`, and the made-up name is left as plain `body` text.
