/** Languages supported by the API messages and the admin UI. */
export type Locale = 'ja' | 'en';

/** All supported locales, in the order the admin UI offers them. */
export const LOCALES: readonly Locale[] = ['ja', 'en'];

const en = {
  // API errors. The key after `error.` is the `code` in error responses.
  'error.contact_unavailable':
    'The contact form is not available yet. Please try again later.',
  'error.forbidden_origin':
    'This request came from a page that is not allowed.',
  'error.unsupported_media_type': 'Send the request as JSON.',
  'error.payload_too_large': 'The message is too long.',
  'error.form_outdated':
    'The form was updated while you were filling it in. Check the fields and send again.',
  'error.form_conflict':
    'Someone else saved the form in the meantime. Reload to see the latest version.',
  'error.invalid_json': 'The request could not be read.',
  'error.invalid_input': 'Some fields are missing or not valid.',
  'error.turnstile_failed':
    'We could not confirm that you are human. Reload the page and try again.',
  'error.rate_limited': 'Too many requests. Wait a minute and try again.',
  'error.server_error': 'Something went wrong on the server. Please try again.',
  'error.network_error': 'Could not reach the server. Check your connection.',
  'error.not_found': 'Not found.',
  'error.unauthorized': 'Sign in to continue.',
  'error.forbidden': 'Your account cannot use the admin screen.',
  'error.passkey_required': 'Register a passkey to continue.',
  'error.auth_unavailable':
    'Sign-in is not configured. Set APP_SECRET (at least 32 characters) for this site. If BETTER_AUTH_SECRET is set, it must also be at least 32 characters.',
  'error.setup_unavailable':
    'Setup is not configured. Set APP_SECRET (at least 32 characters) and ADMIN_EMAILS for this site. If SETUP_TOKEN, BETTER_AUTH_SECRET, or IP_HASH_SECRET is set, it must also be at least 32 characters.',
  'error.setup_closed': 'Setup is already complete.',
  'error.invalid_setup_token': 'The setup token is not correct.',
  'error.email_not_allowed': 'This email address is not in ADMIN_EMAILS.',
  'error.https_required': 'Open this page with https:// and try again.',
  'error.access_denied':
    'Cloudflare Access did not let this request through. Sign in to Cloudflare Access and try again.',
  'error.access_unavailable':
    'Cloudflare Access cannot be checked right now. Set both ACCESS_AUD and ACCESS_TEAM_DOMAIN, or neither, and try again.',

  // Contact form fields (validation messages shown next to a field).
  'field.email': 'Email',
  'field.consent': 'I agree to the privacy policy',
  'field.required': 'Required.',
  'field.invalid': 'Check this field.',
  'field.too_long': 'Too long.',

  // Submission statuses.
  'status.unread': 'Unread',
  'status.read': 'Read',

  // Contact form states.
  'contact.sent': 'Thank you. Your message has been sent.',
  'contact.unavailable':
    'The contact form is not available yet. Please try again later.',

  // Admin UI shared strings.
  'admin.title': 'Inquiries',
  'admin.unreadCount': '{count} unread',
  'admin.signIn': 'Sign in with a passkey',
  'admin.signOut': 'Sign out',
  'admin.setup.title': 'Create the first admin',
  'admin.setup.token': 'Setup token',
  'admin.setup.email': 'Email address',
  'admin.setup.name': 'Your name',
  'admin.setup.registerPasskey': 'Register a passkey',
  'admin.export': 'Download CSV',
  'admin.delete': 'Delete',
  'admin.deleteConfirm': 'Delete this inquiry? This cannot be undone.',
  'admin.empty': 'No inquiries yet.',
  'admin.turnstileNotice':
    'The contact form is not accepting messages. Turnstile is not set up yet.',
  'admin.turnstileNoticeLink': 'How to set up Turnstile',
  'admin.language': 'Language',

  // Slack notification. No personal data and no message body.
  'notify.newInquiry': '1 new inquiry',
  'notify.receivedAt': 'Received: {time}',
  'notify.open': 'Open the admin screen',
} as const;

/** Message keys. Every locale defines every key. */
export type MessageKey = keyof typeof en;

/** One locale's messages. */
export type MessageCatalog = Readonly<Record<MessageKey, string>>;

const ja: MessageCatalog = {
  'error.contact_unavailable':
    'お問い合わせフォームは準備中です。時間をおいてお試しください。',
  'error.forbidden_origin': '許可されていないページからの送信です。',
  'error.unsupported_media_type': 'JSON 形式で送信してください。',
  'error.payload_too_large': '送信内容が長すぎます。',
  'error.form_outdated':
    '入力中にフォームが更新されました。項目を確認して、もう一度送信してください。',
  'error.form_conflict':
    'ほかの人が先にフォームを保存しました。再読み込みして最新の内容を確認してください。',
  'error.invalid_json': '送信内容を読み取れませんでした。',
  'error.invalid_input': '未入力の項目か、正しくない項目があります。',
  'error.turnstile_failed':
    '人による送信であることを確認できませんでした。ページを再読み込みして、もう一度お試しください。',
  'error.rate_limited':
    '送信が多すぎます。1 分ほど待ってから、もう一度お試しください。',
  'error.server_error':
    'サーバーでエラーが起きました。もう一度お試しください。',
  'error.network_error':
    'サーバーに接続できませんでした。通信環境を確認してください。',
  'error.not_found': '見つかりません。',
  'error.unauthorized': 'ログインしてください。',
  'error.forbidden': 'このアカウントでは管理画面を使えません。',
  'error.passkey_required': 'Passkey を登録してください。',
  'error.auth_unavailable':
    'ログインに必要な設定がありません。このサイトに APP_SECRET（32 文字以上）を設定してください。BETTER_AUTH_SECRET を設定している場合は、それも 32 文字以上にしてください。',
  'error.setup_unavailable':
    'セットアップに必要な設定がありません。このサイトに APP_SECRET（32 文字以上）と ADMIN_EMAILS を設定してください。SETUP_TOKEN、BETTER_AUTH_SECRET、IP_HASH_SECRET を設定している場合は、それも 32 文字以上にしてください。',
  'error.setup_closed': 'セットアップは完了しています。',
  'error.invalid_setup_token': 'セットアップトークンが正しくありません。',
  'error.email_not_allowed':
    'このメールアドレスは ADMIN_EMAILS に含まれていません。',
  'error.https_required':
    'https:// で始まるアドレスでこのページを開いて、もう一度お試しください。',
  'error.access_denied':
    'Cloudflare Access がこのリクエストを通しませんでした。Cloudflare Access でログインしてから、もう一度お試しください。',
  'error.access_unavailable':
    'Cloudflare Access を確認できません。ACCESS_AUD と ACCESS_TEAM_DOMAIN は両方設定するか、両方とも設定しないでください。そのうえで、もう一度お試しください。',

  'field.email': 'メールアドレス',
  'field.consent': 'プライバシーポリシーに同意する',
  'field.required': '入力してください。',
  'field.invalid': '入力内容を確認してください。',
  'field.too_long': '長すぎます。',

  'status.unread': '未読',
  'status.read': '既読',

  'contact.sent': 'ありがとうございます。お問い合わせを送信しました。',
  'contact.unavailable':
    'お問い合わせフォームは準備中です。時間をおいてお試しください。',

  'admin.title': 'お問い合わせ',
  'admin.unreadCount': '未読 {count} 件',
  'admin.signIn': 'Passkeyでログイン',
  'admin.signOut': 'ログアウト',
  'admin.setup.title': '最初の管理者を登録',
  'admin.setup.token': 'セットアップトークン',
  'admin.setup.email': 'メールアドレス',
  'admin.setup.name': 'お名前',
  'admin.setup.registerPasskey': 'Passkeyを登録',
  'admin.export': 'CSV をダウンロード',
  'admin.delete': '削除',
  'admin.deleteConfirm':
    'このお問い合わせを削除しますか？この操作は元に戻せません。',
  'admin.empty': 'お問い合わせはまだありません。',
  'admin.turnstileNotice':
    'お問い合わせフォームは受け付けを停止しています。Turnstile がまだ設定されていません。',
  'admin.turnstileNoticeLink': 'Turnstile の設定方法',
  'admin.language': '言語',

  'notify.newInquiry': '新しいお問い合わせが 1 件あります',
  'notify.receivedAt': '受信日時: {time}',
  'notify.open': '管理画面を開く',
};

/** Message catalogs for every locale. */
export const messages: Readonly<Record<Locale, MessageCatalog>> = { en, ja };

/**
 * Returns the message for `key` in `locale`, with `{name}` placeholders
 * replaced from `params`. Unknown placeholders are left as they are.
 */
export const translate = (
  locale: Locale,
  key: MessageKey,
  params: Readonly<Record<string, string | number>> = {},
): string =>
  messages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );

/**
 * Picks `ja` or `en` from an `Accept-Language` header value.
 *
 * Takes the first supported language in the header's order of preference.
 * Returns `fallback` when none matches.
 */
export const pickLocale = (
  acceptLanguage: string | null | undefined,
  fallback: Locale = 'en',
): Locale => {
  if (!acceptLanguage) return fallback;
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return {
        language: tag.trim().toLowerCase().split('-')[0] ?? '',
        q: q ? Number(q.slice(2)) : 1,
        index,
      };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { language } of ranked) {
    if (language === 'ja' || language === 'en') return language;
  }
  return fallback;
};
