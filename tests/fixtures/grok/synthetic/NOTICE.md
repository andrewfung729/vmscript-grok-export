# Provenance

**Synthetic.** This is not a saved page. The prose and the conversation are invented. The *DOM
shape* is not: every element, attribute, class, and inline style that `docs/PLAN.md` §2 names was
transcribed from two live grok.com conversations measured on 2026-09-29 through a logged-in Chrome
session via the `chrome-devtools` MCP server — `cabb7763-…` (prose, math, a table) and `bed8d430-…`
(the code block).

What was kept verbatim:

- the row/track structure of the virtualized transcript — `absolute inset-x-0 top-0` rows with
  inline `transform: translateY(Npx)`, between two zero-child spacer rows;
- `div[id^="response-"]` ids and their `relative group flex flex-col … items-end|items-start` classes;
- `.message-bubble` with `role="article"`, `aria-label` (`You` / `Grok`), and `data-testid`
  (`user-message` / `assistant-message`);
- `.response-content-markdown` as the body root, wrapping `div.streamdown-chat-md` and the trailing
  `<span hidden>`; the trailing `<span hidden>` and the table's icon-only copy/save buttons are
  inside the root, which is the point of keeping them here;
- `.thinking-container` wrapping `button[data-testid="canvas-trigger"][aria-expanded="false"]`;
- `style="white-space: pre-wrap"` on `<p>`, and `<br>` inside a `<p>`;
- `a.citation` with `target="_blank"`, `rel="noopener noreferrer nofollow"`, and a link text that
  begins with U+2060 (word joiner) — the invisible character is in the file on purpose. The anchor sits
  at the **end of its `<p>`**, after the sentence-ending punctuation, because that is where every one
  of the 10 anchors on the checked page sat; it was never mid-sentence. One URL is cited twice, in two
  different paragraphs of message 2, because the checked page cited `Aswathdamodaran.blogspot` twice
  in a single answer;
- the KaTeX subtree: `span.katex-display` / `span.katex` → `span.katex-mathml` → `math` →
  `semantics` → `annotation[encoding="application/x-tex"]`, plus the `span.katex-html`
  `aria-hidden` fallback;
- the empty `section.inline-media-container` inside the bubble;
- the `28 sources` pill with `role="button"` and `aria-label="28 sources"`, outside the body root
  and inside the bubble;
- the empty `.order-first` sibling;
- the code block, from `bed8d430-…`: `div[data-testid="code-block"].chat-code-block` → the rounded
  border wrapper → `div[class~="group/code-header"]` holding the language label `span` and a copy
  `<button aria-label="Copy">` whose two states are `span.t-copy-label` elements reading `Copy` and
  `Copied` → `div.shiki` → `pre.shiki.slack-dark` → `code` → one `span.line` per line, with the tokens
  as colour-only spans and a blank line as an empty `line` span. The `Collapse` button that multi-line
  blocks carry in the same header is not reproduced here.

What was changed, and why it does not weaken the fixture:

- **Prose replaced** with neutral sample text. No conversation content is stored here.
- **Cosmetic utility classes trimmed** from long class lists. The retained classes are the ones
  §2 relies on; Tailwind variants and colour utilities are not read by any rule.
- **SVG icons emptied.** They carry no text and no rule depends on them.
- **`node="[object Object]"` kept** on the user `<p>` elements, because §2.6 lists it as a real
  leak from Grok's renderer.

## What this fixture cannot prove

It is not evidence that the selectors still match grok.com. Only a fresh capture is. Capture one
with `scripts/capture-fixture.js` and save it under `tests/fixtures/grok/live/` before trusting any
selector.

## Assertions this fixture is built to support

1. A user message and an assistant message are distinguished by `data-testid`.
2. `div[id^="response-"]` does not select the spacer rows.
3. A row's `parentElement` is not the conversation.
4. `.thinking-container` contributes no text to the export.
5. `.inline-media-container` contributes no text to the export.
6. The `28 sources` pill contributes no text to the export.
7. The table's `aria-label="Copy"` / `aria-label="Save table"` buttons contribute no text to the
   export, even though they sit inside the body root.
8. `.action-buttons` contributes no text to the export — it contains visible labels (`Edit`,
   `Copy`, `Retry`), so widening the root to `.message-bubble` must fail this.
9. `style="white-space: pre-wrap"` on `<p>` produces a hard line break.
10. A `<br>` inside a `<p>` produces a hard line break.
11. `a.citation` is dropped from the prose — leaving the sentence it followed whole, with no dangling
    separator — and its label carries no U+2060.
12. TeX is recovered from `annotation[encoding="application/x-tex"]`, and the `span.katex-html`
    fallback is **not** also emitted — no doubled equation.
13. `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<hr>`, and `<table>` survive as GFM.
14. `node="[object Object]"` does not reach the output.
15. A URL cited twice in one message appears **once** in that turn's Sources list, in
    first-appearance order.
16. A code block becomes one fenced block: the fence info is the header's label lowercased, the code
    is the `pre`'s text with its blank lines intact, and the header's `Copy` / `Copied` labels do not
    reach the export.
