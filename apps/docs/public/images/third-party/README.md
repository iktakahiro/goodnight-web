# Third-party logos and buttons

These files are vendored unmodified. `scripts/check-static.ts` rejects remote
assets, so the docs site serves them from this Worker instead of hotlinking.

| File                              | Source                                                                      | Use                                    |
| --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| `astro-logo-on-light.svg`         | [Astro press kit](https://astro.build/press/), "Logo on light"              | Top page, light theme. Links to Astro. |
| `astro-logo-gradient-on-dark.svg` | [Astro press kit](https://astro.build/press/), "Gradient logo on dark"      | Top page, dark theme. Links to Astro.  |
| `../deploy-to-cloudflare.svg`     | [Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/button) | Deploy to Cloudflare links.            |

Keep the Astro logo at least 24 px tall with clear space around it, and do not
recolor or redraw any of these files. Replace a file with a newer official
version instead of editing it.

The top page shows Cloudflare product names as text only, with no Cloudflare
logos.
