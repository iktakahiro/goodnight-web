import {
  LOCKUP_VIEW_BOX,
  LOGO_SHAPES,
  SYMBOL_VIEW_BOX,
} from './logo-shapes.gen.ts';

type Role = (typeof LOGO_SHAPES)[number]['role'];

// Literal class names, so that Tailwind generates them. The tokens are set
// for both themes in styles.css. The eyes are holes in the `mark` path.
const FILL: Record<Role, string> = {
  mark: 'fill-logo-mark',
  pillow: 'fill-logo-pillow',
  goodnight: 'fill-logo-wordmark',
  web: 'fill-logo-accent',
};

const isWordmark = (role: Role) => role === 'goodnight' || role === 'web';

const Shapes = ({ wordmark }: { wordmark: boolean }) =>
  LOGO_SHAPES.filter((shape) => wordmark || !isWordmark(shape.role)).map(
    (shape) => (
      <path key={shape.role} d={shape.d} className={FILL[shape.role]} />
    ),
  );

/**
 * The goodnight web symbol: a crescent moon holding a sleeping cat that hugs
 * a pillow. Decorative; the colors follow the light or dark theme.
 */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox={SYMBOL_VIEW_BOX} aria-hidden='true' className={className}>
    <Shapes wordmark={false} />
  </svg>
);

/**
 * The symbol with the `goodnight web` wordmark. `label` is the accessible
 * name; the colors follow the light or dark theme.
 */
export const LogoLockup = ({
  label,
  className,
}: {
  label: string;
  className?: string;
}) => (
  <svg
    viewBox={LOCKUP_VIEW_BOX}
    role='img'
    aria-label={label}
    className={className}
  >
    <Shapes wordmark />
  </svg>
);
