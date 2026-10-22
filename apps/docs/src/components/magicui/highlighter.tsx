/*
 * Highlighter, ported from Magic UI (https://magicui.design), MIT License.
 * Copyright (c) 2023 Magic UI. See README.md in this directory.
 *
 * Upstream draws the mark with rough-notation at runtime. This port keeps the
 * `underline` action only and draws it as an inline SVG path with a one-pass
 * CSS stroke animation, so the page adds no dependency, the mark is in the
 * prerendered HTML, and reduced motion shows the finished line.
 */
import type { CSSProperties, ReactNode } from 'react';

/** Props for {@link Highlighter}. */
export interface HighlighterProps {
  children: ReactNode;
  /** Only the underline action is ported. */
  action?: 'underline';
  /** Any CSS color; defaults to the current text color. */
  color?: string;
  /** Stroke width in SVG units of a 300 x 12 box. */
  strokeWidth?: number;
  /** Milliseconds the line takes to draw. */
  animationDuration?: number;
  /** Milliseconds to wait before the line starts to draw. */
  animationDelay?: number;
}

/**
 * Underlines its children with a hand-drawn stroke that draws once. The text
 * stays plain text; the SVG is decorative and hidden from assistive tools.
 */
export function Highlighter({
  children,
  color = 'currentColor',
  strokeWidth = 4.5,
  animationDuration = 800,
  animationDelay = 900,
}: HighlighterProps) {
  const style = {
    '--highlighter-color': color,
    '--highlighter-duration': `${animationDuration}ms`,
    '--highlighter-delay': `${animationDelay}ms`,
  } as CSSProperties;
  return (
    <span className='highlighter' style={style}>
      {children}
      <svg
        className='highlighter-mark'
        viewBox='0 0 300 12'
        preserveAspectRatio='none'
        aria-hidden='true'
        focusable='false'
      >
        <path
          d='M3 8.5C60 4.5 120 3.5 180 5s90 2.5 117 1.5'
          pathLength={1}
          fill='none'
          stroke='var(--highlighter-color)'
          strokeWidth={strokeWidth}
          strokeLinecap='round'
        />
      </svg>
    </span>
  );
}
