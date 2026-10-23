/**
 * The night artwork shared by the share images (`scripts/og/generate.ts`) and
 * the closing band and hero of the top page: star marks and a row of house
 * silhouettes. This file holds only the shapes and colors, so both can draw
 * the same art.
 */

export const nightColors = {
  star: '#efe9ff',
  house: '#150b2b',
  litWindow: '#f2c987',
} as const;

/**
 * The same stars on a white page (the top page hero in the light theme): a
 * mid lavender, since the night color would vanish on white.
 */
export const dayColors = {
  star: '#8d68d0',
} as const;

/** A four-point sparkle with concave sides, as a path of radius 1 around the origin. */
export const sparklePath = 'M0-1Q.1-.1 1 0Q.1.1 0 1Q-.1.1-1 0Q-.1-.1 0-1Z';

/** A five-point star, as polygon points of radius 1 around the origin. */
export const fivePointStar = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 1 : 0.46;
  const angle = (Math.PI / 5) * i - Math.PI / 2;
  return `${(Math.cos(angle) * r).toFixed(3)},${(Math.sin(angle) * r).toFixed(3)}`;
}).join(' ');

type House = {
  x: number;
  width: number;
  wall: number;
  roof: 'gable' | 'shed' | 'flat';
  rise: number;
  /** Lit windows, as [dx, dy] from the wall's top-left corner. */
  lit?: [number, number][];
  chimney?: boolean;
};

const houses: House[] = [
  { x: -8, width: 92, wall: 52, roof: 'gable', rise: 32, lit: [[58, 18]] },
  { x: 92, width: 62, wall: 76, roof: 'shed', rise: 16 },
  { x: 162, width: 84, wall: 44, roof: 'gable', rise: 38, chimney: true },
  { x: 254, width: 58, wall: 90, roof: 'gable', rise: 26, lit: [[22, 30]] },
  { x: 320, width: 74, wall: 60, roof: 'flat', rise: 0, lit: [[16, 20]] },
  { x: 402, width: 88, wall: 42, roof: 'gable', rise: 34 },
  { x: 498, width: 60, wall: 72, roof: 'gable', rise: 24, chimney: true },
  { x: 566, width: 84, wall: 50, roof: 'shed', rise: 14, lit: [[50, 18]] },
];

/** Width and height of one run of houses, and where its ground line is. */
export const townSize = { width: 660, height: 140, base: 630 } as const;

export type Rect = { x: number; y: number; width: number; height: number };

export type HouseShape = {
  wall: Rect;
  roof: { kind: 'polygon'; points: string } | ({ kind: 'rect' } & Rect);
  chimney: Rect | null;
  windows: Rect[];
};

/**
 * The shapes of one run of houses, in the coordinates of a drawing whose
 * ground line is `townSize.base`: a `viewBox` of `0 490 660 140` shows all of it.
 */
export function townShapes(): HouseShape[] {
  const { base } = townSize;
  return houses.map((house) => {
    const top = base - house.wall;
    const left = house.x;
    const right = house.x + house.width;
    const middle = house.x + house.width / 2;
    const overhang = 4;
    const roof: HouseShape['roof'] =
      house.roof === 'gable'
        ? {
            kind: 'polygon',
            points: `${left - overhang},${top} ${middle},${top - house.rise} ${right + overhang},${top}`,
          }
        : house.roof === 'shed'
          ? {
              kind: 'polygon',
              points: `${left - overhang},${top} ${left - overhang},${top - house.rise} ${right + overhang},${top - house.rise * 0.2} ${right + overhang},${top}`,
            }
          : {
              kind: 'rect',
              x: left - 2,
              y: top - 4,
              width: house.width + 4,
              height: 4,
            };
    return {
      wall: { x: left, y: top, width: house.width, height: house.wall },
      roof,
      chimney: house.chimney
        ? {
            x: right - 22,
            y: top - house.rise - 2,
            width: 9,
            height: house.rise + 2,
          }
        : null,
      windows: (house.lit ?? []).map(([dx, dy]) => ({
        x: left + dx,
        y: top + dy,
        width: 8,
        height: 11,
      })),
    };
  });
}
