/** A point in SVG user units (y grows down). */
export type Point = readonly [number, number];

/** Formats a number for path data: at most two decimals, no trailing zeros. */
export function num(n: number): string {
  const s = n.toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

/** Formats a point as `x y`. */
export function pt(p: Point): string {
  return `${num(p[0])} ${num(p[1])}`;
}

/** Returns the point at `deg` degrees (screen angle, clockwise from +x). */
export function polar(c: Point, r: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
}

/** Returns the unit vector from `a` towards `b`. */
export function unit(a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
}

/** Returns the distance between two points. */
export function dist(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Returns `a + v * s`. */
export function add(a: Point, v: Point, s = 1): Point {
  return [a[0] + v[0] * s, a[1] + v[1] * s];
}

/** Parameters of a crescent: disc (c1, R) minus disc (c2, r), tips rounded. */
export interface MoonParams {
  readonly c1: Point;
  /** Outer radius. */
  readonly R: number;
  /** Offset of the inner circle, as a fraction of `R`. */
  readonly d: number;
  /** Inner radius, as a fraction of `R`. */
  readonly r: number;
  /** Direction the crescent opens to, in degrees with y up. */
  readonly axis: number;
  /** Radius that rounds the two tips. */
  readonly tip: number;
}

/** The resolved circles of a crescent. */
export interface MoonGeometry {
  readonly c1: Point;
  readonly R: number;
  readonly c2: Point;
  readonly r: number;
  /** Centres of the two tip roundings, upper tip first. */
  readonly tips: readonly [Point, Point];
}

function circleIntersections(
  c1: Point,
  r1: number,
  c2: Point,
  r2: number,
): [Point, Point] {
  const dx = c2[0] - c1[0];
  const dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const xm = c1[0] + (a * dx) / d;
  const ym = c1[1] + (a * dy) / d;
  return [
    [xm + (h * dy) / d, ym - (h * dx) / d],
    [xm - (h * dy) / d, ym + (h * dx) / d],
  ];
}

/** Resolves the circles and tip centres of a crescent. */
export function moonGeometry(p: MoonParams): MoonGeometry {
  const a = (p.axis * Math.PI) / 180;
  const c2: Point = [
    p.c1[0] + p.d * p.R * Math.cos(a),
    p.c1[1] - p.d * p.R * Math.sin(a),
  ];
  const r = p.r * p.R;
  const [t1, t2] = circleIntersections(p.c1, p.R - p.tip, c2, r + p.tip);
  const tips: [Point, Point] = t1[1] < t2[1] ? [t1, t2] : [t2, t1];
  return { c1: p.c1, R: p.R, c2, r, tips };
}

/**
 * Returns the crescent path. The tips are rounded exactly: each tip is a
 * circle of radius `tip` that touches both the outer and the inner circle.
 */
export function moonPath(p: MoonParams): string {
  const { c1, R, c2, r, tips } = moonGeometry(p);
  const [ta, tb] = tips;
  const outer = (t: Point) => add(t, unit(c1, t), p.tip);
  const inner = (t: Point) => add(t, unit(c2, t), -p.tip);
  const tr = num(p.tip);
  return (
    `M${pt(outer(tb))}A${num(R)} ${num(R)} 0 1 1 ${pt(outer(ta))}` +
    `A${tr} ${tr} 0 0 1 ${pt(inner(ta))}` +
    `A${num(r)} ${num(r)} 0 1 0 ${pt(inner(tb))}` +
    `A${tr} ${tr} 0 0 1 ${pt(outer(tb))}Z`
  );
}

/** Returns the ink box `[x0, y0, x1, y1]` of a crescent that opens up-right. */
export function moonBox(p: MoonParams): [number, number, number, number] {
  const { c1, R, tips } = moonGeometry(p);
  const right = tips[1];
  return [
    c1[0] - R,
    c1[1] - R,
    Math.max(right[0] + p.tip, tips[0][0] + p.tip),
    c1[1] + R,
  ];
}

/** Returns a rotated ellipse as a closed path. */
export function ellipsePath(c: Point, rx: number, ry: number, deg: number) {
  const u: Point = [
    Math.cos((deg * Math.PI) / 180),
    Math.sin((deg * Math.PI) / 180),
  ];
  const p1 = add(c, u, -rx);
  const p2 = add(c, u, rx);
  const arc = `A${num(rx)} ${num(ry)} ${num(deg)} 1 1`;
  return `M${pt(p1)}${arc} ${pt(p2)}${arc} ${pt(p1)}Z`;
}

/**
 * Returns a rounded triangular ear whose base sits on a head of radius `hr`
 * and whose tip lies `reach` beyond it, in direction `deg` (y up).
 */
export function earPath(
  hc: Point,
  hr: number,
  deg: number,
  reach: number,
  halfWidthDeg: number,
  tipRadius: number,
): { d: string; tip: Point } {
  const a = (deg * Math.PI) / 180;
  const tip: Point = [
    hc[0] + (hr + reach) * Math.cos(a),
    hc[1] - (hr + reach) * Math.sin(a),
  ];
  const b1 = polar(hc, hr - 6, -(deg + halfWidthDeg));
  const b2 = polar(hc, hr - 6, -(deg - halfWidthDeg));
  const t1 = add(tip, unit(tip, b1), tipRadius * 1.8);
  const t2 = add(tip, unit(tip, b2), tipRadius * 1.8);
  const bulge = (p: Point, q: Point): Point => {
    const n = unit(p, q);
    return [(p[0] + q[0]) / 2 - n[1] * 4, (p[1] + q[1]) / 2 + n[0] * 4];
  };
  return {
    d:
      `M${pt(b1)}Q${pt(bulge(b1, t1))} ${pt(t1)}Q${pt(tip)} ${pt(t2)}` +
      `Q${pt(bulge(t2, b2))} ${pt(b2)}Z`,
    tip,
  };
}

/**
 * Returns a closed, smooth curve through `points` (a closed Catmull-Rom
 * spline written as cubic Bézier segments).
 */
export function smoothClosedPath(points: readonly Point[]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n] as Point;
  let d = `M${pt(at(0))}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Point = [
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
    ];
    const c2: Point = [
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
    ];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d}Z`;
}

/** A body pillow: a capsule whose long edges pinch in slightly at the middle. */
export interface PillowParams {
  readonly c: Point;
  readonly length: number;
  readonly thickness: number;
  /** Rotation in degrees (screen). */
  readonly angle: number;
  /** How far each long edge pinches in at the middle. */
  readonly waist: number;
}

/** Frame of a pillow: axis end centres, axis direction, and the up normal. */
export function pillowFrame(p: PillowParams) {
  const r = p.thickness / 2;
  const hl = p.length / 2 - r;
  const u: Point = [
    Math.cos((p.angle * Math.PI) / 180),
    Math.sin((p.angle * Math.PI) / 180),
  ];
  const up: Point = [u[1], -u[0]];
  return { r, a: add(p.c, u, -hl), b: add(p.c, u, hl), u, up };
}

/** Returns the pillow outline. */
export function pillowPath(p: PillowParams): string {
  const { r, a, b, up } = pillowFrame(p);
  const q = (t: number, s: number): Point => [
    a[0] + (b[0] - a[0]) * t + s * up[0],
    a[1] + (b[1] - a[1]) * t + s * up[1],
  ];
  const k = 2 * p.waist;
  return (
    `M${pt(q(0, r))}C${pt(q(0.3, r - k))} ${pt(q(0.7, r - k))} ${pt(q(1, r))}` +
    `A${num(r)} ${num(r)} 0 0 1 ${pt(q(1, -r))}` +
    `C${pt(q(0.7, -r + k))} ${pt(q(0.3, -r + k))} ${pt(q(0, -r))}` +
    `A${num(r)} ${num(r)} 0 0 1 ${pt(q(0, r))}Z`
  );
}

/**
 * Returns the distance from a point inside the moon's inner circle to the
 * crescent: to the inner arc, or to a tip where the crescent opens.
 */
export function moonClearance(p: Point, params: MoonParams): number {
  const { c2, r, tips } = moonGeometry(params);
  const angle = (q: Point) => Math.atan2(q[1] - c2[1], q[0] - c2[0]);
  const tipDistance = Math.min(...tips.map((t) => dist(p, t) - params.tip));
  // The opening spans the angles between the two tips, through the axis.
  const a0 = angle(tips[0]);
  const a1 = angle(tips[1]);
  const span = (a1 - a0 + 2 * Math.PI) % (2 * Math.PI);
  const ap = (angle(p) - a0 + 2 * Math.PI) % (2 * Math.PI);
  const inOpening = ap < span;
  return inOpening ? tipDistance : Math.min(tipDistance, r - dist(p, c2));
}
