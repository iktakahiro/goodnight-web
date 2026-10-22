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
  closing: [
    [14, 'top', 2.5, 's'],
    [31, 'top', 1.25, 'm'],
    [68, 'top', 3.25, 's'],
    [84, 'top', 1.5, 'm'],
    [10, 'side', 13, 's'],
    [90, 'side', 16, 's'],
    [24, 'bottom', 1.75, 'm'],
    [77, 'bottom', 2.75, 's'],
  ],
} as const;

/**
 * The decoration of a night band: a few still stars and, on the architecture
 * band, a crescent moon. Nothing moves, and the whole layer is hidden from
 * assistive tools.
 */
export function NightSky({ variant }: { variant: keyof typeof stars }) {
  return (
    <div className={`night-sky night-sky-${variant}`} aria-hidden='true'>
      {stars[variant].map(([left, edge, offset, size]) => (
        <i
          key={`${left}-${edge}`}
          className={`night-star night-star-${size} night-star-${edge}`}
          style={{
            left: `${left}%`,
            [edge === 'bottom' ? 'bottom' : 'top']: `${offset}rem`,
          }}
        />
      ))}
      {variant === 'architecture' ? (
        <svg className='night-moon' viewBox='0 0 24 24' focusable='false'>
          <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
        </svg>
      ) : null}
    </div>
  );
}
