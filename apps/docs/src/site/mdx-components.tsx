import defaultComponents from 'fumadocs-ui/mdx';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import Link from 'fumadocs-core/link';
import {
  Inbox,
  KeyRound,
  Layers,
  Package,
  Rocket,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { AdminScreen } from './admin-screen';
import { ArchitectureDiagram } from './architecture-diagram';

/**
 * Standard Fumadocs components, the architecture diagram, admin screenshots
 * (`<AdminScreen>`), and the icons that cards pass to `<Card icon={...}>`,
 * available to all English and Japanese MDX.
 */
export const mdxComponents = {
  ...defaultComponents,
  Tabs,
  Tab,
  Steps,
  Step,
  Link,
  AdminScreen,
  ArchitectureDiagram,
  Inbox,
  KeyRound,
  Layers,
  Package,
  Rocket,
  ShieldCheck,
  Wrench,
} satisfies MDXComponents;
