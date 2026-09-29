import { describe, expect, it } from 'vitest';
import { liveFixtures, syntheticDoc } from './fixtures';
import { extract } from '../src/grok-export/dom/extract';
import { serialize } from '../src/grok-export/dom/serialize';
import { SELECTORS, WORD_JOINER } from '../src/grok-export/dom/selectors';

/**
 * The behaviors v1 claims. Red until M2 (`extract.ts`, `serialize.ts`) and M3 (the quirk rules)
 * exist. Every case runs against the synthetic fixture and, when one is present, against each
 * raw capture under tests/fixtures/grok/live/.
 */

function cases() {
  const list = [{ label: 'synthetic', doc: syntheticDoc() }];
  for (const fixture of liveFixtures()) {
    list.push({ label: fixture.name, doc: fixture.doc });
  }
  return list;
}

describe.each(cases())('$label', ({ doc }) => {
  const nodes = [...doc.querySelectorAll(SELECTORS.message)];

  it('extracts one message per mounted node, with role from data-testid', () => {
    const messages = extract(doc);
    expect(messages).toHaveLength(nodes.length);
    for (const message of messages) {
      expect(['user', 'assistant']).toContain(message.role);
      expect(message.body).toBeTruthy();
    }
  });

  it('serializes every message to non-empty Markdown', () => {
    for (const node of nodes) {
      expect(serialize(node).trim()).not.toBe('');
    }
  });

  it('drops the thinking block', () => {
    for (const node of nodes) {
      if (!node.querySelector(SELECTORS.thinking)) continue;
      expect(serialize(node)).not.toContain('Worked for');
    }
  });

  it('drops the sources pill and the action buttons', () => {
    for (const node of nodes) {
      const markdown = serialize(node);
      expect(markdown).not.toMatch(/^\d+ sources$/m);
      expect(markdown).not.toContain(`${WORD_JOINER}Edit`);
    }
  });

  it("never emits Grok's leaked node attribute", () => {
    for (const node of nodes) {
      expect(serialize(node)).not.toContain('[object Object]');
    }
  });

  it('drops the citation tags without damaging the sentences they followed', () => {
    for (const node of nodes) {
      const citations = [...node.querySelectorAll(SELECTORS.citation)];
      if (citations.length === 0) continue;
      const markdown = serialize(node);

      expect(markdown).not.toContain(WORD_JOINER);
      for (const citation of citations) {
        expect(markdown).not.toContain(citation.getAttribute('href') as string);
        expect(markdown).not.toContain(
          (citation.textContent ?? '').replace(WORD_JOINER, '').trim(),
        );
      }

      // Grok puts the tag after the sentence-ending punctuation. Dropping it must not leave the
      // comma or period it used to be attached to stranded on its own.
      expect(markdown).not.toMatch(/[,;]\s*\./);
      expect(markdown).not.toMatch(/^\s*[.,;]\s*$/m);
    }
  });

  it('leaves no hard break where a citation tag closed a paragraph', () => {
    for (const node of nodes) {
      const body = node.querySelector(SELECTORS.bodyRoot);
      if (!body || !body.querySelector(SELECTORS.citation)) continue;
      // Grok writes `<text>\n<a class="citation">` at the end of a paragraph. With the tag dropped
      // the newline is trailing, and a hard break there renders as nothing.
      expect(serialize(node)).not.toMatch(/[ \t]+\n(?=\n|$)/);
    }
  });

  it('emits TeX from the KaTeX annotation and does not also emit the fallback', () => {
    for (const node of nodes) {
      const annotation = node.querySelector(SELECTORS.katexTexAnnotation);
      if (!annotation) continue;
      const tex = annotation.textContent as string;
      const markdown = serialize(node);

      expect(markdown).toContain(tex);
      // The aria-hidden katex-html subtree repeats the same characters. Emitting both doubles the
      // equation: one TeX plus one run of plain glyphs.
      const plain = tex
        .replace(/\\[a-zA-Z]+|[{}$\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (plain.length > 3) {
        expect(
          markdown.match(new RegExp(escapeRegExp(plain), 'g'))?.length ?? 0,
        ).toBeLessThan(2);
      }
    }
  });

  it('turns pre-wrap and <br> into hard line breaks', () => {
    for (const node of nodes) {
      const body = node.querySelector(SELECTORS.bodyRoot);
      if (!body) continue;

      const preWrap = [...body.querySelectorAll('p')].find(
        (p) =>
          (p as HTMLElement).style.whiteSpace === 'pre-wrap' &&
          p.textContent?.includes('\n'),
      );
      if (preWrap) {
        // The newline is in the source text, so the export must contain a break at that point.
        expect(serialize(node)).toMatch(/\S[ \t]*\n[ \t]*\S/);
      }

      const withBr = [...body.querySelectorAll('p')].find((p) =>
        p.querySelector('br'),
      );
      if (withBr) {
        const markdown = serialize(node);
        expect(markdown).not.toContain('<br>');
        expect(markdown).toMatch(/\S[ \t]*\n[ \t]*\S/);
      }
    }
  });

  it('exports a code block as one fenced block, labelled from its header', () => {
    for (const node of nodes) {
      const body = node.querySelector(SELECTORS.bodyRoot);
      const blocks = body
        ? [...body.querySelectorAll(SELECTORS.codeBlock)]
        : [];
      if (blocks.length === 0) continue;

      const markdown = serialize(node);

      // One opening and one closing fence per block: the code text is not emitted as prose too.
      expect(markdown.match(/^```/gm)?.length ?? 0).toBe(blocks.length * 2);

      // The header is chrome, and it carries text: a language label plus a copy button whose two
      // states read `Copy` and `Copied`. None of that may read as part of the answer.
      expect(
        body.querySelector(SELECTORS.codeHeader)?.textContent?.trim(),
      ).toBeTruthy();
      expect(markdown).not.toContain('Copied');
      expect(markdown).not.toMatch(/^Copy$/m);

      for (const block of blocks) {
        const label =
          block.querySelector(SELECTORS.codeLanguage)?.textContent?.trim() ??
          '';
        const code = block.querySelector('pre')?.textContent ?? '';

        expect(markdown).toContain('```' + label.toLowerCase());
        expect(markdown).toContain(code.trim().split('\n')[0]);
      }
    }
  });

  it('keeps the generic GFM shapes the fixture contains', () => {
    for (const node of nodes) {
      const body = node.querySelector(SELECTORS.bodyRoot);
      if (!body) continue;
      const markdown = serialize(node);

      if (body.querySelector('h2')) expect(markdown).toMatch(/^## /m);
      if (body.querySelector('ul li')) expect(markdown).toMatch(/^[-*] /m);
      if (body.querySelector('ol li')) expect(markdown).toMatch(/^\d+\. /m);
      if (body.querySelector('hr'))
        expect(markdown).toMatch(/^(---|\*\*\*|___)$/m);
      if (body.querySelector('table')) expect(markdown).toContain('|');
    }
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
