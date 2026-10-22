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
  ui,
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
  status: 'unread' | 'read';
  suspectedSpam?: boolean;
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
    status: 'unread',
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
    status: 'unread',
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
    status: 'unread',
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
    status: 'read',
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
    status: 'read',
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
    status: 'unread',
    suspectedSpam: true,
    spamScore: 6,
    spamReasons: ['links:3', 'link_in_field'],
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
    status: 'read',
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
    status: 'read',
    suspectedSpam: true,
    spamScore: 4,
    spamReasons: ['honeypot', 'links:1', 'too_fast'],
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
    // Values of version 1 of the form, keyed by its field ids.
    const fields = Object.fromEntries(
      Object.entries({
        f_name: s.name,
        f_company: s.company,
        f_phone: s.phone,
        f_category: s.category,
        f_message: s.body,
      }).filter(([, value]) => value !== null),
    );
    return `(${[
      sql(s.id),
      sql(created),
      sql(s.email),
      sql(JSON.stringify(fields)),
      sql(1),
      sql(s.email.endsWith('.jp') ? 'ja' : 'en'),
      sql(s.status),
      sql(s.suspectedSpam ? 1 : 0),
      sql(s.spamScore ?? 0),
      sql(JSON.stringify(s.spamReasons ?? [])),
      sql('/contact'),
      sql(s.email.endsWith('.jp') ? 'JP' : 'US'),
      sql(created),
      sql(s.status === 'unread' ? null : created + 3_600_000),
    ].join(', ')})`;
  });
  await queryDatabase(
    stateDir,
    `INSERT INTO submissions (id, created_at, email, fields, form_version, locale, status, suspected_spam, spam_score, spam_reasons, page_path, country, consent_at, read_at) VALUES ${rows.join(', ')}`,
  );
};

/** A submission sent with version 2, which has the "Budget" field. */
const insertCustomFieldSample = async (): Promise<string> => {
  const [row] = await queryDatabase(
    stateDir,
    "SELECT json_extract(value, '$.id') AS id FROM form_definitions, json_each(form_definitions.definition, '$.fields') WHERE version = 2 AND json_extract(value, '$.label.en') = 'Budget'",
  );
  const budgetId = String(row?.id);
  const id = '01JSAMPLE0000000000000011';
  const fields = {
    f_name: '小林 葵',
    f_company: '株式会社あさひ製作所',
    f_category: 'service',
    f_message:
      '工場の休憩室に置くテーブルと椅子を 12 席分、入れ替えたいと考えています。\n\n現地を見ていただいたうえで、お見積もりをお願いできますか。',
    [budgetId]: '80 万円前後',
  };
  const now = Date.now();
  await queryDatabase(
    stateDir,
    `INSERT INTO submissions (id, created_at, email, fields, form_version, locale, status, spam_score, spam_reasons, page_path, country, consent_at) VALUES (${[
      sql(id),
      sql(now - 5 * 60_000),
      sql('aoi.kobayashi@example.jp'),
      sql(JSON.stringify(fields)),
      sql(2),
      sql('ja'),
      sql('unread'),
      sql(0),
      sql('[]'),
      sql('/contact'),
      sql('JP'),
      sql(now),
    ].join(', ')})`,
  );
  return id;
};

const shoot = async (page: Page, name: string) => {
  // No hover effects; let transitions settle.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  console.log(`wrote ${join(outDir, name)}`);
};

const shootFull = async (page: Page, path: string) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
};

/**
 * Switches the admin UI to dark mode when it has a theme switch.
 *
 * @returns `false` when the admin UI has no dark mode.
 */
const setDarkMode = async (page: Page): Promise<boolean> => {
  const switched = await page.evaluate(() => {
    if (!document.querySelector('[data-testid="theme-switch"]')) return false;
    localStorage.setItem('goodnight-web.admin.theme', 'dark');
    return true;
  });
  if (switched) await page.reload();
  return switched;
};

const setLocale = async (page: Page, locale: 'ja' | 'en') => {
  await page.evaluate(
    (value) => localStorage.setItem('goodnight-web.admin.locale', value),
    locale,
  );
  await page.reload();
};

const setTheme = async (page: Page, theme: 'light' | 'dark') => {
  await page.evaluate(
    (value) => localStorage.setItem('goodnight-web.admin.theme', value),
    theme,
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
    await page.getByLabel(ui('ja', 'admin.setup.email')).waitFor();
    await page.getByLabel(ui('ja', 'admin.setup.email')).fill(ADMIN_EMAIL);
    await page.getByLabel(ui('ja', 'admin.setup.token')).fill(SETUP_TOKEN);
    await page.getByLabel(ui('ja', 'admin.setup.email')).focus();
    await shoot(page, 'admin-setup-ja.png');
    await page.getByLabel(ui('ja', 'admin.setup.name')).fill('管理者');
    await page
      .getByRole('button', { name: ui('ja', 'setup.continue') })
      .click();
    await page
      .getByRole('button', { name: ui('ja', 'admin.setup.registerPasskey') })
      .click();
    await page
      .getByRole('button', { name: ui('ja', 'setup.goToList') })
      .click();

    await insertSamples();

    await page.getByRole('button', { name: ui('ja', 'admin.signOut') }).click();
    await page
      .getByRole('button', { name: ui('ja', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-ja.png');
    await setLocale(page, 'en');
    await page
      .getByRole('button', { name: ui('en', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-en.png');
    await setLocale(page, 'ja');
    await setTheme(page, 'dark');
    await page
      .getByRole('button', { name: ui('ja', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-ja-dark.png');
    await setTheme(page, 'light');
    await page.getByRole('button', { name: ui('ja', 'admin.signIn') }).click();
    await page.waitForURL(`${base}/admin`);

    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-ja.png');
    await page.goto(`${base}/admin?view=spam`);
    await page.getByTestId('spam-view-hint').waitFor();
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-spam-ja.png');
    const spamSample = samples.find((sample) => sample.suspectedSpam);
    await page.goto(`${base}/admin/inquiries/${spamSample?.id}`);
    await page.getByTestId('spam-notice').waitFor();
    await shoot(page, 'admin-detail-spam-ja.png');
    await setTheme(page, 'dark');
    await page.getByTestId('spam-notice').waitFor();
    await shoot(page, 'admin-detail-spam-ja-dark.png');
    await page.goto(`${base}/admin?view=spam`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-spam-ja-dark.png');
    await setTheme(page, 'light');
    await page.goto(`${base}/admin`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await setLocale(page, 'en');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-en.png');
    await setTheme(page, 'dark');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-en-dark.png');
    await setLocale(page, 'ja');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-ja-dark.png');
    await setTheme(page, 'light');
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
    await setTheme(page, 'dark');
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-ja-dark.png');
    await setTheme(page, 'light');

    // The form editor: add a "Budget" field and save it as version 2.
    const formDir = join(outDir, 'form-editor');
    await mkdir(formDir, { recursive: true });
    await page.goto(`${base}/admin/form`);
    await page.getByTestId('form-add-field').waitFor();
    await page.getByTestId('form-add-field').click();
    await page.getByLabel(ui('ja', 'form.labelJa')).last().fill('ご予算');
    await page.getByLabel(ui('ja', 'form.labelEn')).last().fill('Budget');
    await page.getByTestId('form-save').click();
    await page.getByText(ui('ja', 'form.saved', { version: 2 })).waitFor();
    await page.waitForTimeout(4500); // Let the toast close.
    await page.evaluate(() => window.scrollTo(0, 0));
    await shootFull(page, join(formDir, 'editor-ja-light.png'));
    // A tall viewport, so the sticky header does not cover the card.
    await page.setViewportSize({ width: 1280, height: 2200 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('form-preview-card').screenshot({
      path: join(formDir, 'editor-preview-ja.png'),
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log(`wrote ${join(formDir, 'editor-preview-ja.png')}`);
    const customId = await insertCustomFieldSample();
    await page.goto(`${base}/admin/inquiries/${customId}`);
    await page.getByText('80 万円前後').waitFor();
    await shootFull(page, join(formDir, 'detail-custom-field-ja.png'));
    await page.goto(`${base}/admin`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-v2-ja.png');
    if (await setDarkMode(page)) {
      await page.goto(`${base}/admin/form`);
      await page.getByTestId('form-add-field').waitFor();
      await shootFull(page, join(formDir, 'editor-ja-dark.png'));
      await page.goto(`${base}/admin/inquiries/${customId}`);
      await page.getByText('80 万円前後').waitFor();
      await shootFull(page, join(formDir, 'detail-custom-field-ja-dark.png'));
      // A narrow window, scrolled sideways: the sticky columns, their
      // shadow, and the edge fade on the dark surfaces.
      await page.setViewportSize({ width: 820, height: 800 });
      await page.goto(`${base}/admin`);
      await page.getByTestId('inquiry-row').first().waitFor();
      await page
        .getByTestId('inquiry-table-scroll')
        .evaluate((element) => element.scrollBy({ left: 160 }));
      await shoot(page, 'admin-list-scrolled-ja-dark.png');
      await page.setViewportSize({ width: 1280, height: 800 });
    }

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
