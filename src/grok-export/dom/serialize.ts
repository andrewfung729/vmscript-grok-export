import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { PRE_WRAP, SELECTORS, WORD_JOINER } from './selectors';

/**
 * DOM -> Markdown.
 *
 * Narrow on purpose: `(element) => string`, with no browser and no scrolling, so it runs in the
 * jsdom test harness against a fixture. `element` is a mounted message node, and the body is read
 * from `SELECTORS.bodyRoot` inside it.
 *
 * The citation rules live here too, because the word-joiner quirk is theirs: `serialize` writes
 * them into the prose and `citationsOf` exposes the same nodes as data, so the document seam can
 * list them without re-deriving the text rule.
 *
 * Nothing here mutates the page. The message is cloned before any preprocessing.
 */

const HARD_BREAK = '  \n';

/** Backticks around a code block. Turndown's own fence is the same three. */
const FENCE = '```';

/** A source Grok linked inside a body, in document order. */
export interface Citation {
  /** The source name Grok shows, with the word joiner stripped. May be empty. */
  label: string;
  href: string | null;
}

function bodyOf(element: Element): Element | null {
  return element.matches(SELECTORS.bodyRoot)
    ? element
    : element.querySelector(SELECTORS.bodyRoot);
}

/**
 * The one place the citation-text rule is applied. Grok prefixes the source name with a word joiner,
 * which yields no glyph but survives into Markdown.
 */
export function citationLabel(element: Element): string {
  return (element.textContent ?? '').split(WORD_JOINER).join('').trim();
}

/**
 * A Markdown link, with the same `(`/`)` escaping turndown applies to its own links. A hand-built
 * link has to match, or a paren in a URL ends the target early.
 */
export function markdownLink(text: string, href: string): string {
  return `[${text}](${href.replace(/([()])/g, '\\$1')})`;
}

/**
 * The citations inside a message body, in document order. This is the **only** place source URLs
 * exist in the DOM; Grok's `N sources` drawer is a click-to-open search log whose entries are not
 * links, and it holds far more sources than the body cites. See docs/PLAN.md §2.7.
 */
export function citationsOf(messageElement: Element): Citation[] {
  const body = bodyOf(messageElement);
  if (!body) return [];

  return [...body.querySelectorAll(SELECTORS.citation)].map((node) => ({
    label: citationLabel(node),
    href: node.getAttribute('href'),
  }));
}

function hasPreWrap(element: Element): boolean {
  return (
    (element instanceof HTMLElement || 'style' in element) &&
    (element as HTMLElement).style?.whiteSpace === PRE_WRAP
  );
}

/**
 * Grok preserves line breaks with an inline `white-space: pre-wrap`, so a `<p>` whose `innerText`
 * contains `\n` renders as several visual lines while holding one text node. Turndown's default
 * text handling collapses that to a space.
 *
 * Rewriting each `\n` into a `<br>` on a clone lets the one `br` rule handle both spellings of a
 * line break, and covers the same style on `<td>` and `<li>`.
 */
function expandPreWrap(root: Element): void {
  const wrapped = [root, ...root.querySelectorAll('*')].filter(hasPreWrap);

  for (const element of wrapped) {
    // KaTeX subtrees are replaced wholesale by a rule below; their text is not prose.
    const walker = root.ownerDocument.createTreeWalker(
      element,
      4 /* NodeFilter.SHOW_TEXT */,
    );
    const pending: { node: Text; parts: string[] }[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest('.katex')) continue;

      // Grok writes `<br>\n<text>`: the newline after a `<br>` is source formatting, not a second
      // line break. Expanding it too would turn one break into a paragraph break.
      let data = node.data;
      const previous = node.previousSibling;
      if (
        previous?.nodeType === 1 &&
        previous.nodeName === 'BR' &&
        data.startsWith('\n')
      ) {
        data = data.slice(1);
        node.data = data;
      }

      if (!data.includes('\n')) continue;
      pending.push({ node, parts: data.split('\n') });
    }

    for (const { node, parts } of pending) {
      const fragment = root.ownerDocument.createDocumentFragment();
      parts.forEach((part, index) => {
        if (index > 0) fragment.append(root.ownerDocument.createElement('br'));
        fragment.append(root.ownerDocument.createTextNode(part));
      });
      node.replaceWith(fragment);
    }
  }
}

/**
 * Whether nothing that renders follows this node inside its parent. A run of `<br>`s counts as
 * nothing, so only the last one of a run is "trailing".
 */
function endsBlock(node: Node): boolean {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === 3) {
      if ((next.textContent ?? '').trim() !== '') return false;
      continue;
    }
    if (isElement(next) && next.nodeName === 'BR') continue;
    return false;
  }
  return true;
}

function texOf(element: Element): string | null {
  const annotation = element.querySelector(SELECTORS.katexTexAnnotation);
  const tex = annotation?.textContent?.trim();
  return tex ? tex : null;
}

/**
 * The readable fallback when Grok kept no TeX. The MathML carries the same characters as the
 * `aria-hidden` HTML, so one of the two is enough; the annotation is dropped so the TeX string
 * cannot leak in as prose.
 */
function readableMath(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll('annotation')
    .forEach((annotation) => annotation.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Accepts a message node or a body root directly, so a caller that already resolved the body does
 * not have to wrap it back up.
 */
export function serialize(messageElement: Element): string {
  const body = bodyOf(messageElement);
  if (!body) return '';

  const clone = body.cloneNode(true) as Element;

  // Grok tags the paragraph a source came from with a trailing citation, after the sentence-ending
  // punctuation. v1 collects the sources into a per-turn list instead of leaving them inline, so the
  // tag is dropped here — *before* `expandPreWrap`, because the newline that separated the tag from
  // the prose would otherwise survive the expansion as a trailing hard break. See docs/PLAN.md §2.7.
  clone
    .querySelectorAll(SELECTORS.citation)
    .forEach((citation) => citation.remove());

  expandPreWrap(clone);

  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  turndown.use(gfm);

  // The collapsed thinking disclosure sits inside the bubble. Its label is a duration, so it would
  // read as part of the answer.
  turndown.remove(
    (node) => isElement(node) && node.matches(SELECTORS.thinking),
  );

  // The aria-hidden glyph run duplicates the TeX annotation. Emitting both doubles the equation.
  turndown.remove((node) => isElement(node) && node.matches('.katex-html'));

  turndown.addRule('katexDisplay', {
    filter: (node) => isElement(node) && node.matches('.katex-display'),
    replacement: (_content, node) => {
      const tex = texOf(node);
      return tex ? `\n\n$$\n${tex}\n$$\n\n` : ` ${readableMath(node)} `;
    },
  });

  turndown.addRule('katexInline', {
    filter: (node) => isElement(node) && node.matches('.katex'),
    replacement: (_content, node) => {
      const tex = texOf(node);
      return tex ? `$${tex}$` : readableMath(node);
    },
  });

  // `br` is the one place line breaks are expressed after `expandPreWrap`. A break with nothing
  // after it renders as nothing, and turndown would write it as two trailing spaces on the line.
  turndown.addRule('hardBreak', {
    filter: 'br',
    replacement: (_content, node) => (endsBlock(node) ? '' : HARD_BREAK),
  });

  // Grok's code block is one fenced block with its chrome still attached: a header holding the
  // language label and a copy button — whose two states, `Copy` and `Copied`, both sit in the DOM —
  // and then the `pre` with the code. Turndown's own `fencedCodeBlock` rule reads the language from
  // `code[class^="language-"]`, which Grok does not write, so it would emit the header as prose and
  // a bare fence. One rule over the whole block replaces both.
  turndown.addRule('codeBlock', {
    filter: (node) => isElement(node) && node.matches(SELECTORS.codeBlock),
    replacement: (_content, node) => fencedCode(node),
  });

  return turndown.turndown(clone.innerHTML).trim();
}

/**
 * A block Grok has not rendered yet holds no `pre`: the text arrives when the block scrolls into
 * view, and v1 does not scroll. Such a block is skipped rather than emitted as an empty fence.
 */
function fencedCode(block: Element): string {
  const code = (
    block.querySelector(SELECTORS.codeText)?.textContent ?? ''
  ).replace(/\n$/, '');
  if (!code) return '';

  const label =
    block.querySelector(SELECTORS.codeLanguage)?.textContent?.trim() ?? '';
  const language = label.toLowerCase().replace(/\s+/g, '-');

  return `\n\n${FENCE}${language}\n${code}\n${FENCE}\n\n`;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}
