// Takes screenshots of the admin UI with fictional sample inquiries, for
// pull requests and the documentation. Local only, like the e2e test.
//
//   bun e2e/screenshots.ts <outDir>
//
// Port: E2E_PORT (default 8790). State: .wrangler/screenshot-state.
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  ADMIN_EMAIL,
  SETUP_TOKEN,
  addVirtualAuthenticator,
  buildPackage,
  freshDatabase,
  packageDir,
  queryDatabase,
  startDevServer,
  testVars,
} from './support.ts';

const outDir = resolve(process.argv[2] ?? join(packageDir, '.screenshots'));
const stateDir = join(packageDir, '.wrangler/screenshot-state');
const port = Number(process.env.E2E_PORT ?? '8790');

interface Sample {
  id: string;
  minutesAgo: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  category: string | null;
  body: string;
  status: 'new' | 'read' | 'done' | 'held' | 'spam';
  spamScore?: number;
  spamReasons?: string[];
}

// Fictional people and companies.
const samples: Sample[] = [
  {
    id: '01JSAMPLE0000000000000001',
    minutesAgo: 25,
    name: '山田 花子',
    email: 'hanako.yamada@example.jp',
    company: '株式会社つきあかり',
    phone: '03-1234-5678',
    category: 'sales',
    body: 'はじめまして。株式会社つきあかりの山田と申します。\n\n貴社のウェブサイト制作サービスについて、料金と納期の目安を教えていただけますでしょうか。社員 20 名ほどの会社で、会社案内とお知らせのページを考えています。\n\n来週以降でしたら、オンラインでの打ち合わせも可能です。どうぞよろしくお願いいたします。',
    status: 'new',
  },
  {
    id: '01JSAMPLE0000000000000002',
    minutesAgo: 140,
    name: 'Emily Carter',
    email: 'emily.carter@example.com',
    company: 'Northwind Studio',
    phone: '+1 555 0142',
    category: 'press',
    body: 'Hello,\n\nI am writing a short feature about small teams that run their websites without their own servers. Would someone from your team be available for a 20-minute interview next week?\n\nBest regards,\nEmily',
    status: 'new',
  },
  {
    id: '01JSAMPLE0000000000000003',
    minutesAgo: 60 * 26,
    name: '佐藤 健',
    email: 'ken.sato@example.jp',
    company: 'さくら設計事務所',
    phone: null,
    category: 'sales',
    body: '先日お送りした見積もりの件で、追加の質問があります。ブログ機能は英語のページにも対応していますか？',
    status: 'new',
  },
  {
    id: '01JSAMPLE0000000000000004',
    minutesAgo: 60 * 30,
    name: 'Lucas Moreau',
    email: 'lucas@example.fr',
    company: 'Atelier Lune',
    phone: null,
    category: 'other',
    body: 'Thanks for the quick reply yesterday. The new contact page works well on our side, and the team is happy with it.',
    status: 'read',
  },
  {
    id: '01JSAMPLE0000000000000005',
    minutesAgo: 60 * 52,
    name: '鈴木 美咲',
    email: 'misaki.suzuki@example.jp',
    company: null,
    phone: '090-1234-5678',
    category: 'other',
    body: '採用ページを拝見しました。デザイナー職の募集について、応募の締め切りを教えてください。',
    status: 'done',
  },
  {
    id: '01JSAMPLE0000000000000006',
    minutesAgo: 60 * 75,
    name: 'Priya Nair',
    email: 'priya.nair@example.in',
    company: 'Brightleaf Foods',
    phone: null,
    category: 'sales',
    body: 'We would like to update our product pages every season. Can the editors on our side change the text without help from a developer?',
    status: 'done',
  },
  {
    id: '01JSAMPLE0000000000000007',
    minutesAgo: 60 * 99,
    name: '高橋 直樹',
    email: 'naoki.takahashi@example.jp',
    company: '有限会社しずく工房',
    phone: '06-9876-5432',
    category: 'press',
    body: '地域の情報誌で、御社の取り組みを紹介させていただけないかと考えています。取材のご相談です。',
    status: 'read',
  },
  {
    id: '01JSAMPLE0000000000000008',
    minutesAgo: 60 * 120,
    name: 'Best SEO Offer',
    email: 'promo@example.net',
    company: 'www.example.net',
    phone: null,
    category: 'other',
    body: 'Get 10,000 visitors today! https://example.net/offer https://example.net/now www.example.net',
    status: 'held',
    spamScore: 6,
    spamReasons: ['links:3', 'link_in_name'],
  },
  {
    id: '01JSAMPLE0000000000000009',
    minutesAgo: 60 * 170,
    name: '中村 優',
    email: 'yu.nakamura@example.jp',
    company: '株式会社ほしぞら',
    phone: null,
    category: 'sales',
    body: '資料のダウンロードができませんでした。PDF をメールで送っていただくことはできますか？',
    status: 'done',
  },
  {
    id: '01JSAMPLE0000000000000010',
    minutesAgo: 60 * 400,
    name: 'Winner Notice',
    email: 'noreply@example.org',
    company: null,
    phone: null,
    category: 'other',
    body: 'You have been selected! Claim your prize at https://example.org/claim',
    status: 'spam',
    spamScore: 4,
    spamReasons: ['links:1', 'too_fast'],
  },
];

const sql = (value: string | number | null) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

const insertSamples = async () => {
  const now = Date.now();
  const rows = samples.map((s) => {
    const created = now - s.minutesAgo * 60_000;
    return `(${[
      sql(s.id),
      sql(created),
      sql(s.name),
      sql(s.email),
      sql(s.company),
      sql(s.phone),
      sql(s.category),
      sql(s.body),
      sql(s.status),
      sql(s.spamScore ?? 0),
      sql(JSON.stringify(s.spamReasons ?? [])),
      sql('/contact'),
      sql(s.email.endsWith('.jp') ? 'JP' : 'US'),
      sql(created),
      sql(s.status === 'new' ? null : created + 3_600_000),
    ].join(', ')})`;
  });
  await queryDatabase(
    stateDir,
    `INSERT INTO submissions (id, created_at, name, email, company, phone, category, body, status, spam_score, spam_reasons, page_path, country, consent_at, read_at) VALUES ${rows.join(', ')}`,
  );
};

const shoot = async (page: Page, name: string) => {
  // No hover effects; let transitions settle.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  console.log(`wrote ${join(outDir, name)}`);
};

const setLocale = async (page: Page, locale: 'ja' | 'en') => {
  await page.evaluate(
    (value) => localStorage.setItem('goodnight-web.admin.locale', value),
    locale,
  );
  await page.reload();
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  await buildPackage();
  await freshDatabase(stateDir);
  let server = await startDevServer({ port, stateDir, vars: testVars });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    // Keep the passkey autofill (conditional UI) from signing in by itself.
    await context.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    });
    const page = await context.newPage();
    await addVirtualAuthenticator(context, page);
    const { base } = server;

    await page.goto(`${base}/admin/setup`);
    await page.getByLabel('メールアドレス').waitFor();
    await page.getByLabel('メールアドレス').fill(ADMIN_EMAIL);
    await page.getByLabel('セットアップトークン').fill(SETUP_TOKEN);
    await page.getByLabel('メールアドレス').focus();
    await shoot(page, 'admin-setup-ja.png');
    await page.getByLabel('お名前').fill('管理者');
    await page.getByRole('button', { name: '次へ' }).click();
    await page.getByRole('button', { name: 'パスキーを登録' }).click();
    await page.getByRole('button', { name: 'お問い合わせ一覧を開く' }).click();

    await insertSamples();

    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.getByRole('button', { name: 'パスキーでログイン' }).waitFor();
    await shoot(page, 'admin-login-ja.png');
    await setLocale(page, 'en');
    await page
      .getByRole('button', { name: 'Sign in with a passkey' })
      .waitFor();
    await shoot(page, 'admin-login-en.png');
    await setLocale(page, 'ja');
    await page.getByRole('button', { name: 'パスキーでログイン' }).click();
    await page.waitForURL(`${base}/admin`);

    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-ja.png');
    await setLocale(page, 'en');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-en.png');
    await setLocale(page, 'ja');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-mobile-ja.png');
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${base}/admin/inquiries/${samples[1]?.id}`);
    await setLocale(page, 'en');
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-en.png');
    await setLocale(page, 'ja');
    await page.goto(`${base}/admin/inquiries/${samples[0]?.id}`);
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-ja.png');

    // Restart without TURNSTILE_SECRET: the contact form closes and the
    // admin UI shows the setup notice.
    await server.stop();
    const { TURNSTILE_SECRET: _omit, ...withoutTurnstile } = testVars;
    server = await startDevServer({ port, stateDir, vars: withoutTurnstile });
    await page.goto(`${base}/admin`);
    await page.getByTestId('turnstile-notice').waitFor();
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-turnstile-notice-ja.png');
  } finally {
    await browser.close();
    await server.stop();
  }
};

await main();
