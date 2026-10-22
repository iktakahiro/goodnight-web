import { ArrowUpRight } from 'lucide-react';
import { sitePath } from '../paths';

/**
 * The public starter repository that the Deploy to Cloudflare button copies
 * (docs/starter.md). A subdirectory of the monorepo would not build, because
 * `templates/starter` depends on workspace packages.
 *
 * TODO: the repository is not public yet. Confirm its name before release.
 */
export const starterRepositoryUrl =
  'https://github.com/iktakahiro/goodnight-web-starter';

/** Deploy to Cloudflare link for the public starter repository. */
export const deployToCloudflareUrl = `https://deploy.workers.cloudflare.com/?url=${starterRepositoryUrl}`;

/**
 * The Deploy to Cloudflare link, drawn with the site's button shape (radius,
 * height, padding, and type) in Cloudflare orange. The cloud mark is taken
 * unchanged from the official button (images/third-party/cloudflare-mark.svg).
 * On the orange primary button it sits on a white tile, because the orange
 * mark would disappear into the orange fill.
 */
export function DeployButton({
  variant = 'primary',
  className,
}: {
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const classes = ['landing-button', variant, 'deploy-button', className]
    .filter(Boolean)
    .join(' ');
  return (
    <a className={classes} href={deployToCloudflareUrl}>
      <span className='deploy-button-mark'>
        <img
          src={sitePath('images/third-party/cloudflare-mark.svg')}
          width={30}
          height={14}
          alt=''
        />
      </span>
      Deploy to Cloudflare
      <ArrowUpRight aria-hidden='true' />
    </a>
  );
}
