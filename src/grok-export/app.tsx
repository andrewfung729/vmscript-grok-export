import { getPanel, showToast } from '@violentmonkey/ui';
import { createSignal, onCleanup, Show } from 'solid-js';
import { render } from 'solid-js/web';
import {
  buildExport,
  downloadMarkdown,
  readPageState,
  watchPageState,
  type PageState,
} from './page';
// global CSS
import globalCss from './style.css';
// CSS modules
import styles, { stylesheet } from './style.module.css';

function readNow(): PageState {
  return readPageState(document, location.pathname);
}

function Panel() {
  const [getState, setState] = createSignal<PageState>(readNow());

  // The panel mounts at document-idle, before grok.com renders the transcript, and the transcript
  // is virtualized. Sampling the page once would report an empty page forever.
  const stop = watchPageState(readNow, setState);
  onCleanup(stop);

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
      showToast(
        `Exported ${payload.count} message${payload.count === 1 ? '' : 's'}`,
        {
          theme: 'dark',
        },
      );
    } catch (error) {
      showToast(`Export failed: ${(error as Error).message}`, {
        theme: 'dark',
      });
    }
  };

  return (
    <div class={styles.panel}>
      <p class={styles.title}>Grok Conversation Export</p>

      <Show when={getState().kind === 'ready'}>
        <button class={styles.action} onClick={handleDownload}>
          Download .md
        </button>
        <p class={styles.note}>
          {(getState() as { count: number }).count} messages mounted
        </p>
      </Show>

      <Show when={getState().kind === 'loading'}>
        <p class={styles.note}>Waiting for the conversation to render…</p>
      </Show>

      <Show when={getState().kind === 'not-a-conversation'}>
        <p class={styles.problem}>
          Open a conversation first — this is not a /c/ page.
        </p>
      </Show>

      <Show when={getState().kind === 'empty'}>
        <p class={styles.problem}>This conversation has no messages.</p>
      </Show>

      <p class={styles.note}>
        Exports what the page has mounted. It does not scroll.
      </p>
    </div>
  );
}

// Inject CSS
GM_addStyle(globalCss);

// Let's create a movable panel using @violentmonkey/ui
const panel = getPanel({
  theme: 'dark',
  // If shadowDOM is enabled for `getPanel` (by default), `style` will be injected to the shadow root.
  // Otherwise, it is roughly the same as `GM_addStyle(stylesheet)`.
  style: stylesheet,
});
Object.assign(panel.wrapper.style, {
  top: '10vh',
  left: '10vw',
});
panel.setMovable(true);
panel.show();
render(Panel, panel.body);
