/**
 * The goodnight-web mark (a crescent moon), same shape as the favicon. The
 * colors follow the light or dark theme.
 */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox='0 0 32 32' fill='none' aria-hidden='true' className={className}>
    <rect width='32' height='32' rx='9' className='fill-logo-tile' />
    <path
      d='M20.6 21.8a8 8 0 0 1-7.9-11.6A8 8 0 1 0 23.5 20.4a8 8 0 0 1-2.9 1.4Z'
      className='fill-logo-moon'
    />
    <circle cx='22' cy='10' r='1.3' className='fill-logo-star' />
    <circle cx='25' cy='14.5' r='0.9' className='fill-logo-star' />
  </svg>
);
