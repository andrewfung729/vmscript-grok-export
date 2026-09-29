import {
  ROLE_ARIA_LABEL,
  ROLE_TEST_ID,
  SELECTORS,
  TITLE_SUFFIX,
  type Role,
} from './selectors';

/**
 * Walk the mounted message nodes into `Message[]`.
 *
 * Only what is on the page: a long conversation has more history than the DOM holds, and v1 does
 * not scroll to collect it. See docs/PLAN.md D3.
 */

export interface Message {
  role: Role;
  /** `response-<uuid>`, or null if the node carries no id. */
  id: string | null;
  /** The message node itself. */
  element: Element;
  /** `SELECTORS.bodyRoot` inside `element`, resolved once. */
  body: Element;
}

const BY_TEST_ID = new Map<string, Role>(
  Object.entries(ROLE_TEST_ID).map(([role, testId]) => [testId, role as Role]),
);

const BY_ARIA_LABEL = new Map<string, Role>(
  Object.entries(ROLE_ARIA_LABEL).map(([role, label]) => [label, role as Role]),
);

/**
 * `data-testid` is the contract. `aria-label` is an independent second signal. Positional
 * `items-*` classes on the row wrapper are deliberately not consulted: they are not 1:1 with role.
 */
function readRole(bubble: Element): Role | null {
  const testId = bubble.getAttribute('data-testid');
  if (testId && BY_TEST_ID.has(testId)) return BY_TEST_ID.get(testId) as Role;

  const ariaLabel = bubble.getAttribute('aria-label');
  if (ariaLabel && BY_ARIA_LABEL.has(ariaLabel))
    return BY_ARIA_LABEL.get(ariaLabel) as Role;

  return null;
}

/**
 * A message without a recognisable role, or without a body, is skipped rather than guessed at: a
 * wrong role writes a wrong heading into the file, and a missing body would write an empty section.
 * A shorter export is the decided failure mode.
 */
export function extract(root: ParentNode): Message[] {
  const messages: Message[] = [];

  for (const element of root.querySelectorAll(SELECTORS.message)) {
    const bubble = element.querySelector(SELECTORS.bubble);
    if (!bubble) continue;

    const role = readRole(bubble);
    if (!role) continue;

    const body = element.querySelector(SELECTORS.bodyRoot);
    if (!body) continue;

    messages.push({ role, id: element.id || null, element, body });
  }

  return messages;
}

/** The conversation title, with grok.com's ` - Grok` suffix removed. */
export function readTitle(documentTitle: string): string {
  return documentTitle.endsWith(TITLE_SUFFIX)
    ? documentTitle.slice(0, -TITLE_SUFFIX.length).trim()
    : documentTitle.trim();
}

/** The uuid in the `/c/<uuid>` path. `?rid=` is a response id and is ignored. */
export function readConversationId(pathname: string): string | null {
  const match = pathname.match(/\/c\/([0-9a-fA-F-]{36})/);
  return match ? match[1] : null;
}
