# Implementation plan

The plan for this repo: what is decided, what is verified about grok.com, and what still needs a
human.

**How to read this document.** User-visible behavior — what the export contains and what the file
looks like — is defined by [README.md](../README.md) and is not restated here. This document owns
the *rationale* behind those choices, the *evidence* about grok.com, and the *order* of work.
Working conventions live in [AGENTS.md](../AGENTS.md).

Status: the exporter and the panel are done and confirmed by hand — an installed copy has exported a
real conversation, and an installed copy of the panel has been folded and reopened from its pill on a
real conversation. `pnpm build` writes `dist/grok-export.user.js`, and `pnpm test` runs against the
synthetic fixture and the live captures. What each check covered, and what it did not, is §5. §6 lists
what is still open.

**The selector contract lives in
[`src/grok-export/dom/selectors.ts`](../src/grok-export/dom/selectors.ts).** This document owns the
evidence behind it, not the selectors themselves.

## 1. Decisions

Each decision records what was chosen and what it costs, so a later reader can tell a considered
trade-off from an oversight.

### D1 — Read the DOM, not grok.com's API

grok.com exposes a same-origin REST API that returns a materially better transcript than the page
does. A logged-in session observed on 2026-09-29 requested:

```
GET  /rest/app-chat/conversations?pageSize=60
GET  /rest/app-chat/conversations_v2/{id}
GET  /rest/app-chat/conversations/{id}/response-node
     /rest/app-chat/conversations/{id}/load-responses
     /rest/app-chat/conversations/{id}/sharing
```

Rejected: the API is private and undocumented, so a shape change breaks the script outright, and
unusually heavy use risks the account. The DOM is the interface the user already sees, and a
selector break degrades to a shorter export instead of a failed one.

Cost: the serializer must reconstruct Markdown from rendered HTML.

### D2 — One conversation, the one that is open

Rejected: enumerating and batch-exporting history. Batch export needs a conversation picker, a job
queue with progress and cancellation, and a container format — all of which dwarf the parsing work
that is the actual risk in this project.

Cost: backing up a whole account means opening each conversation in turn.

### D3 — Mounted messages are the whole export

**The definition of done is "everything the page has mounted is exported".** A long conversation
may have more history than the DOM holds, and v1 does not care: if the page does not have it, the
export does not claim it.

The evidence that this is not a small gap is in §2.5. Grok lays every message out as an absolutely
positioned row positioned by an inline `transform: translateY(Npx)`, between two zero-height
spacer rows — a virtualized list. Whether scrolling grows the row set or replaces it was not
measured, and under this decision it does not need to be.

Rejected: a scroll-to-collect loop. It would turn a pure read into a page mutation, it would need
the virtualization question answered first, and Grok's own scroll behaviour (not ours) would decide
what ends up in the file.

Cost: a long conversation exports a subset, and the README says so plainly. This is the price of
D1's "a selector break degrades to a shorter export" being taken to its conclusion.

### D4 — Sources per turn; thinking, images, and per-message timestamps out

Grok tags the paragraph a source came from with a trailing `a.citation`, placed after the
sentence-ending punctuation. The export does not keep that tag. It drops it and collects the turn's
citations into a deduplicated **Sources** list at the end of the turn. The one thing a reader cannot
reconstruct later is the URL, and that list gives each URL once instead of once per mention.

Rejected: keeping the tag inline where Grok put it. It is a pill carrying a short source name, and it
sits at the end of a *paragraph* rather than the sentence it supports — never mid-sentence, on either
capture (§2.7) — so inline it reads as punctuation noise at the end of paragraphs. Nothing is lost by
finishing the sentence without it.

Cost: a source's position inside the answer is lost, and an answer that cites six sources to make six
different points exports one flat list of six. Accepted: the file is a record of what was said and
from where, not a facsimile of the rendered page.

It does **not** read Grok's `N sources` drawer — see §2.7.

Thinking traces are excluded because the block is collapsed by default and v1 does not click. **It
is available, though** — see §2.4. The honest statement is "not exported", not "not available".

Generated images are excluded because the exported Markdown is expected to be read as text, and
embedding `assets.grok.com` URLs produces a file that rots. Per-message timestamps are excluded;
the one place they would live (`.order-first`) is present in the DOM and empty.

Cost: an exported file is not a complete archive of the answer; the user must know that.

### D5 — `turndown` plus GFM rules, with Grok-specific rules on top

Rejected: a hand-written DOM-to-Markdown serializer. Tables, nested lists, headings, and escaping
have too many edge cases to re-derive reliably, and the interesting work here is Grok's quirks, not
generic Markdown. The captures hold real tables, headings, lists and rules (§2.3), so GFM earns its
keep.

Cost: one runtime dependency, and its defaults have to be overridden where §2.6 says so.

### D6 — The template panel, with one button, two states, and a memory

The template already ships a Solid panel via `@violentmonkey/ui`. The script reuses that shell: one
card, styled in `style.module.css`, holding a status line and the download button. A citation toggle,
scroll progress, a Markdown preview, and a clipboard copy are still out; each is UI for a behavior
the download already covers or that v1 does not do.

What the panel does beyond v1's one button, and what each thing costs:

- **It folds to a chip, and folds itself wherever there is nothing to export.** On any page that is not
  a `/c/` page the card is replaced by a small pill. The fold is remembered; the *reason* it is folded
  is not, because a page state is not a user choice.
- **Nothing may refuse to open the panel.** A folded panel is the only control on screen, so a click on
  the pill always opens the card, on every page — the card then says why it has nothing to export and
  its button is disabled. This cost a decision. An earlier version made the pill *inert* where there was
  nothing to export, and told drag from click with a 4px slop heuristic on the pill itself; both reached
  a user as the same report — fold the panel and it cannot be opened again. A guard on the only way out
  of a state is a trap, not a heuristic: the heuristic and the inert pill are both gone, and the rule is
  now one line with no condition that can refuse. Related: no control starts a drag (`on:mousedown`
  stops the event), so a folded panel is opened and then moved, rather than dragged and *also* clicked.
- **It follows grok's theme.** Two palettes, as CSS custom properties on the panel host (`:host` and
  `:host([data-theme='light'])` in `style.module.css`), switched by one attribute. The signal is the
  **computed `color-scheme` of `<html>`** — a property, not a selector, so the selector contract gains
  nothing and `selectors.ts` is untouched. `watchTheme` re-reads it when `<html>` is rewritten, so a
  live theme toggle repaints without a reload. Every pair is contrast-checked against the surface it
  sits on; the values are in the stylesheet beside the reason for each.
- **It remembers where it was put.** `localStorage`, keyed `grok-export:layout`, written on drag-end and
  on fold, and clamped to the viewport on the way back in. `localStorage` needs no `@grant`, and the key
  holds nothing but two numbers and a boolean. A junk value falls back per field rather than throwing:
  the key lives in grok.com's own storage, where another script can write anything.
- **The built-in themes are off** (`theme: 'none'`). They are a square `rgba(0, 0, 0, .8)` box with a
  `#333` border, and their 8px of body padding framed the card. The cost is that every colour is now
  this repo's to keep accessible; the values were chosen against measured contrast, not taste —
  `text-slate-900` on `orange-500` is 6.4:1, where the previous `text-white` on `orange-500` was 2.8:1.
- **One line per state, and a second line for a screen reader.** The visible line carries the mounted
  count, which changes as the user scrolls; the live region must not, or a scroll would re-announce it.
  The lines live in `panel-state.ts` and are tested there.
- **A confirmation in the button, not a toast in the middle of the screen.** `@violentmonkey/ui` centres
  a toast at 50%/50% of the viewport and dismisses it after 2s. A successful export is confirmed in
  place — the button becomes `Saved` for 2.5s, and the result is announced through the live region.
  A *failed* export still uses a toast, because there is no panel state that means "the export failed".

The two controls are 40px and 32px tall rather than the 44px touch guideline. Measured on the dark
conversation `bed8d430-…`, grok's own transcript controls are smaller still — its Copy and Collapse
buttons are 32px, its "Worked for 12s" chip 36px — and this is a desktop overlay.

### D7 — One `.md` download, named from the title

Rejected: a ZIP, and rejected a download interface kept around so a ZIP can be added later. Under
D2 a ZIP would contain one file. The implementation is a Blob download, not a seam.

The filename is the slugified conversation title, falling back to the conversation id when the
title slugs to nothing. **No collision detection.** A userscript cannot enumerate the download
folder, so "add a suffix when two titles collide" is unimplementable and is not specified.

### D8 — A turn is an Obsidian callout, and the custom types ship as a snippet

Each turn is one callout: `> [!user] User` / `> [!grok] Grok`. The whole turn — prose, headings,
tables, math, the Sources list — is blockquote-prefixed inside it.

Rejected: `## User` / `## Assistant` headings. They are portable and they populate Obsidian's
outline, but the format exists so that a turn reads as one block, and a heading does not separate two
adjacent turns visually. A reader without Obsidian degrades the callout to a blockquote whose first
line shows the type and title, which still reads as a labelled turn — the loss is styling, not
information.

An unrecognized callout type falls back to `note` — right title, default colour and icon — so the
export is correct with no setup and merely plainer. `obsidian/snippets/chats-callouts.css` gives
`user` and `grok` their own shape and colour; README has the install steps. A `.md` file cannot carry a
callout type's styling, so this is the only lever: the file carries the type, the reader's vault
carries the look.

Cost: `render.ts` prefixes every line with `>`, blank lines as a bare `>`, because an empty line
inside a fenced block ends the callout in Obsidian and a missing prefix truncates the turn mid-answer
(AGENTS.md). Callout titles are not headings, so a long export's outline pane stays empty.

### D9 — `dist/` stays out of git; a release asset is the distribution

The built userscript is a derived file: `.gitignore` keeps `/dist`, and `pnpm build` writes it. To
install without building, a release carries it as an asset and `meta.js` names that asset with
`@downloadURL`/`@updateURL` pointing at GitHub's version-independent
`releases/latest/download/grok-export.user.js`. No tag is ever written into the metadata block, so
**bumping `@version` in `meta.js` is the one step a release cannot skip** — an installed copy compares
that number, and a release without a bump is invisible to it. `scripts/release.sh` enforces the rest
(clean tree, tag does not exist, the built file carries that version) and uploads the asset.

A release is cut for the userscript, not for the repository: it exists to serve `@downloadURL`, so a
version bump is for a change a user can observe. `obsidian/` is never bundled, and a source comment
rides into the bundle without being behavior; either way the check is `pnpm build` and a diff against
the artifact the last release carries.

The release set is coupled to that URL: `/releases/latest/download/<file>` resolves a filename inside
the *latest* release, so every release carries the userscript asset even when its own change was
somewhere else.

The URL resolves only for anonymous readers, which is why this repository is public: Violentmonkey's
update check and its install-from-URL fetch both run through `request()` in its background
(`src/background/utils/url.js`), which calls `fetch(url, init)` with no `credentials` option — the
cross-origin service-worker default, i.e. no cookies. A private repository answers that with 404, so
"keep it private" and "install from a URL" cannot both hold.

Rejected: committing `dist/grok-export.user.js` so its raw URL is the install URL. That is the same
code in a second home, and the drift is silent: a stale artifact is a valid file, so nothing fails.

Rejected: build-then-install-from-file for everyone. It puts a Node toolchain between a reader and a
one-click install.

Cost: two steps where a commit would do (`@version` bump, `pnpm release`), and an installed copy
updates on Violentmonkey's schedule rather than on `git pull`.

## 2. Verified evidence about grok.com

All of §2 was measured on 2026-09-29 through a logged-in Chrome session via the `chrome-devtools`
MCP server, against two open conversations:

- `https://grok.com/c/cabb7763-a995-439f-b898-426e2e94efdc` — 6 mounted messages: prose, lists,
  math, a table. No code block.
- `https://grok.com/c/bed8d430-1ef0-49e3-910f-f7cfe3af0247` — 2 mounted messages, 3 code blocks.

Both raw captures live in `tests/fixtures/grok/live/` and are gitignored. The older
`revivalstack/ai-chat-exporter` capture (MIT) is not used: it dates from an unknown grok build, so it
could not verify a selector today, and §2.8 rests on our own capture of a code block.

| Observed on `cabb7763-…` | Count |
| --- | --- |
| `div[id^="response-"]` | 6 |
| `.message-bubble[data-testid="user-message"]` | 3 |
| `.message-bubble[data-testid="assistant-message"]` | 3 |
| `.message-bubble .response-content-markdown` | 6 |
| `.thinking-container` | 3 |
| `a.citation` | 10 |
| `annotation[encoding="application/x-tex"]` | 2 |
| `div[data-testid="code-block"]`, `pre`, `pre code` | 0 |
| `section[data-footnotes]`, `sup` | 0 |
| `<time>` | 0 |
| `div[data-testid="canvas-trigger"]` | 3 |

| Observed on `bed8d430-…` | Count |
| --- | --- |
| `div[id^="response-"]` | 2 |
| `.message-bubble[data-testid="user-message"]` | 1 |
| `.message-bubble[data-testid="assistant-message"]` | 1 |
| `div[data-testid="code-block"]` | 3 |
| `pre` | 3 |
| blank `<span class="line">` | 6 |
| `a.citation` | 0 |
| `.thinking-container` | 1 |

Selector counts on either page **do not cover long conversations**. A capture that does is still
open.

### 2.1 What the contract is, and where it lives

The selector strings, with their per-selector evidence, are in
[`src/grok-export/dom/selectors.ts`](../src/grok-export/dom/selectors.ts). Two facts are not
selectors and stay here:

- **Conversation id** is the uuid in the `/c/<uuid>` path. The `?rid=` parameter is a **response**
  id — on the checked page it equalled the last mounted message's id — so it must not be read as
  the conversation id.
- **Conversation title** is `document.title` with `TITLE_SUFFIX` (` - Grok`) removed. The checked
  title was `Excess Returns: Company Pursuit - Grok`.

`items-end` / `items-start` live on the **row wrapper**, not the bubble, and matched 4 / 3 against
3 users and 3 assistants. They are not a role signal; `data-testid` and `aria-label` are.

The extraction root stays narrower than `.message-bubble` because that node also holds the thinking
block, an empty inline-media section, the `N sources` pill, and `.action-buttons` — 7.5 kB of it on
a user message and 11.5 kB on an assistant message, against 0.3–31 kB for the body itself.

### 2.2 The body root is not purely content

`.response-content-markdown` contains controls as well as prose. Verified inside it:

- a `div.relative.group/table` wrapper holding a `<table>`, a `table-card-scroll-sizer`, and two
  icon-only `<button>`s (`aria-label="Copy"`, `aria-label="Save table"`);
- a trailing `<span hidden></span>`.

These leak no text today, because the buttons contain only SVGs. The root is kept anyway — it is
still far cleaner than `.message-bubble`. Any of these node types must not be stripped until a
fixture shows them leaking text.

### 2.3 Markdown shapes actually present

`<h2>`, `<h3>`, `<p>`, `<strong>`, `<hr>`, `<ul>`, `<ol>`, `<br>`, `<a>`, `<table>` with `<thead>`
/ `<th>` / `<tbody>` / `<td>`. The `<table>` carries `data-streamdown="table-body"` and
`data-col-size` on cells.

### 2.4 Thinking is collapsed, not absent

`.thinking-container` is a child of `.message-bubble`. It wraps a `<button
data-testid="canvas-trigger" aria-expanded="false">`. Collapsed, it is 14 characters
(`Worked for 12s`). Clicking it, then reading, gives 138 characters of real text for that message:

```
Worked for 12s
Analyzing the reasons for pursuing excess returns
Ran 3 searches
Exploring the reasons behind the pursuit of excess returns
```

That is a step summary, not the full trace. D4 excludes it because v1 does not click; the plan does
not claim the text is unavailable. Do not add a click loop without a fixture that contains the
expanded DOM.

### 2.5 The transcript is a virtualized list

`[data-testid="chat-transcript-scroller"]` → one `div.relative.[overflow-x:clip].w-full` track
holding 8 children for 6 messages:

| Child | Class | Inline style | Contains a message |
| --- | --- | --- | --- |
| 1 | `absolute inset-x-0 top-0` | `transform: translateY(0px)` | no, 0 children |
| 2–7 | `absolute inset-x-0 top-0 px-gutter` | `transform: translateY(80px)`, `163px`, `1466px`, `1549px`, `2942px`, `3025px` | yes, exactly 1 each |
| 8 | `absolute inset-x-0 top-0` | `transform: translateY(7789px)` | no, 0 children |

The signature to look for on a long conversation is the inline `transform: translateY(Npx)` on
absolutely positioned rows, plus the two zero-child spacer rows. If the row count stays flat while
the `translateY` offsets grow, history is being unmounted. D3 settled the behavior, so there is no
need to take that measurement; it is what to record if it ever is.

Capturing `div[id^="response-"]`'s `parentElement` captures one row, not the conversation.

### 2.6 Confirmed quirks

These are serializer rules, not selectors. Each one is a silent wrong-output bug.

1. `PRE_WRAP` is set as an **inline `style` attribute on `<p>`**, not only by CSS — so jsdom sees
   it without a stylesheet. 8 `<br>` elements sat inside one assistant body. A `<p>`'s `innerText`
   can itself contain a blank line.
2. `SELECTORS.thinking` must be dropped. See §2.4.
3. `SELECTORS.citation` text is prefixed with `WORD_JOINER` (U+2060). Strip it; it survives into the
   Sources list label otherwise.
4. KaTeX carries `SELECTORS.katexTexAnnotation`. Emit that TeX. The `aria-hidden` `span.katex-html`
   subtree repeats the same characters as glyphs and must **not** also be emitted — that doubles
   the equation. No fidelity marker.
5. `LEAKED_ATTRIBUTE` (`node="[object Object]"`) is a leak from Grok's renderer. Ignore it; do not
   reproduce it.

**Not in the v1 contract**: `div[data-testid="code-block"]`, `.font-mono.text-xs`,
`section[data-footnotes]`, `<sup>`, `.order-first.sticky`, `section.auth-notification`, and any
`citation_card` marker. `.order-first` alone *is* present — as an empty sibling of the bubble — but
`.order-first.sticky` is not. `section.inline-media-container` is present on all 6 messages, inside
the bubble, and empty. Do not implement any of these paths until a current fixture contains them.

### 2.7 Grok has no reference list; it has a sources drawer

- Every assistant bubble ends with `button[aria-label="<N> sources"]` — 28, 16 and 10 on this page.
  It holds three favicon `<img alt="" role="presentation">` and the count text. No source names, no
  URLs.
- Clicking it opens a right-hand drawer titled `Sources`. Its contents are the **research log**:
  `Thinking about your request` → `Searched web` + the exact query + a result count (`10`, `10`, `8`)
  → `Exploring…`. Only the visible rows are mounted as it scrolls, and the entries are **not**
  `a[href]` — a source row is a favicon plus a title.
- `a.citation` inside the bodies: 10 anchors, **8 unique URLs**, and **every one of the 10 is the last
  child of its `<p>`** — preceded by the sentence-ending punctuation and followed immediately by
  `</p>`. None is mid-sentence. Two of the eight URLs are cited twice, in two different paragraphs of
  the same answer. The drawer's 28 is not a superset of what the answer holds: most of Grok's sources
  are never linked inline.
- Because the tag is trailing, dropping it leaves the prose whole. What it does leave behind is the
  newline Grok wrote before the tag: with the tag gone that newline is the last thing in the `<p>`,
  and a `<br>` there would have exported as two trailing spaces on the line.
- `section[data-footnotes]`, `<sup>`: 0. There is no `References` section, at the end or anywhere
  else.

Consequence: an export can list the sources the answer links inline, and nothing more. The drawer is
not read — it would be a page mutation, and the payoff is a list of search queries. A count in the
callout title is deliberately not added either; it would mean a second read outside `bodyRoot` for a
number the answer does not support.

### 2.8 A code block is one block with its chrome attached

Measured on `bed8d430-…` (2 messages, 3 code blocks). The shape, with the text-bearing nodes named:

    div[data-testid="code-block"].chat-code-block
      div.border … rounded-xl
        div[class~="group/code-header"]                    14 characters of visible text
          span.font-mono.text-xs.text-secondary.select-none "Bash"   ← the language label
          div.ml-auto … button[aria-label="Copy"]           "Copy" + "Copied"
        div.shiki …
          pre.shiki.slack-dark → code > span.line          ← the code, one span per line

- **The header is chrome that carries text.** The label plus a copy button whose two states — `Copy`
  and `Copied` — are both in the DOM, hidden by CSS rather than removed. A converter that walks the
  block emits all three as prose. The rule over `SELECTORS.codeBlock` drops the header whole, and
  `tests/serialize.test.ts` fails without it.
- **The language lives in the header**, not on a `code[class^="language-"]`, so turndown's own
  `fencedCodeBlock` rule produced a bare fence. The label becomes the fence info, lowercased and
  space-to-dash (`Bash` → `bash`).
- **Lines are `span.line`s joined by a literal `\n`**, and a blank line is an empty `line` span — 6
  on this capture. Blank lines survive into the fence, which is where `render.ts`'s bare-`>` rule
  stops being about paragraphs and starts being load-bearing.
- Multi-line blocks carry a second header button, `aria-label="Collapse"`. It is inside the header,
  so one rule over the whole block drops it with the rest.
- **Not covered.** The shape of a block Grok has never rendered — it holds no `pre`, and the rule
  skips it rather than emitting an empty fence. And code whose own text contains three backticks: the
  fence is fixed at three, on no fixture's authority.

## 3. Order of work

Evidence about the page came before the code that reads it, and that order is the one thing worth
keeping from how this was built:

**A rule is added when a fixture holds the shape and a test fails without it.** §2 is where the
shapes and their evidence live; `tests/fixtures/grok/synthetic/` and the captures beside it are what
"a fixture" means.

## 4. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| The checked pages are atypical, so a selector is right for them and wrong generally | High | Two captures, one of them holding a code block, stand behind every selector |
| CI cannot open grok.com | High | Parsing stays fixture-backed. A logged-in Chrome session can check selectors; it is not a substitute for the fixture |
| Grok ships a DOM change | Medium | Selectors live in one module with tests against captured fixtures |
| A citation shape other than `a.citation` | Medium | v1 implements the shape §2.6 recorded. Another shape waits for a fixture |
| Controls inside `.response-content-markdown` start leaking text | Medium | A code block's header already does, and is dropped whole (§2.8); a new control waits for a fixture that shows it leaking |
| Math cannot be fully recovered | Low | Accepted consequence of D1; recover annotation TeX and otherwise emit readable text |
| A bundling landmine in turndown | Low | `rollup.config.mjs` resolves with `browser: false`, so turndown's `require('@mixmark-io/domino')` branch survives into the bundle. Measured on grok.com: `canParseHTMLNatively()` is true, so the native `DOMParser` is used and the branch never runs. `browser: true` removes it but changes resolution for everything else, so it is not worth an unverifiable trade |
| A long conversation exports a subset | Low | **Accepted** under D3, and stated in README's limitations |

## 5. Verification protocol

1. **Human, done 2026-09-29.** Install `dist/grok-export.user.js`, or a release asset, in Violentmonkey,
   open a conversation, and export one. Nothing in CI can do this. What stands in for it as far as it
   can: the release URL, fetched without credentials, returns the built file byte for byte.
   Done twice that day, and the second time covered the panel: an installed copy folded to its pill and
   reopened from a click on it, which is the path that had failed before D6 was rewritten. **What that
   check did not cover**, and what a browser check against the built file did instead: the light palette,
   dragging, position memory on a reload, and the export confirmation in the button. A check in a browser
   is a different check from an install on grok.com, which is why the two are listed apart.
2. **Taking a capture.** A logged-in Chrome session can do it, and the `chrome-devtools` MCP server can
   drive it: `evaluate_script` with `filePath` writes straight into `tests/fixtures/grok/live/`, at no
   context cost. Keep `--workspace=<repo root>` in [`.mcp.json`](../.mcp.json), or the server restricts
   writes to the OS temp directory.
3. **After a change to a selector or a Markdown rule.** Check the exported file renders as intended —
   in Obsidian, for the callouts — not only that the tests pass.

## 6. Open questions

- What does a code block hold before it has been scrolled into view? §2.8 measured only rendered ones.
- Does code whose own text contains three backticks break the fence? No fixture holds one yet.
- Should `url:` in the frontmatter carry the `?rid=` the address bar holds? It is a response id (§2.1),
  so two exports of one conversation differ by it, while README's example has no query.
- Does any current answer still use `section[data-footnotes]` instead of `a.citation`? v1 does not wait.
- What does an expanded thinking block contain on a message with real research? v1 does not click.
