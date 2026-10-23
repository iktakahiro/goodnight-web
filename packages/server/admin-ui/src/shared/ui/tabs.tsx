import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { cn } from './cn.ts';
import { scrollLeftToReveal, useScrollEdges } from './horizontal-scroll.ts';

/** Tabs (Base UI Tabs). */
export const Tabs = BaseTabs.Root;

/** A pill-shaped scroller with edge hints that keeps the active tab in view. */
export const TabsList = ({
  className,
  children,
  ref,
  ...props
}: ComponentProps<typeof BaseTabs.List>) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [scrollerRef, edges] = useScrollEdges();
  const listRef = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      scrollerRef(node);
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
    },
    [ref, scrollerRef],
  );

  useEffect(() => {
    if (!element) return;
    const revealActiveTab = () => {
      const active = element.querySelector<HTMLElement>(
        '[role="tab"][data-active]',
      );
      if (!active) return;
      const start =
        active.getBoundingClientRect().left -
        element.getBoundingClientRect().left -
        element.clientLeft +
        element.scrollLeft;
      const padding = Number.parseFloat(getComputedStyle(element).paddingLeft);
      // Only this list moves; focus and the page's vertical position stay put.
      element.scrollTo({
        left: scrollLeftToReveal(
          element,
          start,
          start + active.getBoundingClientRect().width,
          padding,
        ),
        behavior: 'instant',
      });
    };
    const resizeObserver = new ResizeObserver(revealActiveTab);
    resizeObserver.observe(element);
    for (const child of element.children) resizeObserver.observe(child);
    const mutationObserver = new MutationObserver(revealActiveTab);
    mutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ['data-active'],
      childList: true,
      subtree: true,
    });
    revealActiveTab();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [element]);

  return (
    <div className='relative w-max max-w-full min-w-0'>
      <BaseTabs.List
        {...props}
        ref={listRef}
        className={cn(
          'relative z-0 flex w-max max-w-full gap-1 overflow-x-auto rounded-full border border-border/80 bg-card/80 p-1 shadow-xs',
          className,
        )}
      >
        {children}
        <BaseTabs.Indicator className='absolute top-1/2 left-0 -z-1 h-[calc(100%-0.5rem)] w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-1/2 rounded-full bg-primary shadow-sm transition-[translate,width] duration-200 ease-out motion-reduce:transition-none' />
      </BaseTabs.List>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-px overflow-hidden rounded-full'
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-8 bg-linear-to-r from-card to-transparent transition-opacity motion-reduce:transition-none',
            edges.before ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent transition-opacity motion-reduce:transition-none',
            edges.after ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
    </div>
  );
};

/** One tab. */
export const TabsTab = ({
  className,
  ...props
}: ComponentProps<typeof BaseTabs.Tab>) => (
  <BaseTabs.Tab
    className={cn(
      'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring data-active:text-primary-foreground data-active:hover:text-primary-foreground',
      className,
    )}
    {...props}
  />
);

/** The content for the active tab. */
export const TabsPanel = ({
  className,
  ...props
}: ComponentProps<typeof BaseTabs.Panel>) => (
  <BaseTabs.Panel className={cn('outline-none', className)} {...props} />
);
