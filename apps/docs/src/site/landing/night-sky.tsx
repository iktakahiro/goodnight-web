import type { CSSProperties } from 'react';
import {
  dayColors,
  fivePointStar,
  nightColors,
  sparklePath,
  townShapes,
  townSize,
  type Rect,
} from '../night-art';

/**
 * Stars: the left edge in percent of the band, the edge they sit near, the
 * distance from that edge in rem, and a size. Stars stay in the band's top
 * and bottom margins, or in the side gutters (`side`, shown only on screens
 * wide enough to have gutters), so that they never touch the text.
 */
const stars = {
  architecture: [
    [8, 'top', 1.75, 's'],
    [23, 'top', 3.5, 'm'],
    [41, 'top', 1.25, 's'],
    [58, 'top', 2.75, 's'],
    [74, 'top', 1.5, 'm'],
    [3, 'side', 22, 's'],
    [97, 'side', 30, 'm'],
    [1.5, 'side', 44, 'm'],
    [98, 'side', 52, 's'],
    [17, 'bottom', 2.5, 's'],
    [52, 'bottom', 1.5, 'm'],
    [86, 'bottom', 3, 's'],
  ],
} as const;

/**
 * The closing band's stars: left edge in percent, then the distance from the
 * top (or bottom) in rem for the margin ones, or the top in percent of the
 * band for the side ones; then the diameter in pixels, whether it is a
 * five-point star, and the opacity. The always-shown stars stay in the margins above the
 * logo and between the buttons and the houses. The side stars stay inside the
 * gutters, shown only on screens wide enough to leave the text clear.
 */
const marks = {
  margin: [
    [9, 'top', 2, 16, false, 0.55],
    [30, 'top', 0.9, 10, false, 0.4],
    [52, 'top', 1.8, 12, true, 0.35],
    [74, 'top', 0.8, 8, false, 0.5],
    [91, 'top', 2.3, 12, false, 0.6],
    [20, 'bottom', 5.6, 14, false, 0.45],
    [58, 'bottom', 5.1, 8, false, 0.3],
    [80, 'bottom', 6.4, 10, false, 0.5],
  ],
  side: [
    [5, 12, 26, false, 0.6],
    [14, 24, 14, false, 0.4],
    [8, 36, 10, true, 0.3],
    [7, 55, 34, false, 0.5],
    [4, 58, 12, false, 0.45],
    [12, 66, 18, true, 0.35],
    [17, 8, 10, false, 0.3],
    [3, 30, 8, false, 0.35],
    [92, 10, 20, true, 0.5],
    [84, 22, 34, false, 0.45],
    [95, 34, 14, false, 0.6],
    [94, 47, 24, false, 0.5],
    [96, 56, 10, false, 0.35],
    [83, 62, 12, false, 0.3],
    [91, 66, 16, false, 0.4],
    [86, 6, 8, false, 0.35],
  ],
} as const;

function Mark({
  five,
  size,
  fill = nightColors.star,
}: {
  five: boolean;
  size: number;
  fill?: string;
}) {
  return (
    <svg
      viewBox='-1 -1 2 2'
      width={size}
      height={size}
      fill={fill}
      focusable='false'
    >
      {five ? (
        <polygon points={fivePointStar} transform='rotate(-8)' />
      ) : (
        <path d={sparklePath} />
      )}
    </svg>
  );
}

function rect(r: Rect, key?: string, fill?: string, opacity?: number) {
  return (
    <rect
      key={key}
      x={r.x}
      y={r.y}
      width={r.width}
      height={r.height}
      fill={fill}
      opacity={opacity}
    />
  );
}

/** Four runs of the houses side by side, every other run mirrored. */
function Town() {
  const shapes = townShapes();
  const tiles = 4;
  return (
    <svg
      className='night-town'
      viewBox={`0 ${townSize.base - townSize.height} ${townSize.width * tiles} ${townSize.height}`}
      fill={nightColors.house}
      focusable='false'
    >
      {Array.from({ length: tiles }, (_, tile) => (
        <g
          key={tile}
          transform={
            tile % 2 === 0
              ? `translate(${townSize.width * tile} 0)`
              : `translate(${townSize.width * (tile + 1)} 0) scale(-1 1)`
          }
        >
          {shapes.map((house) => (
            <g key={house.wall.x}>
              {rect(house.wall)}
              {house.roof.kind === 'polygon' ? (
                <polygon points={house.roof.points} />
              ) : (
                rect(house.roof)
              )}
              {house.chimney ? rect(house.chimney) : null}
              {house.windows.map((window, w) =>
                rect(window, String(w), nightColors.litWindow, 0.8),
              )}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

/**
 * The decoration of the closing band: scattered star marks and a row of
 * house silhouettes along the bottom edge, the same art as the share image.
 * Nothing moves, and the whole layer is hidden from assistive tools.
 */
function ClosingSky() {
  return (
    <div className='night-sky night-sky-closing' aria-hidden='true'>
      {marks.margin.map(([left, edge, offset, size, five, opacity]) => (
        <span
          key={`m-${left}-${edge}`}
          className='night-mark'
          style={{
            left: `${left}%`,
            [edge]: `${offset}rem`,
            opacity,
          }}
        >
          <Mark five={five} size={size} />
        </span>
      ))}
      {marks.side.map(([left, top, size, five, opacity]) => (
        <span
          key={`s-${left}-${top}`}
          className='night-mark night-mark-side'
          style={{ left: `${left}%`, top: `${top}%`, opacity }}
        >
          <Mark five={five} size={size} />
        </span>
      ))}
      <Town />
    </div>
  );
}

/**
 * The hero's stars, in the same form as `marks`, positioned from the top of the
 * hero in rem. They sit in the top margin and, on screens wide enough to have
 * gutters (`side`), beside the text block. A narrow screen gets only the
 * first few, so the hero is never busier than the closing band.
 */
const heroMarks = {
  margin: [
    [9, 0.5, 10, false, 0.5],
    [32, 0.6, 8, false, 0.35],
    [66, 0.5, 8, true, 0.4],
    [90, 0.6, 12, false, 0.55],
  ],
  side: [
    [5, 4, 22, false, 0.55],
    [15, 9, 10, false, 0.35],
    [9, 15, 12, true, 0.4],
    [4, 21, 8, false, 0.35],
    [15, 26, 16, false, 0.45],
    [92, 6, 14, false, 0.5],
    [91, 11.5, 8, false, 0.3],
    [95, 17, 10, true, 0.4],
    [88, 24, 20, false, 0.5],
  ],
} as const;

/**
 * The hero's stars: the closing band's marks without the houses. They are
 * lavender-violet on the white page of the light theme and pale lavender in
 * the dark theme (see `.night-sky-hero` in landing.css). Nothing moves, and the
 * layer is hidden from assistive tools.
 */
function HeroSky() {
  return (
    <div
      className='night-sky night-sky-hero'
      aria-hidden='true'
      style={
        {
          '--star-day': dayColors.star,
          '--star-night': nightColors.star,
        } as CSSProperties
      }
    >
      {heroMarks.margin.map(([left, top, size, five, opacity]) => (
        <span
          key={`m-${left}`}
          className='night-mark'
          style={{ left: `${left}%`, top: `${top}rem`, opacity }}
        >
          <Mark five={five} size={size} fill='currentColor' />
        </span>
      ))}
      {heroMarks.side.map(([left, top, size, five, opacity]) => (
        <span
          key={`s-${left}-${top}`}
          className='night-mark night-mark-side'
          style={{ left: `${left}%`, top: `${top}rem`, opacity }}
        >
          <Mark five={five} size={size} fill='currentColor' />
        </span>
      ))}
    </div>
  );
}

/**
 * The decoration of a night band: on the architecture band, a few still stars
 * and a crescent moon; on the closing band, ClosingSky; on the hero, only the
 * stars (HeroSky). Nothing moves, and the whole layer is hidden from assistive
 * tools.
 */
export function NightSky({
  variant,
}: {
  variant: 'architecture' | 'closing' | 'hero';
}) {
  if (variant === 'closing') return <ClosingSky />;
  if (variant === 'hero') return <HeroSky />;
  return (
    <div className={`night-sky night-sky-${variant}`} aria-hidden='true'>
      {stars.architecture.map(([left, edge, offset, size]) => (
        <i
          key={`${left}-${edge}`}
          className={`night-star night-star-${size} night-star-${edge}`}
          style={{
            left: `${left}%`,
            [edge === 'bottom' ? 'bottom' : 'top']: `${offset}rem`,
          }}
        />
      ))}
      <svg className='night-moon' viewBox='0 0 24 24' focusable='false'>
        <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
      </svg>
    </div>
  );
}
