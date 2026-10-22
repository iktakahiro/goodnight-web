# Third-party logos and buttons

These files are vendored unmodified. `scripts/check-static.ts` rejects remote
assets, so the docs site serves them from this Worker instead of hotlinking.

| File                              | Source                                                                                            | Use                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `astro-logo-on-light.svg`         | [Astro press kit](https://astro.build/press/), "Logo on light"                                    | Top page, light theme. Links to Astro. |
| `astro-logo-gradient-on-dark.svg` | [Astro press kit](https://astro.build/press/), "Gradient logo on dark"                            | Top page, dark theme. Links to Astro.  |
| `../deploy-to-cloudflare.svg`     | [Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/button)                       | Source of `cloudflare-mark.svg`.       |
| `cloudflare-mark.svg`             | The cloud mark from `../deploy-to-cloudflare.svg`, paths and gradients unchanged, viewBox cropped | Deploy to Cloudflare buttons.          |

Keep the Astro logo at least 24 px tall with clear space around it, and do not
recolor or redraw any of these files. Replace a file with a newer official
version instead of editing it.

The Deploy to Cloudflare buttons on the top page use the site's button shape
in Cloudflare orange (`#f6821f`, from the official button) with the cloud mark
on the left. Elsewhere the top page names Cloudflare products as text only.
