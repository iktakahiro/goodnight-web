import { useI18n } from 'fumadocs-ui/contexts/i18n';
import {
  CircleCheck,
  FileText,
  Folder,
  GitMerge,
  GitPullRequest,
  Lock,
} from 'lucide-react';

const copy = {
  en: {
    file: 'src/content/news/en/new-workshop.md',
    lines: [
      [1, '---'],
      [2, 'title: We have moved to a new workshop'],
      [3, 'date: 2026-09-01'],
      [4, '---'],
      [5, 'On September 1, 2026, we moved our workshop to the address below.'],
    ],
    database: 'Your own database',
    inquiries: [
      ['Emily Carter', 'emily@example.com', '10-23 09:12'],
      ['Hanako Yamada', 'yamada@example.com', '10-22 17:40'],
    ],
    official: 'Official goodnight-web update',
    merge: 'Merge pull request',
    tree: {
      content: 'News, blog',
      pages: 'Pages',
      github: 'Update checks',
      agents: 'Guide for AI tools',
      config: 'Company info, colors',
      wrangler: 'Cloudflare settings',
    },
  },
  ja: {
    file: 'src/content/news/ja/new-workshop.md',
    lines: [
      [1, '---'],
      [2, 'title: 工房を移転しました'],
      [3, 'date: 2026-09-01'],
      [4, '---'],
      [5, '2026年9月1日から、工房を下記の所在地に移転しました。'],
    ],
    database: '自分のデータベース',
    inquiries: [
      ['山田 花子', 'yamada@example.com', '10-23 09:12'],
      ['Emily Carter', 'emily@example.com', '10-22 17:40'],
    ],
    official: 'goodnight-web の公式アップデートです',
    merge: 'マージ',
    tree: {
      content: 'お知らせ・ブログ',
      pages: 'ページ',
      github: '更新の確認',
      agents: 'AI ツール向けガイド',
      config: '会社情報・色',
      wrangler: 'Cloudflare の設定',
    },
  },
} as const;

type Copy = (typeof copy)[keyof typeof copy];

/** A news file being added, with `AGENTS.md` open in the next tab. */
function FilesVignette({ text }: { text: Copy }) {
  return (
    <div className='vignette vignette-editor'>
      <div className='vignette-tabs'>
        <span className='is-active'>
          <FileText />
          new-workshop.md
        </span>
        <span>
          <FileText />
          AGENTS.md
        </span>
      </div>
      <p className='vignette-path'>{text.file}</p>
      <ol className='vignette-code'>
        {text.lines.map(([number, line]) => (
          <li key={number}>
            <span className='vignette-code-number'>{number}</span>
            <span className='vignette-code-sign'>+</span>
            <code>{line}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Two inquiry rows stored in the site's own D1 database. */
function DataVignette({ text }: { text: Copy }) {
  return (
    <div className='vignette vignette-data'>
      <p className='vignette-data-head'>
        <Lock />
        <b>{text.database}</b>
        <span data-brand='cloudflare-d1'>D1</span>
      </p>
      <ul>
        {text.inquiries.map(([name, email, time], index) => (
          <li key={email} className={index === 0 ? 'is-unread' : undefined}>
            <i />
            <b>{name}</b>
            <span>{email}</span>
            <time>{time}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A Dependabot pull request with the update check comment. */
function PullRequestVignette({ text }: { text: Copy }) {
  return (
    <div className='vignette vignette-pr'>
      <p className='vignette-pr-title'>
        <GitPullRequest />
        <b>Bump the goodnight-web group with 1 update</b>
      </p>
      <p className='vignette-pr-author'>dependabot[bot]</p>
      <p className='vignette-pr-check'>
        <CircleCheck />
        {text.official}
      </p>
      <span className='vignette-pr-merge'>
        <GitMerge />
        {text.merge}
      </span>
    </div>
  );
}

/** The top of the starter kit repository. */
function StarterVignette({ text }: { text: Copy }) {
  const rows = [
    [0, 'folder', 'src/', ''],
    [1, 'folder', 'content/', text.tree.content],
    [1, 'folder', 'pages/', text.tree.pages],
    [0, 'folder', '.github/', text.tree.github],
    [0, 'file', 'AGENTS.md', text.tree.agents],
    [0, 'file', 'site.config.ts', text.tree.config],
    [0, 'file', 'wrangler.jsonc', text.tree.wrangler],
  ] as const;
  return (
    <div className='vignette vignette-tree'>
      <ul>
        {rows.map(([depth, kind, name, note]) => (
          <li key={name} data-depth={depth}>
            {kind === 'folder' ? <Folder /> : <FileText />}
            <code>{name}</code>
            {note ? <span>{note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const vignettes = {
  files: FilesVignette,
  data: DataVignette,
  'pull-request': PullRequestVignette,
  starter: StarterVignette,
} as const;

/** The name of a feature card illustration. */
export type FeatureVignetteName = keyof typeof vignettes;

/**
 * A small illustration of a feature, drawn in HTML and icons in the page's
 * language. It is decorative: the card's heading and text carry the meaning,
 * so the illustration is hidden from assistive tools.
 */
export function FeatureVignette({ name }: { name: FeatureVignetteName }) {
  const text = useI18n().locale === 'ja' ? copy.ja : copy.en;
  const Vignette = vignettes[name];
  return (
    <div className='feature-visual' aria-hidden='true'>
      <Vignette text={text} />
    </div>
  );
}
