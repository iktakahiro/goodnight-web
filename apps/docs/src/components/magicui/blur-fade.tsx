/*
 * Blur Fade, vendored from Magic UI (https://magicui.design), MIT License.
 * Copyright (c) 2023 Magic UI. See README.md in this directory.
 *
 * Changes from upstream: no `AnimatePresence` or exit animation (the element
 * never unmounts), and a `blur-fade` class so that CSS can show the final
 * state when scripting is off or reduced motion is requested.
 */
import { useRef, type ReactNode } from 'react';
import {
  motion,
  useInView,
  type MotionProps,
  type UseInViewOptions,
  type Variants,
} from 'motion/react';

type MarginType = UseInViewOptions['margin'];

/** Props for {@link BlurFade}; other motion props pass through. */
export interface BlurFadeProps extends MotionProps {
  children: ReactNode;
  className?: string;
  /** Replaces the default hidden and visible variants. */
  variant?: Variants;
  /** Seconds the transition takes. */
  duration?: number;
  /** Seconds to wait before the transition starts. */
  delay?: number;
  /** Distance in pixels that the element moves while it fades in. */
  offset?: number;
  /** The side the element comes from. */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Waits until the element scrolls into view instead of starting on mount. */
  inView?: boolean;
  /** Margin for the in-view check, as in `IntersectionObserver`. */
  inViewMargin?: MarginType;
  /** The CSS blur length of the hidden state. */
  blur?: string;
}

/**
 * Fades, unblurs, and slides its children in once, on mount or when they
 * enter the viewport. The hidden state is rendered as inline styles, so pair
 * it with the `blur-fade` CSS fallback in `landing.css`.
 */
export function BlurFade({
  children,
  className,
  variant,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = 'down',
  inView = false,
  inViewMargin = '-50px',
  blur = '6px',
  ...props
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const defaultVariants: Variants = {
    hidden: {
      [axis]: direction === 'right' || direction === 'down' ? -offset : offset,
      opacity: 0,
      filter: `blur(${blur})`,
    },
    visible: {
      [axis]: 0,
      opacity: 1,
      filter: 'blur(0px)',
    },
  };
  return (
    <motion.div
      ref={ref}
      initial='hidden'
      animate={isInView ? 'visible' : 'hidden'}
      variants={variant ?? defaultVariants}
      transition={{ delay: 0.04 + delay, duration, ease: 'easeOut' }}
      className={className ? `blur-fade ${className}` : 'blur-fade'}
      {...props}
    >
      {children}
    </motion.div>
  );
}
