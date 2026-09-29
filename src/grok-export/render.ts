import type { Message } from './dom/extract';
import {
  citationsOf,
  markdownLink,
  serialize,
  type Citation,
} from './dom/serialize';
import type { Role } from './dom/selectors';

/**
 * The document seam: frontmatter, body, and filename.
 *
 * None of these values belong to a single message element, so nothing downstream of `extract` can
 * assemble them. The output format is defined by README.md; this module is its implementation.
 */

export interface ConversationMeta {
  title: string;
  url: string;
  conversationId: string | null;
  /** `YYYY-MM-DD`. */
  exported: string;
}

/** The callout type each turn is written as. Styling is a vault snippet, not part of this script. */
const CALLOUT_TYPE: Record<Role, string> = {
  user: 'user',
  assistant: 'grok',
};

/**
 * The callout title. An unknown callout type falls back to `note` in Obsidian, so this is what names
 * the turn for a reader who has not installed the snippet.
 */
const CALLOUT_TITLE: Record<Role, string> = {
  user: 'User',
  assistant: 'Grok',
};

/**
 * A callout body is a blockquote, so every line is prefixed. A blank line becomes a bare `>` —
 * never nothing, because an *empty* line inside a fenced block ends the callout in Obsidian, and a
 * missing prefix truncates the turn mid-answer.
 */
function blockquote(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * The sources for one turn, deduplicated by URL in first-appearance order.
 *
 * Built from the inline citations only. Grok's `N sources` drawer is not read: it is a click-to-open
 * search log, it mounts lazily, and its entries carry no links. See docs/PLAN.md §2.7.
 */
function sourcesSection(citations: Citation[]): string | null {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const { label, href } of citations) {
    const key = href ?? `label:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(href ? `- ${markdownLink(label || href, href)}` : `- ${label}`);
  }

  return lines.length > 0 ? `**Sources**\n\n${lines.join('\n')}` : null;
}

function renderTurn(message: Message): string {
  const body = [
    serialize(message.element),
    sourcesSection(citationsOf(message.element)),
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');

  return `> [!${CALLOUT_TYPE[message.role]}] ${CALLOUT_TITLE[message.role]}${
    body ? `\n${blockquote(body)}` : ''
  }`;
}

/**
 * Bare when the value is a safe YAML plain scalar, otherwise a JSON string — which is also a valid
 * YAML double-quoted scalar.
 *
 * `https://grok.com/c/...` stays bare: a `:` only ends a plain scalar when a space follows it. A
 * title like `Q3: what "growth" means` does not survive bare, so it gets quoted.
 */
function yamlScalar(value: string): string {
  const unsafe =
    value === '' ||
    /^[\s\-?&*!|>%@`{}[\]#]/.test(value) ||
    /[\s]$/.test(value) ||
    /:\s/.test(value) ||
    /[#\n"'\\]/.test(value);

  return unsafe ? JSON.stringify(value) : value;
}

export function renderDocument(
  messages: Message[],
  meta: ConversationMeta,
): string {
  const frontmatter = [
    '---',
    `title: ${yamlScalar(meta.title)}`,
    'source: grok.com',
    `url: ${yamlScalar(meta.url)}`,
    `conversationId: ${yamlScalar(meta.conversationId ?? '')}`,
    `exported: ${meta.exported}`,
    `messageCount: ${messages.length}`,
    '---',
  ].join('\n');

  const body = messages.map(renderTurn).join('\n\n');

  return `${frontmatter}\n\n${body}\n`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * The title, slugified. No collision handling: a userscript cannot see the download folder, so
 * "add a suffix when two titles collide" is unimplementable. The conversation id is the fallback
 * when the title slugs to nothing.
 */
export function buildFilename(
  title: string,
  conversationId: string | null,
): string {
  const slug = slugify(title);
  return `${slug || conversationId || 'conversation'}.md`;
}

/** Local date, because the person reading the file is in their own timezone. */
export function today(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
