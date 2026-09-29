import type { PageState } from './page';

/**
 * The panel's own view model: where it sits, whether it is folded away, and the lines it reports.
 *
 * None of this is about the page, so none of it belongs in `page.ts`; all of it is kept out of the
 * Solid component so jsdom can test it without rendering one.
 */

export interface PanelLayout {
  /** Folded to a chip by the user. Remembered across reloads. */
  collapsed: boolean;
  /** Viewport pixels, the top-left corner of the panel wrapper. */
  top: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Narrower than `Storage` so a test can hand in a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `10vh`/`10vw` on a laptop, in the pixels the wrapper is actually positioned with. */
export const DEFAULT_LAYOUT: PanelLayout = {
  collapsed: false,
  top: 96,
  left: 96,
};

const STORAGE_KEY = 'grok-export:layout';

/** `localStorage` throws where storage is blocked. The panel still works; it just forgets. */
export function safeStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Read the remembered layout, or the default.
 *
 * Every field is validated and every failure is a fallback, because this key lives in grok.com's own
 * `localStorage`, where any other script or an older version of this one may have written anything.
 * A junk value must not stop the panel from mounting.
 */
export function readLayout(storage: StorageLike | undefined): PanelLayout {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
  if (!raw) return { ...DEFAULT_LAYOUT };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
  if (typeof parsed !== 'object' || parsed === null)
    return { ...DEFAULT_LAYOUT };

  const { collapsed, top, left } = parsed as Record<string, unknown>;
  return {
    collapsed:
      typeof collapsed === 'boolean' ? collapsed : DEFAULT_LAYOUT.collapsed,
    top: isPixels(top) ? top : DEFAULT_LAYOUT.top,
    left: isPixels(left) ? left : DEFAULT_LAYOUT.left,
  };
}

export function writeLayout(
  storage: StorageLike | undefined,
  layout: PanelLayout,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Full or blocked. The panel forgets where it was, which is not worth interrupting a drag for.
  }
}

/**
 * Keep the panel on screen.
 *
 * A layout remembered on a larger display, or a window that shrank after the panel was placed, must
 * not put the button where it cannot be reached. `limit` is the furthest the corner may go; a panel
 * larger than the viewport is pinned to `0` rather than off the far edge.
 */
export function clampLayout(
  layout: PanelLayout,
  viewport: Size,
  size: Size,
): PanelLayout {
  return {
    collapsed: layout.collapsed,
    top: clamp(layout.top, viewport.height - size.height),
    left: clamp(layout.left, viewport.width - size.width),
  };
}

/**
 * The panel is a chip when the user folded it, or when the page has nothing to export — unless the user
 * asked to see it anyway. That last clause is the point: a folded panel is the only thing on screen, so
 * **nothing may prevent a click on it from opening the panel**. An earlier version guessed "drag or
 * click?" from the pointer path and refused to open on a wide guess; a guard on the only way back out
 * of a state is a trap, not a heuristic.
 */
export function isFolded(
  state: PageState,
  layout: PanelLayout,
  peek: boolean,
): boolean {
  if (layout.collapsed) return true;
  return !isConversation(state) && !peek;
}

/** Whether the page is a conversation, i.e. whether the panel has anything to say. */
export function isConversation(state: PageState): boolean {
  return state.kind !== 'not-a-conversation';
}

/**
 * What the panel says.
 *
 * This line carries the mounted count, which changes as the user scrolls, so it is *not* the line a
 * screen reader announces: `announceText` is. The two have different audiences and that is why there
 * are two.
 */
export function statusText(state: PageState): string {
  switch (state.kind) {
    case 'ready':
      return `${describeCount(state.count)} mounted — no scroll to load more.`;
    case 'loading':
      return 'Waiting for the conversation to render…';
    case 'empty':
      return 'This conversation has no messages.';
    case 'not-a-conversation':
      return 'Open a conversation to export it — this is not a /c/ page.';
  }
}

/** The spoken line: stable for a given kind, so scrolling never re-announces the count. */
export function announceText(state: PageState): string {
  switch (state.kind) {
    case 'ready':
      return 'Conversation ready to export.';
    case 'loading':
      return 'Waiting for the conversation to render.';
    case 'empty':
      return 'This conversation has no messages.';
    case 'not-a-conversation':
      return 'Open a conversation to export it.';
  }
}

/** The confirmation for a finished export, and the button label it is paired with. */
export function exportedText(count: number): string {
  return `Exported ${describeCount(count)} to your downloads.`;
}

export function actionText(saved: boolean): string {
  return saved ? 'Saved' : 'Download .md';
}

function describeCount(count: number): string {
  return `${count} message${count === 1 ? '' : 's'}`;
}

function isPixels(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, limit: number): number {
  return Math.min(Math.max(0, value), Math.max(0, limit));
}
