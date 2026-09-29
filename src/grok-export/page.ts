import { observe } from '@violentmonkey/dom';
import {
  extract,
  readConversationId,
  readTitle,
  type Message,
} from './dom/extract';
import { SELECTORS } from './dom/selectors';
import { buildFilename, renderDocument, today } from './render';

/**
 * Page-level state, kept out of the Solid component so it can be tested in jsdom without a browser.
 *
 * The hard part is timing, not parsing: `@run-at document-idle` fires before grok.com has rendered
 * the transcript, and the transcript is virtualized, so the message set changes as the user
 * scrolls. Reading once at mount reports an empty page and never recovers.
 */

export type PageState =
  | { kind: 'not-a-conversation' }
  /** A `/c/` page whose transcript has not been rendered yet. Transient. */
  | { kind: 'loading' }
  /** The transcript is there and holds no messages. */
  | { kind: 'empty' }
  | { kind: 'ready'; count: number };

export function readPageState(root: ParentNode, pathname: string): PageState {
  if (!readConversationId(pathname)) return { kind: 'not-a-conversation' };

  const count = extract(root).length;
  if (count > 0) return { kind: 'ready', count };

  // The scroller arriving before any message means the transcript is mounted and genuinely empty.
  // Its absence means grok.com is still rendering, so the panel should wait rather than complain.
  return root.querySelector(SELECTORS.transcriptScroller)
    ? { kind: 'empty' }
    : { kind: 'loading' };
}

export interface ExportPayload {
  markdown: string;
  filename: string;
  count: number;
}

export interface ExportContext {
  pathname: string;
  url: string;
  documentTitle: string;
  now?: Date;
}

export function buildExport(
  root: ParentNode,
  context: ExportContext,
): ExportPayload | null {
  const messages: Message[] = extract(root);
  if (messages.length === 0) return null;

  const title = readTitle(context.documentTitle);
  const conversationId = readConversationId(context.pathname);

  return {
    markdown: renderDocument(messages, {
      title,
      url: context.url,
      conversationId,
      exported: today(context.now),
    }),
    filename: buildFilename(title, conversationId),
    count: messages.length,
  };
}

/** Long enough to coalesce a render burst, short enough to feel immediate. */
export const REFRESH_DEBOUNCE_MS = 200;

export interface WatchOptions {
  debounceMs?: number;
  /** Defaults to `document.body`. Injected so a test can use its own root. */
  root?: Node;
}

/**
 * Call `onChange` whenever `read()` returns a different value, and never with an unchanged one.
 *
 * The panel mounts at `document-idle`, before grok.com has rendered the transcript, and the
 * transcript is virtualized so the message count changes as the user scrolls. This is what makes
 * the first read recoverable instead of permanent.
 *
 * `read` is a function rather than a value because grok.com is a single-page app: switching
 * conversation in the sidebar changes `location.pathname` without reloading the userscript, so a
 * pathname captured when the panel mounted would go stale.
 *
 * Returns a function that stops watching.
 */
export function watchPageState(
  read: () => PageState,
  onChange: (state: PageState) => void,
  options: WatchOptions = {},
): () => void {
  const root = options.root ?? document.body;
  const debounceMs = options.debounceMs ?? REFRESH_DEBOUNCE_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: PageState | undefined;

  const stop = observe(
    root,
    () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        const next = read();
        if (previous && sameState(previous, next)) return;
        previous = next;
        onChange(next);
      }, debounceMs);
    },
    { childList: true, subtree: true },
  );

  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}

function sameState(a: PageState, b: PageState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ready' && b.kind === 'ready') return a.count === b.count;
  return true;
}

/** The panel's two palettes. The card carries one or the other, never a blend. */
export type Theme = 'light' | 'dark';

/**
 * grok states its theme as the **computed `color-scheme` of `<html>`** — a property, not a selector,
 * so this needs nothing from the selector contract and nothing from the DOM shape.
 *
 * Evidence, from the dark conversation `bed8d430-…` measured on 2026-09-29:
 * `<html class="scheme-light dark:scheme-dark dark" style="color-scheme: dark;">`, whose computed
 * `color-scheme` is `dark` — the class and the inline style agree, and either could change.
 */
export function themeFrom(colorScheme: string, prefersDark: boolean): Theme {
  const scheme = colorScheme.trim().toLowerCase();
  // `light dark` hands the choice to the operating system, so the page has not decided and the
  // browser's own preference has to. `normal` and `light` are both light.
  if (/\s/.test(scheme)) return prefersDark ? 'dark' : 'light';
  return scheme.includes('dark') ? 'dark' : 'light';
}

/** The page's own answer, read from the live document. */
export function readTheme(view: Window): Theme {
  const computed = view.getComputedStyle(view.document.documentElement);
  const prefersDark =
    typeof view.matchMedia === 'function' &&
    view.matchMedia('(prefers-color-scheme: dark)').matches;
  // jsdom has no `color-scheme`, so an empty value is a real case, not a missing one.
  return themeFrom(computed.colorScheme ?? '', prefersDark);
}

/**
 * Call `onChange` when grok's theme changes under a mounted panel. Toggling the theme rewrites
 * `<html>`, which is outside the subtree `watchPageState` observes, so it needs its own observer —
 * a cheap one, whose callback re-reads one property instead of re-reading the transcript.
 */
export function watchTheme(
  read: () => Theme,
  onChange: (theme: Theme) => void,
  root: Node = document.documentElement,
): () => void {
  // The panel has already applied this one, and the observer sees plenty of mutations that are not a
  // theme change — a class grok adds for something else, a style it rewrites for a layout pass.
  let previous = read();

  return observe(
    root,
    () => {
      const next = read();
      if (next === previous) return;
      previous = next;
      onChange(next);
    },
    { attributes: true, attributeFilter: ['class', 'style'] },
  );
}

/** Download via a Blob and an anchor click, so no `@grant` is needed for it. */
export function downloadMarkdown(payload: ExportPayload): void {
  const blob = new Blob([payload.markdown], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
