// ==UserScript==
// @name        Grok Conversation Export
// @namespace   Violentmonkey Scripts
// @description Save the open grok.com conversation as a Markdown file.
// @match       https://grok.com/*
// @noframes
// @run-at      document-idle
// @grant       GM_addStyle
// @version     0.1.0
// @author      process.env.AUTHOR
// @downloadURL https://github.com/andrewfung729/vmscript-grok-export/releases/latest/download/grok-export.user.js
// @updateURL   https://github.com/andrewfung729/vmscript-grok-export/releases/latest/download/grok-export.user.js
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/ui@0.7
// ==/UserScript==

/**
 * Code here will be ignored on compilation. So it's a good place to leave messages to developers.
 *
 * - The `@grant`s used in your source code will be added automatically by `rollup-plugin-userscript`.
 *   However you have to add explicitly those used in required resources.
 * - `process.env.AUTHOR` will be loaded from `package.json`.
 * - Keep `@grant` minimal: `GM_addStyle` is the only one the panel needs, and the download is a
 *   Blob + anchor click, which needs no grant at all.
 *
 * `@version` and the two URLs are one mechanism and must be read together. The built file is not
 * committed; it reaches users as a release asset, and `@downloadURL`/`@updateURL` name that asset
 * through GitHub's version-independent `releases/latest/download/` alias, so no tag is ever written
 * into the metadata block. Violentmonkey re-fetches that URL on its update check and compares the
 * `@version` it finds there, so **bump `@version` here in the same commit as anything that ships**,
 * then cut a release with `pnpm release`. A release without a bump is invisible to every installed
 * copy. Rationale in docs/PLAN.md §1 (D9); install steps in README.md.
 */
