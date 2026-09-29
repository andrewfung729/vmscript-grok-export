import { getPanel, showToast } from '@violentmonkey/ui';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { render } from 'solid-js/web';
import {
  buildExport,
  downloadMarkdown,
  readPageState,
  readTheme,
  watchPageState,
  watchTheme,
  type PageState,
  type Theme,
} from './page';
import {
  actionText,
  announceText,
  clampLayout,
  exportedText,
  isFolded,
  readLayout,
  safeStorage,
  statusText,
  writeLayout,
  type PanelLayout,
} from './panel-state';
// global CSS
import globalCss from './style.css';
// CSS modules
import styles, { stylesheet } from './style.module.css';

/** How long the button holds its confirmation before it offers the download again. */
const CONFIRMATION_MS = 2500;

/** The one panel this script mounts; the layout it remembers is as global as the panel. */
const storage = safeStorage();

function readNow(): PageState {
  return readPageState(document, location.pathname);
}

const cx = (...names: Array<string | false | undefined>) =>
  names.filter(Boolean).join(' ');

/**
 * The dragger `@violentmonkey/ui` installs is bound to the whole wrapper, and its `mousedown`
 * handler calls `preventDefault` — which cancels the browser's focus-on-click as well as the drag.
 *
 * A control has to stop that event, and it has to do it as a *native* listener: Solid delegates
 * `onMouseDown` to the render root, which sits **inside** the wrapper, so a delegated handler runs
 * after the drag has already started. `on:mousedown` attaches to the control itself, in the target
 * phase, ahead of the wrapper's listener.
 */
const stopDrag = (event: Event) => event.stopPropagation();

/** Inline geometry rather than an icon dependency: three glyphs do not justify a package. */
const DownloadIcon = () => (
  <svg
    class={styles.icon}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8 2.5V10m0 0 3-3m-3 3-3-3M3 13.5h10" />
  </svg>
);

const CheckIcon = () => (
  <svg
    class={styles.icon}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 8.5 6.5 11.5 12.5 5" />
  </svg>
);

const FoldIcon = () => (
  <svg
    class={styles.icon}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 9.5 8 6l3.5 3.5" />
  </svg>
);

/**
 * Colour is never the only signal: the dot is decoration beside the line that carries the same state
 * in words, and the two states with nothing to do keep the neutral default.
 */
const DOT: Partial<Record<PageState['kind'], string>> = {
  ready: styles.dotReady,
  loading: styles.dotBusy,
};

function Panel() {
  const [getState, setState] = createSignal<PageState>(readNow());
  const [getLayout, setLayout] = createSignal<PanelLayout>(readLayout(storage));
  const [getSaved, setSaved] = createSignal<number | null>(null);

  /**
   * The user asked to see the panel on a page that folds itself. Not remembered: it is an answer to
   * the page in front of them, not a preference.
   */
  const [getPeek, setPeek] = createSignal(false);

  // The panel mounts at document-idle, before grok.com renders the transcript, and the transcript
  // is virtualized. Sampling the page once would report an empty page forever.
  const stop = watchPageState(readNow, setState);

  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    stop();
    clearTimeout(confirmTimer);
  });

  const folded = () => isFolded(getState(), getLayout(), getPeek());
  const canExport = () => getState().kind === 'ready';
  const saved = () => getSaved() !== null;

  /** Clamp to what is on screen, then move the wrapper. The wrapper is the thing that moves. */
  const place = (layout: PanelLayout): PanelLayout => {
    const clamped = clampLayout(
      layout,
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      { width: panel.wrapper.offsetWidth, height: panel.wrapper.offsetHeight },
    );
    setLayout(clamped);
    Object.assign(panel.wrapper.style, {
      top: `${clamped.top}px`,
      left: `${clamped.left}px`,
      // The dragger writes `right`/`bottom` when the panel is dragged into the far half of the page.
      // A fixed element with both `left` and `right` set stretches instead of moving.
      right: 'auto',
      bottom: 'auto',
    });
    return clamped;
  };

  const fold = (collapsed: boolean) => {
    setLayout({ ...getLayout(), collapsed });
    // The chip and the panel are different sizes, so re-clamp against the shape that is now mounted.
    writeLayout(storage, place(getLayout()));
  };

  const handleDownload = () => {
    try {
      const payload = buildExport(document, {
        pathname: location.pathname,
        url: location.href,
        documentTitle: document.title,
      });

      if (!payload) {
        showToast('No messages found on this page.', { theme: 'dark' });
        return;
      }

      downloadMarkdown(payload);
      setSaved(payload.count);
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => setSaved(null), CONFIRMATION_MS);
    } catch (error) {
      showToast(`Export failed: ${(error as Error).message}`, {
        theme: 'dark',
      });
    }
  };

  onMount(() => {
    place(getLayout());
    applyTheme(readTheme(window));

    // A theme change is an attribute on the host, so it repaints through the CSS tokens and nothing
    // in this component re-renders.
    onCleanup(watchTheme(() => readTheme(window), applyTheme));

    panel.setMovable(true, {
      onMoved: () => {
        const { top, left } = panel.wrapper.getBoundingClientRect();
        // Only a drag is a decision, so only a drag is remembered.
        writeLayout(
          storage,
          place({
            ...getLayout(),
            top: Math.round(top),
            left: Math.round(left),
          }),
        );
      },
    });

    const onResize = () => place(getLayout());
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  const announcement = () => {
    const count = getSaved();
    return count === null ? announceText(getState()) : exportedText(count);
  };

  return (
    <>
      <Show when={folded()}>
        {/*
         * One chip, and it is always a button. A folded panel is the only control on screen, so a
         * click on it must open the panel whatever the page state is — there is no condition here
         * that can refuse, and nothing to get wrong.
         */}
        <button
          type="button"
          class={cx(styles.chip, styles.chipButton)}
          aria-label="Show export panel"
          aria-expanded="false"
          title={statusText(getState())}
          on:mousedown={stopDrag}
          onClick={() => {
            setPeek(true);
            fold(false);
          }}
        >
          <span
            class={cx(styles.dot, DOT[getState().kind])}
            aria-hidden="true"
          />
          Export
        </button>
      </Show>

      <Show when={!folded()}>
        <div class={styles.panel}>
          <div class={styles.header}>
            <p class={styles.title}>Grok Export</p>
            <button
              type="button"
              class={styles.iconButton}
              aria-label="Fold panel"
              aria-expanded="true"
              on:mousedown={stopDrag}
              onClick={() => {
                setPeek(false);
                fold(true);
              }}
            >
              <FoldIcon />
            </button>
          </div>

          <p class={styles.status}>
            <span
              class={cx(styles.dot, DOT[getState().kind])}
              aria-hidden="true"
            />
            <span>{statusText(getState())}</span>
          </p>

          <button
            type="button"
            class={styles.action}
            disabled={!canExport()}
            on:mousedown={stopDrag}
            onClick={handleDownload}
          >
            <Show when={saved()} fallback={<DownloadIcon />}>
              <CheckIcon />
            </Show>
            {actionText(saved())}
          </button>

          <p class={styles.srOnly} role="status" aria-live="polite">
            {announcement()}
          </p>
        </div>
      </Show>
    </>
  );
}

// Inject CSS
GM_addStyle(globalCss);

// Let's create a movable panel using @violentmonkey/ui
const panel = getPanel({
  // The built-in themes are a square `rgba(0, 0, 0, .8)` box with a `#333` border and 8px of body
  // padding. The card in `style.module.css` owns the look instead. See docs/PLAN.md D6.
  theme: 'none',
  // If shadowDOM is enabled for `getPanel` (by default), `style` will be injected to the shadow root.
  // Otherwise, it is roughly the same as `GM_addStyle(stylesheet)`.
  style: stylesheet,
});

/** The palette is a token block keyed on this attribute, so this is the whole of "applying a theme". */
function applyTheme(theme: Theme): void {
  panel.host.dataset.theme = theme;
}

// Before the first paint, so a light grok never shows a dark panel for a frame.
applyTheme(readTheme(window));

render(Panel, panel.body);
panel.show();
