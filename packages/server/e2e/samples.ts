// Fictional sample inquiries for the screenshot scripts (screenshots.ts and
// docs-screenshots.ts). Local D1 only.
import type { Locale } from '../src/shared/messages.ts';
import { queryDatabase } from './support.ts';

/** A fictional inquiry for the screenshots. */
export interface Sample {
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

type SampleSet = readonly Sample[];

/**
 * Fictional people and companies, with two suspected spam inquiries. There is
 * one set per language, so each admin UI language shows names in its own
 * language only. Both sets use the same ids, times, categories and statuses.
 */
export const sampleSets: Record<Locale, SampleSet> = {
  ja: [
    {
      id: '01JSAMPLE0000000000000001',
      minutesAgo: 25,
      name: '青木 蒼',
      email: 'so.aoki@example.jp',
      company: '株式会社つきあかり',
      phone: '03-1234-5678',
      category: 'sales',
      body: 'はじめまして。株式会社つきあかりの青木と申します。\n\n貴社のウェブサイト制作サービスについて、料金と納期の目安を教えていただけますでしょうか。社員 20 名ほどの会社で、会社案内とお知らせのページを考えています。\n\n来週以降でしたら、オンラインでの打ち合わせも可能です。どうぞよろしくお願いいたします。',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000002',
      minutesAgo: 140,
      name: '小林 凛',
      email: 'rin.kobayashi@example.jp',
      company: 'ひだまり出版',
      phone: '080-1234-5678',
      category: 'press',
      body: 'はじめまして。\n\n自社のサーバーを持たずにウェブサイトを運用している小さなチームについて、短い記事を書いています。来週、20 分ほどお話を伺える方はいらっしゃいますか？\n\nどうぞよろしくお願いいたします。\n小林',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000003',
      minutesAgo: 60 * 26,
      name: '伊藤 結',
      email: 'yui.ito@example.jp',
      company: 'さくら設計事務所',
      phone: null,
      category: 'sales',
      body: '先日お送りした見積もりの件で、追加の質問があります。ブログ機能は英語のページにも対応していますか？',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000004',
      minutesAgo: 60 * 30,
      name: '中村 陽斗',
      email: 'haruto.nakamura@example.jp',
      company: 'アトリエ月灯',
      phone: null,
      category: 'other',
      body: '先日はすぐにご返信いただき、ありがとうございました。新しいお問い合わせページは問題なく動いていて、チームも喜んでいます。',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000005',
      minutesAgo: 60 * 52,
      name: '渡辺 琴音',
      email: 'kotone.watanabe@example.jp',
      company: null,
      phone: '090-1234-5678',
      category: 'other',
      body: '採用ページを拝見しました。デザイナー職の募集について、応募の締め切りを教えてください。',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000006',
      minutesAgo: 60 * 75,
      name: '加藤 湊',
      email: 'minato.kato@example.jp',
      company: '株式会社みどり食品',
      phone: null,
      category: 'sales',
      body: '商品ページを季節ごとに更新したいと考えています。開発者の手を借りずに、こちらの担当者が文章を変更することはできますか？',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000007',
      minutesAgo: 60 * 99,
      name: '松本 紬',
      email: 'tsumugi.matsumoto@example.jp',
      company: '有限会社しずく工房',
      phone: '06-9876-5432',
      category: 'press',
      body: '地域の情報誌で、御社の取り組みを紹介させていただけないかと考えています。取材のご相談です。',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000008',
      minutesAgo: 60 * 120,
      name: '格安SEO対策のご案内',
      email: 'promo@example.net',
      company: 'www.example.net',
      phone: null,
      category: 'other',
      body: '本日中に月間 10,000 アクセスを実現します！ https://example.net/offer https://example.net/now www.example.net',
      status: 'unread',
      suspectedSpam: true,
      spamScore: 6,
      spamReasons: ['links:3', 'link_in_field'],
    },
    {
      id: '01JSAMPLE0000000000000009',
      minutesAgo: 60 * 170,
      name: '林 悠真',
      email: 'yuma.hayashi@example.jp',
      company: '株式会社ほしぞら',
      phone: null,
      category: 'sales',
      body: '資料のダウンロードができませんでした。PDF をメールで送っていただくことはできますか？',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000010',
      minutesAgo: 60 * 400,
      name: '当選のお知らせ',
      email: 'noreply@example.org',
      company: null,
      phone: null,
      category: 'other',
      body: '当選しました！賞品のお受け取りはこちら https://example.org/claim',
      status: 'read',
      suspectedSpam: true,
      spamScore: 4,
      spamReasons: ['honeypot', 'links:1', 'too_fast'],
    },
  ],
  en: [
    {
      id: '01JSAMPLE0000000000000001',
      minutesAgo: 25,
      name: 'Maya Brooks',
      email: 'maya.brooks@example.com',
      company: 'Northwind Studio',
      phone: '+1 555 0142',
      category: 'sales',
      body: 'Hello,\n\nI am Maya from Northwind Studio. Could you tell us roughly what a website project costs and how long it takes? We are a team of about 20 and are planning a company page and a news page.\n\nI am available for an online call next week. Thank you.',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000002',
      minutesAgo: 140,
      name: 'Daniel Reyes',
      email: 'daniel.reyes@example.com',
      company: 'Lakeside Review',
      phone: '+1 555 0177',
      category: 'press',
      body: 'Hello,\n\nI am writing a short feature about small teams that run their websites without their own servers. Would someone from your team be available for a 20-minute interview next week?\n\nBest regards,\nDaniel',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000003',
      minutesAgo: 60 * 26,
      name: 'Priya Shah',
      email: 'priya.shah@example.com',
      company: 'Willow Architects',
      phone: null,
      category: 'sales',
      body: 'I have a follow-up question about the estimate you sent last week. Does the blog also work for pages in other languages?',
      status: 'unread',
    },
    {
      id: '01JSAMPLE0000000000000004',
      minutesAgo: 60 * 30,
      name: 'Noah Bennett',
      email: 'noah.bennett@example.com',
      company: 'Atelier Lune',
      phone: null,
      category: 'other',
      body: 'Thanks for the quick reply yesterday. The new contact page works well on our side, and the team is happy with it.',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000005',
      minutesAgo: 60 * 52,
      name: 'Chloe Turner',
      email: 'chloe.turner@example.com',
      company: null,
      phone: '+1 555 0178',
      category: 'other',
      body: 'I saw your careers page. When is the application deadline for the designer position?',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000006',
      minutesAgo: 60 * 75,
      name: 'Sofia Alvarez',
      email: 'sofia.alvarez@example.com',
      company: 'Brightleaf Foods',
      phone: null,
      category: 'sales',
      body: 'We would like to update our product pages every season. Can the editors on our side change the text without help from a developer?',
      status: 'read',
    },
    {
      id: '01JSAMPLE0000000000000007',
      minutesAgo: 60 * 99,
      name: 'Elliot Hayes',
      email: 'elliot.hayes@example.com',
      company: 'Stillwater Studio',
      phone: '+1 555 0123',
      category: 'press',
      body: 'I am putting together a regional magazine and would like to feature your work. Could we talk about an interview?',
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
      name: 'Amara Okafor',
      email: 'amara.okafor@example.com',
      company: 'Lumen Goods',
      phone: null,
      category: 'sales',
      body: 'I could not download the brochure. Could you send the PDF by email instead?',
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
  ],
};

/** The Japanese set, for scripts that need only ids and flags. */
export const samples: SampleSet = sampleSets.ja;

const sql = (value: string | number | null) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

/**
 * Replaces the sample inquiries in the local D1 with the set for `locale`,
 * received `minutesAgo` before `now` (epoch milliseconds). Every inquiry is
 * unread again, as in a fresh database.
 */
export const insertSamples = async (
  stateDir: string,
  now: number,
  locale: Locale = 'ja',
): Promise<void> => {
  await queryDatabase(
    stateDir,
    "DELETE FROM submissions WHERE id LIKE '01JSAMPLE%'",
  );
  const rows = sampleSets[locale].map((s) => {
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
      sql(locale),
      sql(s.status),
      sql(s.suspectedSpam ? 1 : 0),
      sql(s.spamScore ?? 0),
      sql(JSON.stringify(s.spamReasons ?? [])),
      sql('/contact'),
      sql(locale === 'ja' ? 'JP' : 'US'),
      sql(created),
      sql(s.status === 'unread' ? null : created + 3_600_000),
    ].join(', ')})`;
  });
  await queryDatabase(
    stateDir,
    `INSERT INTO submissions (id, created_at, email, fields, form_version, locale, status, suspected_spam, spam_score, spam_reasons, page_path, country, consent_at, read_at) VALUES ${rows.join(', ')}`,
  );
};

/**
 * Inserts a submission sent with form version 2, which has the "Budget"
 * field, received five minutes before `now`.
 *
 * @returns The submission id.
 */
export const insertCustomFieldSample = async (
  stateDir: string,
  now: number,
): Promise<string> => {
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
