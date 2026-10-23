import type { ComponentProps } from 'react';
import type { MDXComponents } from 'mdx/types';
import { mdxComponents } from '../mdx-components';
import { DeployButton } from './deploy-button';
import { LandingArchitecture } from './landing-architecture';
import {
  AdminShowcase,
  BuiltOn,
  ClosingCta,
  Feature,
  FeatureGrid,
  FeatureNote,
  LandingSection,
} from './landing-sections';

/**
 * Components for the top page MDX (`index.mdx` and `ja/index.mdx`): the docs
 * components plus the landing sections. Headings are plain elements that keep
 * their ids, without the docs pages' anchor buttons.
 */
export const landingMdxComponents = {
  ...mdxComponents,
  h2: (props: ComponentProps<'h2'>) => <h2 {...props} />,
  h3: (props: ComponentProps<'h3'>) => <h3 {...props} />,
  AdminShowcase,
  BuiltOn,
  ClosingCta,
  DeployButton,
  Feature,
  FeatureGrid,
  FeatureNote,
  LandingArchitecture,
  LandingSection,
} satisfies MDXComponents;
