# Grok Conversation Export

A Violentmonkey userscript that saves the grok.com conversation you have open as a single Markdown
file.

> **Status: confirmed end to end.** An installed copy exported a real conversation, and the parsing
> tests are green against the synthetic fixture and two real captures. What the export cannot cover is
> in [Limitations](#limitations); the verification protocol is in [docs/PLAN.md](docs/PLAN.md) §5.

## What it does

Click the panel button on an open conversation and the script writes one `.md` file, with a YAML
frontmatter header. Each turn is one Obsidian
[callout](https://help.obsidian.md/callouts) — `[!user]` or `[!grok]` — so a turn reads as a single
block. Grok's source tags are dropped from the prose and an answer that cites something ends with a
deduplicated **Sources** list instead.

It reads the conversation **from the page**. It makes no request to grok.com's internal API, so it
exports exactly what is mounted — and only what is mounted. It does not scroll to load more.

### What the file looks like

````markdown
---
title: Effects of a higher capital gains tax
source: grok.com
url: https://grok.com/c/6d27fe4b-9bfc-4d9f-ad88-3ac7e108e1a9
conversationId: 6d27fe4b-9bfc-4d9f-ad88-3ac7e108e1a9
exported: 2026-09-29
messageCount: 4
---

> [!user] User
> Does a higher capital gains tax raise revenue?

> [!grok] Grok
> It depends on how much realising gains is deferred. Three effects matter:
>
> - **Timing.** Owners choose when to sell, so a higher rate pulls sales forward or pushes them back.
> - **Lock-in.** Capital stays in the asset that already appreciated.
> - **Realisation.** Revenue can fall even as the rate rises.
>
> The elasticity of realisations is what decides the sign.
>
> $$
> R = \tau \times B \times e
> $$
>
> **Sources**
>
> - [CBO](https://www.cbo.gov/publication/example)
> - [NBER](https://www.nber.org/paper/example)
````

The file is named after the conversation title, slugified. If the title slugs to nothing, the
conversation id is used instead.

### Turn callouts in Obsidian

`user` and `grok` are not built-in callout types. Obsidian renders an unknown type as `note` — right
title, default colour and icon — so the file is correct with no setup and merely plainer.

To give the two types their own shape and colour — the question a right-aligned bubble, the answer
plain text behind a thin rule — copy
[`obsidian/snippets/chats-callouts.css`](obsidian/snippets/chats-callouts.css) into
`<vault>/.obsidian/snippets/`, then open **Settings → Appearance → CSS snippets**, choose
**Reload**, and enable `chats-callouts`. [`obsidian/appearance.json`](obsidian/appearance.json) is
the vault setting that enables it: ours lists only `chats-callouts`, while a real vault's copy holds
the rest of its appearance settings, so turn the snippet on in the UI rather than copying that file
over your own. A `.md` file cannot carry a callout type's styling, so this is the only lever
available: the file carries the type, the vault carries the look.

## Install

**From the latest release.** Open
<https://github.com/andrewfung729/vmscript-grok-export/releases/latest/download/grok-export.user.js>
and Violentmonkey offers to install it. `@downloadURL` and `@updateURL` in the metadata block point
at that same URL, so Violentmonkey re-checks it on its own schedule and offers the next release when
there is one.

**From a build.**

1. Run the build (see [Development](#development)) to produce `dist/grok-export.user.js`.
2. Open the Violentmonkey dashboard, choose **+** → **Install from file**, and pick that file.

Either way, reload a grok.com conversation tab. A floating panel appears. A copy installed from a
file has no URL to check, so it updates only when a newer file is installed by hand.

## Limitations

These follow from reading the page rather than the API, and are expected rather than temporary.
They are decisions, not bugs to be filed — see [docs/PLAN.md](docs/PLAN.md).

- **Messages not mounted are absent.** A long conversation exports the messages currently in the
  page. Grok virtualizes its transcript, so a long conversation exports a subset of it.
- **Thinking traces are not exported.** Grok collapses them behind a click, and v1 does not click.
  The block is exportable in principle; it is out of scope here.
- **A code block appears only if Grok has rendered it.** Grok fills the block when it scrolls into
  view and the export does not scroll, so a block that never reached the screen is skipped rather than
  exported empty. A rendered one becomes a fenced code block whose info string is the language Grok
  labelled it with (`Bash` → `bash`); the block's own header, with its copy button, is not part of the
  answer and is dropped.
- **Math may be approximate.** Where a KaTeX annotation carries the original TeX, the export uses
  it. Otherwise the equation is readable text.
- **Generated images are not exported.** The Markdown keeps a link's position but not the image, so
  a file stays readable after `assets.grok.com` URLs expire.
- **Grok's `N sources` panel is not exported.** Each answer ends with a `28 sources` button. It opens
  a drawer that lists the research steps and every source Grok consulted — far more than the answer
  links. Reading it means clicking, which v1 does not do, and its entries carry no links. Only the
  sources Grok linked inside the answer are exported, as that turn's **Sources** list.
- **A source's position inside an answer is lost.** Grok tags the paragraph a source came from; the
  export drops the tag and lists the turn's sources once each at the end. An answer that cites six
  sources to make six points exports one flat list of six.
- **Attachments and uploaded files** are not exported.
- **One conversation at a time.** There is no bulk export.

## Development

Commands are defined in [package.json](package.json). Conventions and project invariants are in
[AGENTS.md](AGENTS.md); the plan and its rationale are in [docs/PLAN.md](docs/PLAN.md).

```sh
pnpm install
pnpm build    # writes dist/grok-export.user.js
pnpm test     # fixture-contract and serializer tests, over the synthetic fixture and any live capture
pnpm lint
```

`tests/fixtures/grok/live/` holds raw captures of real conversations and is gitignored. When one is
present, the behavioral tests run against it as well as against the committed synthetic fixture.

## License

MIT — see [LICENSE](LICENSE).
