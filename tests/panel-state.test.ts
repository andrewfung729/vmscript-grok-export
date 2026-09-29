import { describe, expect, it } from 'vitest';
import {
  actionText,
  announceText,
  clampLayout,
  DEFAULT_LAYOUT,
  exportedText,
  isFolded,
  readLayout,
  statusText,
  writeLayout,
  type PanelLayout,
  type StorageLike,
} from '../src/grok-export/panel-state';

/**
 * The panel's memory and its copy. `page.test.ts` owns when the panel may report a state; this file
 * owns what it reports, and where it puts itself while reporting it.
 */

const KEY = 'grok-export:layout';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  const storage: StorageLike = {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
  return { storage, data };
}

const layout: PanelLayout = { collapsed: true, top: 40, left: 60 };

describe('readLayout', () => {
  it('is the default with no storage at all', () => {
    expect(readLayout(undefined)).toEqual(DEFAULT_LAYOUT);
  });

  it('is the default before anything has been written', () => {
    expect(readLayout(fakeStorage().storage)).toEqual(DEFAULT_LAYOUT);
  });

  it('round-trips a written layout', () => {
    const { storage } = fakeStorage();
    writeLayout(storage, layout);
    expect(readLayout(storage)).toEqual(layout);
  });

  it('falls back per field rather than throwing on a junk value', () => {
    // This key lives in grok.com's own localStorage: another script, or an older version, can leave
    // anything here, and the panel still has to mount.
    const cases: Array<[string, PanelLayout]> = [
      ['not json at all', DEFAULT_LAYOUT],
      ['null', DEFAULT_LAYOUT],
      ['[]', DEFAULT_LAYOUT],
      ['"a string"', DEFAULT_LAYOUT],
      ['{"collapsed":"yes","top":"1","left":null}', DEFAULT_LAYOUT],
      ['{"collapsed":true}', { collapsed: true, top: 96, left: 96 }],
      ['{"top":12}', { collapsed: false, top: 12, left: 96 }],
      ['{"top":null,"left":-4}', { collapsed: false, top: 96, left: -4 }],
    ];

    for (const [raw, expected] of cases) {
      expect(readLayout(fakeStorage({ [KEY]: raw }).storage), raw).toEqual(
        expected,
      );
    }
  });

  it('survives a storage that throws on read', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLayout(hostile)).toEqual(DEFAULT_LAYOUT);
    expect(() => writeLayout(hostile, layout)).not.toThrow();
  });
});

describe('clampLayout', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 100 };

  it('leaves a layout that already fits', () => {
    expect(clampLayout(layout, viewport, size)).toEqual({
      collapsed: true,
      top: 40,
      left: 60,
    });
  });

  it('pulls back a panel remembered on a larger display', () => {
    expect(
      clampLayout({ ...layout, top: 4000, left: 4000 }, viewport, size),
    ).toEqual({
      collapsed: true,
      top: 700,
      left: 800,
    });
  });

  it('pulls back a negative position', () => {
    expect(
      clampLayout({ ...layout, top: -50, left: -50 }, viewport, size),
    ).toEqual({
      collapsed: true,
      top: 0,
      left: 0,
    });
  });

  it('pins to the corner when the panel is bigger than the viewport', () => {
    expect(
      clampLayout(
        layout,
        { width: 100, height: 50 },
        { width: 200, height: 100 },
      ),
    ).toEqual({ collapsed: true, top: 0, left: 0 });
  });

  it('keeps the folded flag, which is not a position', () => {
    expect(
      clampLayout({ ...layout, collapsed: false }, viewport, size).collapsed,
    ).toBe(false);
  });
});

describe('isFolded', () => {
  const open: PanelLayout = { ...layout, collapsed: false };
  const folded: PanelLayout = { ...layout, collapsed: true };

  it('is folded when the user folded it', () => {
    expect(isFolded({ kind: 'ready', count: 4 }, folded, false)).toBe(true);
  });

  it('is folded where there is no conversation to export', () => {
    expect(isFolded({ kind: 'not-a-conversation' }, open, false)).toBe(true);
  });

  it('opens anyway when the user asked to see it', () => {
    // The panel is the only control on screen when folded, so this is the clause that keeps a click
    // on the chip from ever being refused, on any page.
    expect(isFolded({ kind: 'not-a-conversation' }, open, true)).toBe(false);
    expect(isFolded({ kind: 'ready', count: 4 }, open, true)).toBe(false);
  });

  it('stays folded when the user folded it, even after asking to see it', () => {
    expect(isFolded({ kind: 'ready', count: 4 }, folded, true)).toBe(true);
  });

  it('shows the panel on a conversation the user left open', () => {
    expect(isFolded({ kind: 'ready', count: 4 }, open, false)).toBe(false);
    expect(isFolded({ kind: 'loading' }, open, false)).toBe(false);
    expect(isFolded({ kind: 'empty' }, open, false)).toBe(false);
  });
});

describe('statusText', () => {
  it('counts one message in the singular', () => {
    expect(statusText({ kind: 'ready', count: 1 })).toContain(
      '1 message mounted',
    );
  });

  it('counts many messages in the plural', () => {
    expect(statusText({ kind: 'ready', count: 4 })).toContain(
      '4 messages mounted',
    );
  });

  it('names the limit once, on the line that carries the count', () => {
    expect(statusText({ kind: 'ready', count: 4 })).toContain('no scroll');
  });

  it('says something for every state', () => {
    for (const state of [
      { kind: 'loading' },
      { kind: 'empty' },
      { kind: 'not-a-conversation' },
    ] as const) {
      expect(statusText(state).length).toBeGreaterThan(0);
    }
  });
});

describe('announceText', () => {
  it('carries no count, because the count changes as the user scrolls', () => {
    expect(announceText({ kind: 'ready', count: 7 })).not.toMatch(/\d/);
  });

  it('has a line for every state', () => {
    for (const state of [
      { kind: 'ready', count: 4 },
      { kind: 'loading' },
      { kind: 'empty' },
      { kind: 'not-a-conversation' },
    ] as const) {
      expect(announceText(state).length).toBeGreaterThan(0);
    }
  });
});

describe('exportedText', () => {
  it('counts one message in the singular', () => {
    expect(exportedText(1)).toBe('Exported 1 message to your downloads.');
  });

  it('counts many messages in the plural', () => {
    expect(exportedText(4)).toBe('Exported 4 messages to your downloads.');
  });
});

describe('actionText', () => {
  it('offers the download, then confirms it', () => {
    expect(actionText(false)).toBe('Download .md');
    expect(actionText(true)).toBe('Saved');
  });
});
