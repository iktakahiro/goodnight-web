import { Lock } from 'lucide-react';

/**
 * The decorative title bar of a screenshot frame: three window dots and an
 * address pill. Hidden from assistive tools; the image carries the alt text.
 */
export function WindowBar({ address }: { address: string }) {
  return (
    <div className='window-bar' aria-hidden='true'>
      <i />
      <i />
      <i />
      <span>
        <Lock />
        {address}
      </span>
    </div>
  );
}
