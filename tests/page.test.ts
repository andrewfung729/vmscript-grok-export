import { describe, expect, it } from 'vitest';
import {
  buildExport,
  readPageState,
  readTheme,
  themeFrom,
  watchPageState,
  watchTheme,
} from '../src/grok-export/page';
import { syntheticDoc } from './fixtures';

/**
 * The regression this file exists for: the panel mounted at `document-idle`, read the page once,
 * found no messages because grok.com had not rendered the transcript yet, and said so forever.
 */

const CONVERSATION_ID = '6d27fe4b-9bfc-4d9f-ad88-3ac7e108e1a9';
const PATHNAME = `/c/${CONVERSATION_ID}`;

/** The synthetic transcript, moved into the live jsdom document. */
function mountTranscript() {
  document.body.innerHTML = syntheticDoc().body.innerHTML;
}

function unmountTranscript() {
  document.body.innerHTML = '';
}

function setPathname(pathname: string) {
  window.history.replaceState({}, '', pathname);
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('readPageState', () => {
  it('is not-a-conversation outside /c/', () => {
    mountTranscript();
    expect(readPageState(document, '/')).toEqual({
      kind: 'not-a-conversation',
    });
  });

  it('is loading, not empty, while grok.com has not rendered the transcript', () => {
    unmountTranscript();
    expect(readPageState(document, PATHNAME)).toEqual({ kind: 'loading' });
  });

  it('is empty once the transcript is mounted and holds nothing', () => {
    const scroller = document.createElement('div');
    scroller.setAttribute('data-testid', 'chat-transcript-scroller');
    document.body.innerHTML = '';
    document.body.append(scroller);

    expect(readPageState(document, PATHNAME)).toEqual({ kind: 'empty' });
  });

  it('reports the mounted message count', () => {
    mountTranscript();
    expect(readPageState(document, PATHNAME)).toEqual({
      kind: 'ready',
      count: 4,
    });
  });
});

describe('watchPageState', () => {
  const read = () => readPageState(document, PATHNAME);

  it('recovers when the transcript renders after the panel mounts', async () => {
    unmountTranscript();
    setPathname(PATHNAME);

    const seen: string[] = [];
    const stop = watchPageState(read, (state) => seen.push(state.kind), {
      debounceMs: 1,
    });

    expect(seen).toEqual([]);
    expect(read()).toEqual({ kind: 'loading' });

    mountTranscript();
    await settle();

    expect(seen).toEqual(['ready']);
    stop();
  });

  it('does not fire for an unchanged state', async () => {
    mountTranscript();
    const seen: string[] = [];
    const stop = watchPageState(read, (state) => seen.push(state.kind), {
      debounceMs: 1,
    });

    const noise = document.createElement('div');
    document.body.append(noise);
    await settle();

    expect(seen).toEqual(['ready']);
    stop();
  });

  it('reads the pathname fresh, so a client-side navigation is picked up', async () => {
    mountTranscript();
    setPathname('/');

    const seen: string[] = [];
    const stop = watchPageState(read, (state) => seen.push(state.kind), {
      debounceMs: 1,
    });

    // grok.com swaps the conversation without reloading the userscript.
    setPathname(PATHNAME);
    document.body.append(document.createElement('div'));
    await settle();

    expect(seen).toEqual(['ready']);
    stop();
  });

  it('reports the new count when the virtualized transcript grows', async () => {
    mountTranscript();
    setPathname(PATHNAME);

    const counts: number[] = [];
    const stop = watchPageState(
      read,
      (state) => {
        if (state.kind === 'ready') counts.push(state.count);
      },
      { debounceMs: 1 },
    );

    await settle();

    // Scrolling mounts a new row; the panel must not keep showing the old number.
    const track = document.querySelector(
      '[data-testid="chat-transcript-scroller"] > div',
    );
    const extra = document.createElement('div');
    extra.innerHTML = `
      <div id="response-99999999-9999-4999-8999-999999999999">
        <div class="message-bubble" data-testid="user-message" aria-label="You">
          <div class="response-content-markdown"><p style="white-space: pre-wrap;">one more</p></div>
        </div>
      </div>`;
    track?.append(extra.firstElementChild as Element);

    await settle();
    expect(counts.at(-1)).toBe(5);
    stop();
  });

  it('stops when asked', async () => {
    unmountTranscript();
    setPathname(PATHNAME);

    const seen: string[] = [];
    const stop = watchPageState(read, (state) => seen.push(state.kind), {
      debounceMs: 1,
    });
    stop();

    mountTranscript();
    await settle();
    expect(seen).toEqual([]);
  });
});

describe('themeFrom', () => {
  it('reads a decided scheme', () => {
    expect(themeFrom('dark', false)).toBe('dark');
    expect(themeFrom('light', true)).toBe('light');
  });

  it('leaves an undecided page to the operating system rather than to dark', () => {
    expect(themeFrom('light dark', true)).toBe('dark');
    expect(themeFrom('light dark', false)).toBe('light');
    expect(themeFrom('dark light', false)).toBe('light');
  });

  it('treats normal and an empty value as light', () => {
    // jsdom has no `color-scheme`, so the empty string is the case the suite actually runs in.
    expect(themeFrom('normal', false)).toBe('light');
    expect(themeFrom('', false)).toBe('light');
  });
});

describe('readTheme', () => {
  const set = (value: string) => {
    document.documentElement.style.colorScheme = value;
  };

  it('reads the computed color-scheme off <html>', () => {
    set('dark');
    expect(readTheme(window)).toBe('dark');
    set('light');
    expect(readTheme(window)).toBe('light');
  });

  it('follows the operating system when the page hands the choice over', () => {
    set('light dark');
    // jsdom has no `matchMedia`, which is also what a browser would report as "not dark".
    expect(readTheme(window)).toBe('light');
  });
});

describe('watchTheme', () => {
  it('fires when grok rewrites the theme on <html>', async () => {
    document.documentElement.style.colorScheme = 'dark';
    const seen: string[] = [];
    const stop = watchTheme(
      () => readTheme(window),
      (theme) => seen.push(theme),
    );

    document.documentElement.style.colorScheme = 'light';
    await settle();

    expect(seen).toEqual(['light']);
    stop();
  });

  it('ignores a mutation that does not change the theme', async () => {
    document.documentElement.style.colorScheme = 'dark';
    const seen: string[] = [];
    const stop = watchTheme(
      () => readTheme(window),
      (theme) => seen.push(theme),
    );

    // A class grok adds for something else: the observer fires, the theme does not change.
    document.documentElement.classList.add('scheme-light');
    await settle();

    expect(seen).toEqual([]);
    stop();
  });
});

describe('buildExport', () => {
  const context = {
    pathname: PATHNAME,
    url: `https://grok.com${PATHNAME}`,
    documentTitle: 'Capital gains tax and revenue - Grok',
    now: new Date(2026, 8, 29),
  };

  it('returns nothing when the page has no messages', () => {
    unmountTranscript();
    expect(buildExport(document, context)).toBeNull();
  });

  it('names the file after the conversation title', () => {
    mountTranscript();
    const payload = buildExport(document, context);
    expect(payload?.filename).toBe('capital-gains-tax-and-revenue.md');
    expect(payload?.count).toBe(4);
  });

  it('writes the frontmatter and the turn callouts', () => {
    mountTranscript();
    const markdown = buildExport(document, context)?.markdown ?? '';

    expect(markdown).toContain('title: Capital gains tax and revenue');
    expect(markdown).toContain(`conversationId: ${CONVERSATION_ID}`);
    expect(markdown).toContain('exported: 2026-09-29');
    expect(markdown).toContain('messageCount: 4');
    expect(markdown).toContain('> [!user] User');
    expect(markdown).toContain('> [!grok] Grok');
  });
});
