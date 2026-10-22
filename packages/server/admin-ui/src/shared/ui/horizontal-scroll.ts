import { useEffect, useState } from 'react';

/** Whether a sideways scroller has hidden content before or after its view. */
export interface ScrollEdges {
  /** Content is hidden on the left (the view is scrolled). */
  before: boolean;
  /** Content is hidden on the right. */
  after: boolean;
}

/** The size and position a {@link ScrollEdges} reading needs. */
export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const NO_EDGES: ScrollEdges = { before: false, after: false };

/**
 * Reads which sides of a left-to-right scroller hide content. Less than one
 * pixel does not count, so zoom and fractional widths do not show a hint
 * when nothing is hidden.
 */
export const scrollEdges = ({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: ScrollMetrics): ScrollEdges => ({
  before: scrollLeft >= 1,
  after: scrollWidth - clientWidth - scrollLeft >= 1,
});

/**
 * Follows the {@link scrollEdges} of an element while it scrolls, resizes,
 * or its content changes size.
 *
 * @returns A ref callback for the scroller, and its current edges.
 */
export const useScrollEdges = (): [
  (element: HTMLElement | null) => void,
  ScrollEdges,
] => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);
  useEffect(() => {
    if (!element) return;
    const update = () => {
      const next = scrollEdges(element);
      setEdges((current) =>
        current.before === next.before && current.after === next.after
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [element]);
  return [setElement, edges];
};

/**
 * Follows the rendered width of an element in CSS pixels.
 *
 * @returns A ref callback for the element, and its width (0 before it mounts).
 */
export const useElementWidth = (): [
  (element: HTMLElement | null) => void,
  number,
] => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
};
