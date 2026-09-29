import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Vitest runs from the repo root; see the `test` script in package.json. */
const FIXTURES = resolve(process.cwd(), 'tests/fixtures/grok');

export interface LiveFixture {
  name: string;
  provenance: Record<string, unknown>;
  /** The real transcript subtree, so the row nesting and the spacer rows are the page's own. */
  doc: Document;
}

interface RawMessage {
  id: string;
  bubbleHTML?: string;
  rowClass?: string | null;
  rowTransform?: string | null;
}

interface RawCapture {
  provenance: Record<string, unknown>;
  transcriptHTML?: string | null;
  messages: RawMessage[];
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * The committed test substrate: the DOM shapes from docs/PLAN.md §2 with invented prose. Carries
 * no conversation content, so it is safe to commit and CI can always run it.
 */
export function syntheticDoc(): Document {
  return parse(readFileSync(join(FIXTURES, 'synthetic/messages.html'), 'utf8'));
}

/**
 * Rebuilds a transcript from per-message bubble HTML, for captures taken before the whole transcript
 * subtree was stored. Mirrors the real `row > div[id^="response-"] > .message-bubble` nesting.
 */
function rebuild(messages: RawMessage[]): string {
  const rows = messages
    .map(
      (message) =>
        `<div class="absolute inset-x-0 top-0 px-gutter"${
          message.rowTransform ? ` style="${message.rowTransform}"` : ''
        }><div id="${message.id}" class="relative group flex flex-col justify-center">${
          message.bubbleHTML ?? ''
        }</div></div>`,
    )
    .join('\n');
  return `<div data-testid="chat-transcript-scroller"><div class="relative w-full">${rows}</div></div>`;
}

/**
 * Raw captures of real conversations, written by `scripts/capture-fixture.js` or by a
 * `chrome-devtools` MCP `evaluate_script` call with `filePath`.
 *
 * Gitignored, because they carry the user's own conversation text. When one is present, the
 * behavioral tests run against it too — that is what keeps the synthetic fixture honest.
 */
export function liveFixtures(): LiveFixture[] {
  const dir = join(FIXTURES, 'live');
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => {
      const raw = JSON.parse(
        readFileSync(join(dir, name), 'utf8'),
      ) as RawCapture;
      const html = raw.transcriptHTML ?? rebuild(raw.messages);
      return { name, provenance: raw.provenance, doc: parse(html) };
    });
}
