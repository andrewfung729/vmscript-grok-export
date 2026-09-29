import { describe, expect, it } from 'vitest';
import { liveFixtures, syntheticDoc } from './fixtures';
import {
  PRE_WRAP,
  ROLE_TEST_ID,
  SELECTORS,
  WORD_JOINER,
} from '../src/grok-export/dom/selectors';

/**
 * The fixture contract. These tests describe the captured DOM, not the exporter, so they are green
 * before any parsing code exists. If one of them breaks, the fixture is wrong, not the exporter.
 */

function assertStructuralInvariants(doc: Document, label: string) {
  const messages = [...doc.querySelectorAll(SELECTORS.message)];
  expect(messages.length, `${label}: mounted messages`).toBeGreaterThan(0);

  // Every message node holds exactly one bubble, and the bubble carries a known role.
  for (const node of messages) {
    const bubbles = node.querySelectorAll(SELECTORS.bubble);
    expect(bubbles.length, `${label}: one bubble per message node`).toBe(1);
    const role = bubbles[0].getAttribute('data-testid');
    expect(
      Object.values(ROLE_TEST_ID),
      `${label}: role is a known test id`,
    ).toContain(role);
  }

  // The extraction root is present on every message, and never counts a spacer row.
  expect(
    doc.querySelectorAll(SELECTORS.bodyRoot).length,
    `${label}: body roots`,
  ).toBe(messages.length);

  // Thinking is a child of the bubble, which is why the narrow root is required.
  for (const thinking of doc.querySelectorAll(SELECTORS.thinking)) {
    expect(
      thinking.closest(SELECTORS.bubble),
      `${label}: thinking sits inside a bubble`,
    ).not.toBe(null);
  }

  // Citation text starts with the word joiner, and never leaks it into the link text we want.
  for (const citation of doc.querySelectorAll(SELECTORS.citation)) {
    expect(
      citation.textContent?.startsWith(WORD_JOINER),
      `${label}: citation carries U+2060`,
    ).toBe(true);
    expect(
      citation.getAttribute('href'),
      `${label}: citation href`,
    ).toBeTruthy();
  }

  // pre-wrap is an inline style attribute, so jsdom can see it without a stylesheet.
  const preWrap = [...doc.querySelectorAll('p')].filter(
    (p) => (p as HTMLElement).style.whiteSpace === PRE_WRAP,
  );
  expect(
    preWrap.length,
    `${label}: paragraphs carrying inline pre-wrap`,
  ).toBeGreaterThan(0);
}

describe('synthetic fixture', () => {
  const doc = syntheticDoc();

  it('holds the message set the tests assume', () => {
    expect(doc.querySelectorAll(SELECTORS.message).length).toBe(4);
    expect(
      doc.querySelectorAll(
        `.message-bubble[data-testid="${ROLE_TEST_ID.user}"]`,
      ).length,
    ).toBe(2);
    expect(
      doc.querySelectorAll(
        `.message-bubble[data-testid="${ROLE_TEST_ID.assistant}"]`,
      ).length,
    ).toBe(2);
  });

  it('holds every Markdown shape v1 claims to handle', () => {
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} h2`).length,
    ).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} h3`).length,
    ).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} ul li`).length,
    ).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} ol li`).length,
    ).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} hr`).length,
    ).toBeGreaterThan(0);
    expect(doc.querySelectorAll(SELECTORS.table).length).toBe(1);
    expect(doc.querySelectorAll(SELECTORS.codeBlock).length).toBe(1);
    expect(doc.querySelectorAll(SELECTORS.katexTexAnnotation).length).toBe(2);
    expect(
      doc.querySelectorAll(`${SELECTORS.bodyRoot} br`).length,
    ).toBeGreaterThan(0);
  });

  it('holds the text that must NOT reach the export', () => {
    // Widening the root to `.message-bubble` must fail: these labels are visible text.
    expect(
      doc.querySelectorAll(SELECTORS.actionButtons).length,
    ).toBeGreaterThan(0);
    expect(
      doc.querySelector(SELECTORS.actionButtons)?.textContent?.trim(),
    ).toBeTruthy();
    expect(doc.body.textContent).toContain('sources');

    // The code block's header is the second control that carries text: the language label, and a copy
    // button whose two states read `Copy` and `Copied`.
    const header = doc.querySelector(SELECTORS.codeHeader);
    expect(header?.textContent?.trim()).toBeTruthy();
    expect(doc.querySelectorAll(SELECTORS.codeLanguage).length).toBeGreaterThan(
      0,
    );
    expect(
      doc.querySelector(SELECTORS.codeText)?.textContent?.trim(),
    ).toBeTruthy();
  });

  it('satisfies every structural invariant', () => {
    assertStructuralInvariants(doc, 'synthetic');
  });
});

describe('live fixtures', () => {
  const fixtures = liveFixtures();

  it.runIf(fixtures.length === 0)(
    'live/ is empty, so behavioral coverage is synthetic only',
    () => {
      expect(fixtures).toHaveLength(0);
    },
  );

  for (const fixture of fixtures) {
    describe(fixture.name, () => {
      it('provenance counts match the captured DOM', () => {
        const counts = fixture.provenance.counts as Record<string, number>;
        expect(fixture.doc.querySelectorAll(SELECTORS.message).length).toBe(
          counts.responseNodes,
        );
        expect(fixture.doc.querySelectorAll(SELECTORS.bodyRoot).length).toBe(
          counts.bodyRoots,
        );
        expect(fixture.doc.querySelectorAll(SELECTORS.thinking).length).toBe(
          counts.thinkingContainers,
        );
        expect(fixture.doc.querySelectorAll(SELECTORS.citation).length).toBe(
          counts.citations,
        );
        expect(
          fixture.doc.querySelectorAll(SELECTORS.katexTexAnnotation).length,
        ).toBe(counts.katexTexAnnotations);
        expect(fixture.doc.querySelectorAll(SELECTORS.table).length).toBe(
          counts.tables,
        );
        expect(fixture.doc.querySelectorAll(SELECTORS.codeBlock).length).toBe(
          counts.codeBlocks,
        );
        expect(fixture.doc.querySelectorAll(SELECTORS.codeText).length).toBe(
          counts.preElements,
        );
      });

      it('satisfies every structural invariant', () => {
        assertStructuralInvariants(fixture.doc, fixture.name);
      });

      it('selects messages from the transcript without catching the spacer rows', () => {
        const counts = fixture.provenance.counts as Record<string, number>;
        if (typeof counts.scrollerRows !== 'number') return;

        // The track holds spacer rows as well as message rows, so a row count is not a message
        // count. The id-prefix selector is what tells them apart.
        expect(counts.scrollerRows).toBeGreaterThan(counts.responseNodes);
        expect(
          fixture.doc.querySelectorAll(SELECTORS.transcriptScroller).length,
        ).toBe(1);

        const spacers = [
          ...fixture.doc.querySelectorAll(
            `${SELECTORS.transcriptScroller} > div > div`,
          ),
        ].filter((row) => !row.querySelector(SELECTORS.message));
        expect(spacers.length).toBeGreaterThan(0);
        for (const spacer of spacers) {
          expect(spacer.getAttribute('style')).toMatch(/transform: translateY/);
        }
      });
    });
  }
});
