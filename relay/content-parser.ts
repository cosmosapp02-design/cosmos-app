import { Client } from "pg";

export type ContentBlockType = "thinking" | "heading" | "body" | "code" | "mention";

export interface ContentBlock {
  type: ContentBlockType;
  text?: string;
  level?: number;
  lang?: string;
  target_id?: string;
  raw?: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Parses raw text from an agent into structured content blocks.
 * Resolves @mentions against real members in the specified org_id only.
 */
export async function parseContentBlocks(
  rawText: string,
  orgId: string,
  dbClient: Client
): Promise<ContentBlock[]> {
  if (!rawText) return [];

  const blocks: ContentBlock[] = [];
  let remainingText = rawText;

  // 1. Extract <think>...</think> thinking blocks
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  let thinkMatch: RegExpExecArray | null;
  while ((thinkMatch = thinkRegex.exec(rawText)) !== null) {
    const thinkContent = thinkMatch[1].trim();
    if (thinkContent) {
      blocks.push({
        type: "thinking",
        text: thinkContent,
      });
    }
  }

  // Strip <think> blocks from main text processing
  remainingText = remainingText.replace(thinkRegex, "").trim();

  // 2. Fetch active agents & org members for @mention resolution in this org_id ONLY
  const membersMap = new Map<string, { id: string; name: string }>();

  try {
    const agentsRes = await dbClient.query(
      `SELECT id, name FROM agents WHERE org_id = $1 AND status = 'active'`,
      [orgId]
    );
    for (const row of agentsRes.rows) {
      const nameNorm = row.name.toLowerCase().trim();
      const slugNorm = toSlug(row.name);
      membersMap.set(nameNorm, { id: row.id, name: row.name });
      membersMap.set(`@${nameNorm}`, { id: row.id, name: row.name });
      membersMap.set(`@${slugNorm}`, { id: row.id, name: row.name });
      membersMap.set(`@${nameNorm.replace(/\s+/g, "_")}`, { id: row.id, name: row.name });
      membersMap.set(`@${nameNorm.replace(/\s+/g, "")}`, { id: row.id, name: row.name });
    }
  } catch (err: any) {
    console.warn("[ContentParser] Error fetching org agents for mentions:", err.message);
  }

  // 3. Process code fences and text blocks
  // Regex for triple backtick code fences: ```lang\ncode\n```
  const codeBlockRegex = /```([a-z0-9_-]*)\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let codeMatch: RegExpExecArray | null;

  while ((codeMatch = codeBlockRegex.exec(remainingText)) !== null) {
    const matchStart = codeMatch.index;
    const matchEnd = codeBlockRegex.lastIndex;

    // Process text before code block
    const textBefore = remainingText.substring(lastIndex, matchStart);
    if (textBefore.trim()) {
      await processTextLines(textBefore, blocks, membersMap);
    }

    // Add code block
    const lang = codeMatch[1].trim() || "text";
    const codeText = codeMatch[2].trim();
    blocks.push({
      type: "code",
      lang,
      text: codeText,
    });

    lastIndex = matchEnd;
  }

  // Process any remaining text after code blocks
  const textAfter = remainingText.substring(lastIndex);
  if (textAfter.trim()) {
    await processTextLines(textAfter, blocks, membersMap);
  }

  return blocks;
}

/**
 * Helper to process text blocks into headings, mentions, or body blocks
 */
async function processTextLines(
  textSection: string,
  blocks: ContentBlock[],
  membersMap: Map<string, { id: string; name: string }>
) {
  const lines = textSection.split("\n");
  let currentBodyLines: string[] = [];

  const flushBody = () => {
    if (currentBodyLines.length > 0) {
      const fullText = currentBodyLines.join("\n").trim();
      if (fullText) {
        processBodyWithMentions(fullText, blocks, membersMap);
      }
      currentBodyLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Markdown Heading Check (# Heading, ## Heading, ### Heading)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushBody();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    currentBodyLines.push(line);
  }

  flushBody();
}

/**
 * Parses body text for @mentions. If @mention matches a member in membersMap,
 * emits separate body and mention blocks. Otherwise leaves unmatched @name as plain body text.
 */
function processBodyWithMentions(
  text: string,
  blocks: ContentBlock[],
  membersMap: Map<string, { id: string; name: string }>
) {
  // Match tokens starting with @ followed by word chars/underscores
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  let hasMentions = false;
  let accumulatedText = "";

  while ((match = mentionRegex.exec(text)) !== null) {
    const rawTag = match[0]; // e.g. "@Zara" or "@Sara_Pate"
    const tagLower = rawTag.toLowerCase();

    const resolvedMember = membersMap.get(tagLower);

    if (resolvedMember) {
      hasMentions = true;
      const textBefore = text.substring(lastIndex, match.index);
      accumulatedText += textBefore;

      if (accumulatedText.trim()) {
        blocks.push({ type: "body", text: accumulatedText.trim() });
        accumulatedText = "";
      }

      blocks.push({
        type: "mention",
        target_id: resolvedMember.id,
        raw: rawTag,
      });

      lastIndex = mentionRegex.lastIndex;
    }
  }

  const trailingText = text.substring(lastIndex);
  accumulatedText += trailingText;

  if (accumulatedText.trim()) {
    blocks.push({ type: "body", text: accumulatedText.trim() });
  }
}
