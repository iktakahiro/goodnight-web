import { cn } from '../../shared/ui/cn.ts';
import {
  LOCKUP_VIEW_BOX,
  LOGO_SHAPES,
  SYMBOL_VIEW_BOX,
} from './logo-shapes.gen.ts';

type Role = (typeof LOGO_SHAPES)[number]['role'];

// Literal class names, so that Tailwind generates them. The tokens are set
// for both themes in styles.css.
const FILL: Record<Role, string> = {
  moon: 'fill-logo-mark',
  cat: 'fill-logo-mark',
  pillow: 'fill-logo-pillow',
  eyes: 'fill-logo-eyes',
  goodnight: 'fill-logo-wordmark',
  web: 'fill-logo-accent',
};
const STROKE: Record<Role, string> = {
  moon: 'stroke-logo-mark',
  cat: 'stroke-logo-mark',
  pillow: 'stroke-logo-pillow',
  eyes: 'stroke-logo-eyes',
  goodnight: 'stroke-logo-wordmark',
  web: 'stroke-logo-accent',
};

const isWordmark = (role: Role) => role === 'goodnight' || role === 'web';

const Shapes = ({ wordmark }: { wordmark: boolean }) =>
  LOGO_SHAPES.filter((shape) => wordmark || !isWordmark(shape.role)).map(
    (shape) => {
      if (shape.line !== undefined) {
        return (
          <path
            key={shape.d}
            d={shape.d}
            fill='none'
            strokeLinecap='round'
            strokeWidth={shape.line}
            className={STROKE[shape.role]}
          />
        );
      }
      return (
        <path
          key={shape.d}
          d={shape.d}
          strokeWidth={shape.outline}
          paintOrder={shape.outline === undefined ? undefined : 'stroke'}
          className={cn(
            FILL[shape.role],
            shape.outline !== undefined && STROKE.pillow,
          )}
        />
      );
    },
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
