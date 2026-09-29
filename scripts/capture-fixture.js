/**
 * Capture a grok.com conversation as a test fixture.
 *
 * Not a module and not part of the userscript build. Two ways to run it:
 *
 * 1. Preferred, when an agent has the `chrome-devtools` MCP server: call `evaluate_script` with this
 *    IIFE as `function` and `filePath: 'tests/fixtures/grok/live/<conversationId>.json'`. The MCP
 *    server writes the file itself, so no capture ever passes through the model's context. That
 *    requires `--workspace=<repo root>` on the server (see .mcp.json); without it, file writes are
 *    restricted to the OS temp directory and the call is refused.
 * 2. Otherwise: paste the whole file into the DevTools console on an open grok.com conversation,
 *    and move the download into tests/fixtures/grok/live/ yourself.
 *
 * Format: {provenance: {...}, transcriptHTML, messages: [{id, role, ariaLabel, rowClass, rowTransform}]}.
 * `transcriptHTML` is the whole `[data-testid="chat-transcript-scroller"]` subtree, so the row
 * nesting, the inline `transform: translateY(Npx)` offsets, and the zero-child spacer rows are the
 * page's own. Capturing a message node's `parentElement` instead would capture one row, not the
 * conversation. See docs/PLAN.md §2.5.
 *
 * The output is gitignored: it carries the user's own conversation text. The committed test
 * substrate is tests/fixtures/grok/synthetic/.
 */
(() => {
  const conversationId = location.pathname.split('/c/')[1]?.split('?')[0] ?? null;
  if (!conversationId) {
    throw new Error('Not a conversation page: no /c/<uuid> in the path.');
  }

  const count = (selector) => document.querySelectorAll(selector).length;
  const nodes = [...document.querySelectorAll('div[id^="response-"]')];
  const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');

  const payload = {
    provenance: {
      url: location.href,
      title: document.title,
      conversationId,
      capturedAt: new Date().toISOString(),
      capturedBy: 'scripts/capture-fixture.js',
      page: 'raw',
      shape: 'transcript',
      userAgent: navigator.userAgent,
      counts: {
        responseNodes: nodes.length,
        userMessages: count('.message-bubble[data-testid="user-message"]'),
        assistantMessages: count('.message-bubble[data-testid="assistant-message"]'),
        bodyRoots: count('.message-bubble .response-content-markdown'),
        thinkingContainers: count('.thinking-container'),
        citations: count('a.citation'),
        katexTexAnnotations: count('annotation[encoding="application/x-tex"]'),
        codeBlocks: count('div[data-testid="code-block"]'),
        preElements: count('pre'),
        footnoteSections: count('section[data-footnotes]'),
        timeElements: count('time'),
        tables: count('.response-content-markdown table'),
        headings2: count('.response-content-markdown h2'),
        headings3: count('.response-content-markdown h3'),
        listItems: count('.response-content-markdown li'),
        brElements: count('.response-content-markdown br'),
        transcriptScrollers: count('[data-testid="chat-transcript-scroller"]'),
        scrollerRows: count('[data-testid="chat-transcript-scroller"] > div > div'),
      },
    },
    transcriptHTML: scroller?.outerHTML ?? null,
    messages: nodes.map((node) => {
      const bubble = node.querySelector('.message-bubble');
      return {
        id: node.id,
        role: bubble?.getAttribute('data-testid') ?? null,
        ariaLabel: bubble?.getAttribute('aria-label') ?? null,
        rowClass: node.parentElement?.className ?? null,
        rowTransform: node.parentElement?.getAttribute('style') ?? null,
      };
    }),
  };

  console.table(payload.provenance.counts);
  console.log(
    payload.provenance.counts.codeBlocks === 0
      ? 'WARNING: no code block on this page. Capture a conversation that has one.'
      : `OK: ${payload.provenance.counts.codeBlocks} code block(s) present.`,
  );

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${conversationId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);

  return payload;
})();
