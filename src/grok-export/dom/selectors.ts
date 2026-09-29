/**
 * The grok.com DOM contract.
 *
 * **This is the one home for every grok.com selector.** A selector written inline anywhere else is
 * a bug. The evidence behind each entry, and everything observed but deliberately not implemented,
 * is in [docs/PLAN.md](../../../docs/PLAN.md) §2.
 *
 * Every count below was checked on 2026-09-29 through a logged-in Chrome session. Two captures
 * back it: `cabb7763-a995-439f-b898-426e2e94efdc` (6 mounted messages, prose, math, a table, no
 * code block) and `bed8d430-1ef0-49e3-910f-f7cfe3af0247` (2 messages, 3 code blocks). Both live in
 * `tests/fixtures/grok/live/`, gitignored.
 */

export const SELECTORS = {
  /** Message node. `div[id^="response-"]`, id `response-<uuid>`. 6 of 6 mounted messages. */
  message: 'div[id^="response-"]',

  /**
   * The bubble inside a message node. Carries `role="article"`, `aria-label`, and `data-testid`.
   * Exactly one per message node.
   */
  bubble: '.message-bubble',

  /**
   * The extraction root. Present on all 6 messages.
   *
   * Narrow on purpose: `.message-bubble` also holds the thinking block, an empty inline-media
   * section, the `N sources` pill, and `.action-buttons` — 7.5 kB on a user message and 11.5 kB on
   * an assistant message, against 0.3–31 kB for the body itself.
   */
  bodyRoot: '.message-bubble .response-content-markdown',

  /**
   * Must be dropped. A collapsed `<button data-testid="canvas-trigger" aria-expanded="false">`
   * whose label is a duration (`Worked for 12s`, 14 characters). 3 of 6 — one per assistant
   * message. Expanding it reveals a short step summary, not the full trace; v1 does not click.
   */
  thinking: '.thinking-container',

  /**
   * Inline source link. 10 on the checked page. `href` is the source URL; the text is the source
   * name, prefixed with U+2060. See `WORD_JOINER`.
   */
  citation: 'a.citation',

  /**
   * Present on all 6 messages, inside the bubble, empty. Nothing leaks from it today, so nothing
   * strips it. Do not strip a node type until a fixture shows it leaking text.
   */
  inlineMedia: 'section.inline-media-container',

  /**
   * Sibling of the bubble, not a child. 6 of 6. Contains visible labels (`Edit`, `Copy`, `Retry`),
   * which is why `bodyRoot` must stay narrower than `.message-bubble`.
   */
  actionButtons: '.action-buttons',

  /** Inside `bodyRoot`. Carries `data-streamdown="table-body"` and `data-col-size` on cells. */
  table: '.response-content-markdown table',

  /**
   * A code block. 3 of 3 on the `bed8d430-…` capture; absent from the other, which is why the rule
   * arrived only once a fixture held one.
   *
   * Rendered on demand: Grok mounts the code text when the block scrolls into view, so a block that
   * was never scrolled is present but holds no `pre`. v1 does not scroll to force that render.
   */
  codeBlock: 'div[data-testid="code-block"]',

  /**
   * The code block's header row, holding the language label and the copy button. Both carry visible
   * text (`Bash`; the button's two states read `Copy` and `Copied`), which is why one rule serializes
   * the whole block rather than letting the walk reach the header. The class is a Tailwind *named
   * group*, so the attribute form is needed — `.group/code-header` would have to escape the slash.
   */
  codeHeader: '[class~="group/code-header"]',

  /** The language label inside `codeHeader`. `Bash` becomes the fence info `bash`. */
  codeLanguage: '[class~="group/code-header"] > span:first-child',

  /**
   * The code text, inside `codeBlock`. Shiki writes one `<span class="line">` per line, joined by a
   * literal `\n`; a blank line is an empty `line` span (6 of them on the capture). The tokens carry
   * only colours, so `textContent` is the source Grok was given.
   */
  codeText: 'pre',

  /**
   * Original TeX, when Grok kept it. 2 on the checked page: one `.katex-display` block and one
   * inline `.katex`. Absent this node, emit the readable text, with no fidelity marker.
   */
  katexTexAnnotation: 'annotation[encoding="application/x-tex"]',

  /** 1 of 1. Its track holds 8 children for 6 messages: two zero-child spacers and six rows. */
  transcriptScroller: '[data-testid="chat-transcript-scroller"]',
} as const;

/**
 * The contract for role. Verified 3 / 3 against 3 user and 3 assistant messages.
 *
 * Positional `items-*` classes are **not** a role signal: they sit on the row wrapper rather than
 * the bubble, and on the checked page they matched 4 / 3 — not 3 / 3.
 */
export const ROLE_TEST_ID = {
  user: 'user-message',
  assistant: 'assistant-message',
} as const;

/** Second role signal, independent of `data-testid`. Present on all 6 bubbles. */
export const ROLE_ARIA_LABEL = {
  user: 'You',
  assistant: 'Grok',
} as const;

export type Role = keyof typeof ROLE_TEST_ID;

/** Grok prefixes citation text with this. Strip it, or it lands in the Markdown link text. */
export const WORD_JOINER = '\u2060';

/** Set as an inline `style` attribute on `<p>`, so jsdom can see it without a stylesheet. */
export const PRE_WRAP = 'pre-wrap';

/** The suffix grok.com appends to `<title>`. Strip it to get the conversation title. */
export const TITLE_SUFFIX = ' - Grok';

/**
 * Observed by Grok's renderer on user `<p>` elements: a literal `node="[object Object]"`. Harmless,
 * but it must not reach the output.
 */
export const LEAKED_ATTRIBUTE = 'node';
