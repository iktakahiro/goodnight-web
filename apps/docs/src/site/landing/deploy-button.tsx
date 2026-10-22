import { sitePath } from '../paths';

/**
 * The public starter repository that the Deploy to Cloudflare button copies
 * (docs/starter.md). A subdirectory of the monorepo would not build, because
 * `templates/starter` depends on workspace packages.
 */
export const starterRepositoryUrl =
  'https://github.com/iktakahiro/goodnight-web-starter';

/** Deploy to Cloudflare link for the public starter repository. */
export const deployToCloudflareUrl = `https://deploy.workers.cloudflare.com/?url=${starterRepositoryUrl}`;

/**
 * The official Deploy to Cloudflare button. The image is vendored unmodified
 * in `public/images/deploy-to-cloudflare.svg`, because the docs site loads no
 * remote assets.
 */
export function DeployButton({ className }: { className?: string }) {
  return (
    <a
      className={className ? `deploy-button ${className}` : 'deploy-button'}
      href={deployToCloudflareUrl}
    >
      <img
        src={sitePath('images/deploy-to-cloudflare.svg')}
        alt='Deploy to Cloudflare'
        width={184}
        height={39}
      />
    </a>
  );
}
