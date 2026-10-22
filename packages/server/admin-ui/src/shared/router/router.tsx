import {
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react';

// A minimal History API router. The admin UI has four screens, so a routing
// library would add size without adding much.

const NAVIGATE_EVENT = 'goodnight-web:navigate';

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
};

const snapshot = () => window.location.pathname + window.location.search;

/** Moves to `to` (a path with an optional query) without reloading. */
export const navigate = (
  to: string,
  { replace = false }: { replace?: boolean } = {},
): void => {
  if (to === snapshot()) return;
  const state = { fromApp: !replace || cameFromApp() };
  if (replace) window.history.replaceState(state, '', to);
  else window.history.pushState(state, '', to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
};

/**
 * Whether the current history entry was opened from another admin screen,
 * so `history.back()` stays in the app. False after a deep link (for
 * example from a Slack notification).
 */
export const cameFromApp = (): boolean => {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' &&
    state !== null &&
    'fromApp' in state &&
    state.fromApp === true
  );
};

/** The current pathname and query. Re-renders on navigation. */
export const useLocation = (): {
  pathname: string;
  search: URLSearchParams;
} => {
  const current = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(current, window.location.origin);
  return { pathname: url.pathname, search: url.searchParams };
};

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * An `<a>` that navigates inside the app. Modified clicks (new tab, new
 * window) keep the browser's default behavior.
 */
export const Link = ({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
  <a
    href={href}
    onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;
      event.preventDefault();
      navigate(href);
    }}
    {...props}
  />
);
