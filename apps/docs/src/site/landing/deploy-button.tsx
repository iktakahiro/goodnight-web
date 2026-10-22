import { ArrowUpRight } from 'lucide-react';

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
 * The Deploy to Cloudflare link, drawn as one of the site's own buttons with
 * a text label only. The Cloudflare logo is not used.
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
      Deploy to Cloudflare
      <ArrowUpRight aria-hidden='true' />
    </a>
  );
}
