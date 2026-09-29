# AGENTS.md

A Violentmonkey userscript that exports the open grok.com conversation to a Markdown file.

User-visible behavior lives in [README.md](README.md). Roadmap, decisions, and the grok.com
selector contract live in [docs/PLAN.md](docs/PLAN.md).

Status: confirmed end to end on a real conversation. The status line in [docs/PLAN.md](docs/PLAN.md)
owns this fact — read it there.

## Where each fact lives

One home per fact. Edit the fact in its home; everywhere else, point at it.

| Fact | Home |
| --- | --- |
| User-visible behavior, install, usage, exported file format | [README.md](README.md) |
| Status, decisions and their rationale, risks, verification protocol | [docs/PLAN.md](docs/PLAN.md) |
| The panel's memory and the lines it reports | `src/grok-export/panel-state.ts` |
| The panel's two palettes | `:host` blocks in `src/grok-export/style.module.css` |
| grok.com selector contract | `src/grok-export/dom/selectors.ts` (the evidence behind each entry is in [docs/PLAN.md](docs/PLAN.md) §2) |
| Obsidian callout styling for the exported turns | `obsidian/snippets/chats-callouts.css` (the vault setting that enables it is `obsidian/appearance.json`) |
| Build, lint, and test commands | `scripts` in [package.json](package.json) |
| Distribution: the URL a user installs from and updates to, and the version they receive | `src/grok-export/meta.js` (the reasoning is D9 in [docs/PLAN.md](docs/PLAN.md) §1) |
| How a release is cut | [scripts/release.sh](scripts/release.sh) |
| How a fixture was captured, and what it covers | the `NOTICE` file beside it under `tests/fixtures/` |
| Conventions and invariants | this file |

When the selector contract moves into `selectors.ts`, delete it from `PLAN.md` in the same change —
a contract written in two places drifts.

## Invariants

**DOM-only.** Every value in the export is read from the rendered page. This is the load-bearing
decision of the project. A same-origin request to grok.com's internal REST API
(`/rest/app-chat/...`) would return a cleaner transcript — timestamps, model name, structured
citations, thinking steps — and it is deliberately not used. Reaching for it is the failure this
invariant exists to prevent.

**One selector home.** Every grok.com selector lives in one module. A selector written inline
anywhere else is a bug.

**Current conversation.** The script exports the conversation that is open. It does not enumerate
or walk history.

**Fixture-first.** Parsing behavior is proven by a `fixture` under `tests/fixtures/` — a saved
`outerHTML` capture. Behavior that no fixture exercises cannot be verified in this repo. CI cannot
open grok.com. A logged-in Chrome session can check selectors; that check does not replace the
fixture.

**Evidence before code.** DOM evidence is gathered before the code that reads it. A selector written
from a memory of the page is a selector nobody verified.

## Gotchas

The reasons grok.com parsing is not a generic HTML-to-Markdown job. Each one is a silent
wrong-output bug, not a crash.

- **The transcript is not in the DOM when the script starts.** `@run-at document-idle` fires before
grok.com has rendered the conversation, so reading the page once at mount finds nothing and the
  panel reports an empty page forever. The list is also virtualized, so the message count changes as
  the user scrolls, and grok.com is a single-page app, so switching conversation in the sidebar
  changes `location.pathname` without reloading the userscript. Re-read on mutation —
  `VM.observe` — and read the pathname fresh each time; never sample once.
- **Off-screen code blocks are lazily rendered.** Grok mounts the code text only after the block
  scrolls into view, and the export does not scroll: a block that never rendered holds no `pre`, and
  the rule skips it rather than emitting an empty fence. A rendered block is one fenced block whose
  header is dropped whole, the language label becoming the fence info (`Bash` → `bash`) — see
  [docs/PLAN.md](docs/PLAN.md) §2.8.
- **Mounted messages are the export.** A long conversation does not hold every message in the DOM:
  rows are absolutely positioned with an inline `transform: translateY(Npx)`, which is a virtualized
  list. Exporting a subset is the decided behavior, not a defect. Do not add a scroll loop;
  [docs/PLAN.md](docs/PLAN.md) records why.
- **Newlines live in an inline style.** Grok preserves user line breaks with `style="white-space:
  pre-wrap"` on `<p>` — an inline attribute, not only a stylesheet rule, so jsdom can see it. Some
  paragraphs also contain `<br>`. A default converter drops both.
- **Thinking sits inside the bubble.** `.thinking-container` is a child of `.message-bubble`, so it
  lands in the output unless explicitly dropped. It is a collapsed `<button aria-expanded="false">`
  whose text is a duration label plus, once expanded, a short step summary. It is not empty.
- **The body root contains controls, and two of them carry text.** `.response-content-markdown` holds
  a table's icon-only copy and save buttons and a scroll sizer as well as prose — they carry no text —
  and, the exception a fixture caught, a code block's header: a language label plus a copy button whose
  two states (`Copy`, `Copied`) are hidden by CSS rather than removed, so all three read as prose to a
  converter. `serialize.ts` serializes the whole `SELECTORS.codeBlock` in one rule, and the walk never
  reaches the header. Do not strip another node type until a fixture shows it leaking text.
- **Citations carry an invisible character.** `a.citation` text starts with U+2060 (word joiner).
  Strip it, or it lands in the Markdown link text.
- **Role is a test id.** `data-testid` on `.message-bubble` is `user-message` or `assistant-message`.
  Positional `items-*` classes are not the contract.
- **Math is lossy.** Original TeX survives only where a KaTeX annotation node carries it. Emit that
  TeX, or otherwise the readable text. Do not add a fidelity marker.
- **End-to-end confirmation is a Violentmonkey install** on a real conversation. Selector checks on
  an already-open grok.com tab are a different check. The protocol lives in
  [docs/PLAN.md](docs/PLAN.md).
- **A turn is a blockquote, so a missed `>` prefix truncates it.** `render.ts` prefixes every line of
  a callout body, blank lines as a bare `>`. An *empty* line inside a fenced block ends the callout in
  Obsidian, and an unprefixed line leaves it. `tests/render.test.ts` fails without the pass.
- **A `<br>` with nothing after it is not a line break.** Grok leaves one behind wherever a citation
  tag closed a paragraph, and turndown writes a `<br>` as two trailing spaces — so dropping the tag
  without dropping the break puts `  ` at the end of every paragraph that cited anything.
  `serialize.ts` drops the tags before the pre-wrap expansion and skips a break whose parent has
  nothing renderable after it.

These are about the panel rather than the parsing, and they are the same kind of bug: silent, and
wrong in a way that looks like it works.

- **The panel's drag is bound to the wrapper, which is outside the Solid render root.**
  `@violentmonkey/ui` binds `mousedown` to the wrapper and calls `preventDefault`, cancelling the
  browser's focus-on-click as well as the drag. Stopping that needs `on:mousedown` on the control, not
  `onMouseDown`: Solid delegates `onMouseDown` to the render root, which sits *inside* the wrapper, so a
  delegated handler runs after the drag has already started.
- **A shadow root has no reset behind it.** `@unocss preflights` publishes the `--un-*` variables and
  nothing else, so `box-sizing` stays `content-box` (a `w-56` card renders 248px wide once its padding
  is counted) and `border-style` stays `none` (every `border` utility draws nothing). `style.module.css`
  declares both itself. Both were found by measuring the built panel in a browser, not by reading the CSS.
- **A bare `<button>` in a shadow root keeps the UA `buttonface` background.** Preflight does not reset
  it. On the dark card it is nearly invisible, on the light one it is a grey slab — the same bug shipped
  twice, and the second time only a screenshot caught it. Every button sets its own background.
- **The pill that opens a folded panel must never have a condition that can refuse.** A folded panel is
  the only control on screen, so anything clever there (an inert pill, a drag-versus-click guess) becomes
  an unrecoverable state. `isFolded` takes an explicit `peek` for this reason, and it is tested.

## Repo layout

```
src/grok-export/
  meta.js             userscript metadata block
  index.ts            entry: metadata import plus app
  app.tsx             Solid panel mounted through @violentmonkey/ui
  page.ts             page state, the export payload, and the Blob download
  panel-state.ts      the panel's own memory and copy: position, fold, status lines
  render.ts           frontmatter + body + filename; the document seam
  dom/
    selectors.ts      the grok.com DOM contract; the one home for every selector
    extract.ts        message nodes -> Message[]
    serialize.ts      DOM -> Markdown, includes the Grok quirks
tests/
  fixtures.ts         loads the synthetic fixture and any live capture
  contract.test.ts    describes the captured DOM; does not test the exporter
  serialize.test.ts   the proven quirks, run over every fixture
  render.test.ts      the README output contract: frontmatter, the turn callout and its prefix rule, Sources
  page.test.ts        when the panel may report state, and what it may report
  panel-state.test.ts where the panel puts itself, and the lines it reports
  fixtures/grok/
    synthetic/        committed; invented prose, real DOM shapes
    live/             gitignored raw captures of real conversations
obsidian/             a vault slice: the snippet that styles the two callout types, plus the setting that enables it; never bundled
scripts/              dev-only helpers; never bundled into the userscript
  capture-fixture.js  writes a raw DOM capture of the open conversation
  release.sh          builds, tags, and uploads the release asset

rollup.config.mjs     one entry per userscript
```

## Conventions

- TypeScript; Solid for UI; UnoCSS through CSS modules. The template's stack is kept as-is.
- Keep `@grant` minimal. A Blob download avoids needing a download grant.
- Selectors degrade gracefully: a missing node shortens the export rather than throwing mid-export.
- `aria-label` (`You` / `Grok`) on `.message-bubble` is a second role signal behind `data-testid`.
- Nothing the panel *says* or *remembers* is written in the component. Position, fold, and every status
  line live in `panel-state.ts` so jsdom can test them without rendering; `app.tsx` only wires them up.
  Decorative colour never carries meaning alone — the status dot sits beside the sentence that says the
  same thing.
