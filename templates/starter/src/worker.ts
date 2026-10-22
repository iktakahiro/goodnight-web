// The Worker for this site. @goodnight-web/server serves the contact API and
// the admin screen; every other request gets the pages built by Astro.
// Keep this call as it is. See AGENTS.md.
import { createGoodnightWorker } from '@goodnight-web/server';
import { siteConfig } from '../site.config';

export default createGoodnightWorker({
  locale: siteConfig.defaultLocale,
  contact: { categories: siteConfig.contactCategories },
});
