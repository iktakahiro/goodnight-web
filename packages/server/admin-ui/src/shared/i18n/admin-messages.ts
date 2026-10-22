import {
  messages as sharedMessages,
  type Locale,
  type MessageKey as SharedMessageKey,
} from '../../../../src/shared/messages.ts';

// Strings used only by the admin UI. Strings that the API or the contact form
// also use (errors, statuses, field names) come from the shared catalog in
// src/shared/messages.ts.
const en = {
  'app.name': 'goodnight-web',
  'app.adminLabel': 'Admin',
  'app.skipToContent': 'Skip to content',
  'app.loading': 'Loading…',
  'app.retry': 'Try again',
  'app.notFound.title': 'Page not found',
  'app.notFound.body': 'There is no admin page at this URL.',
  'app.backToList': 'Back to inquiries',
  'app.errorTitle': 'Something went wrong',

  'language.ja': '日本語',
  'language.en': 'English',

  'header.unread': 'Unread inquiries',
  'header.signedInAs': 'Signed in as {email}',

  'login.title': 'Sign in to the admin screen',
  'login.lead': 'Use the passkey you registered for this site.',
  'login.signingIn': 'Waiting for your passkey…',
  'login.autofillLabel': 'Account',
  'login.autofillHint':
    'Select this field to pick a saved passkey, or use the button below.',
  'login.failed':
    'Could not sign in. Either the prompt was cancelled, or this passkey is not registered for this site. Please try again.',
  'login.setupOpen': 'No admin exists yet.',
  'login.setupLink': 'Create the first admin',
  'login.setupNote':
    'Only people who registered a passkey on this site can sign in.',

  'setup.lead':
    'Enter the SETUP_TOKEN secret and an email address listed in ADMIN_EMAILS. Then register a passkey on this device.',
  'setup.step1': 'Check the setup token',
  'setup.step2': 'Register a passkey',
  'setup.step3': 'Done',
  'setup.stepOf': 'Step {current} of {total}',
  'setup.tokenHint': 'The value of the SETUP_TOKEN secret in Cloudflare.',
  'setup.emailHint': 'An email address listed in ADMIN_EMAILS.',
  'setup.nameHint': 'Optional. Shown in the admin screen.',
  'setup.continue': 'Continue',
  'setup.checking': 'Checking…',
  'setup.passkeyLead':
    'A passkey replaces a password. Your device or password manager stores it and asks for your fingerprint, face, or PIN when you sign in.',
  'setup.passkeyDomain':
    'A passkey works only on this domain ({host}). If you plan to move the admin screen to your own domain, stop here and set up that domain first.',
  'setup.registering': 'Waiting for your passkey…',
  'setup.passkeyFailed':
    'Could not register the passkey. Either the prompt was cancelled, or your browser does not support passkeys. Please try again.',
  'setup.doneTitle': 'Setup is complete',
  'setup.doneLead':
    'You are now signed in. Next time, sign in with the passkey you just registered. Setup is now closed.',
  'setup.goToList': 'Open inquiries',
  'setup.closedTitle': 'Setup is already complete',
  'setup.closedLead':
    'An admin already exists. Sign in with your passkey instead.',
  'setup.unavailableTitle': 'Setup is not configured',
  'setup.goToLogin': 'Go to sign-in',

  'list.title': 'Inquiries',
  'list.total': '{count} in total',
  'list.sortNewest': 'Newest first',
  'list.filterLabel': 'Filter by status',
  'list.filter.all': 'All',
  'list.emptyFiltered': 'No inquiries with this status.',
  'list.emptyHint':
    'Inquiries from the contact form will appear here, newest first.',
  'list.range': '{from}–{to} of {total}',
  'list.previous': 'Previous',
  'list.next': 'Next',
  'list.pagination': 'Pages',
  'list.unreadMark': 'Unread',
  'list.exportHint': 'Download all inquiries with the selected status as CSV.',

  'detail.receivedAt': 'Received',
  'detail.message': 'Message',
  'detail.contact': 'Contact details',
  'detail.statusLabel': 'Status',
  'detail.statusChanged': 'Status changed to “{status}”.',
  'detail.statusFailed': 'The status could not be changed.',
  'detail.reply': 'Reply by email',
  'detail.pagePath': 'Sent from',
  'detail.country': 'Country',
  'detail.spamScore': 'Spam score',
  'detail.spamReasons': 'Reasons',
  'detail.spamNote':
    'Held for review by the spam check. It is not deleted automatically before the retention period ends.',
  'detail.notFound': 'This inquiry does not exist. It may have been deleted.',
  'detail.deleteTitle': 'Delete this inquiry?',
  'detail.deleteBody':
    'The inquiry from {name} will be deleted. This cannot be undone.',
  'detail.deleteConfirm': 'Delete',
  'detail.cancel': 'Cancel',
  'detail.deleted': 'The inquiry was deleted.',
  'detail.deleteFailed': 'The inquiry could not be deleted.',

  'notice.turnstileTitle': 'The contact form is not accepting messages',
  'notice.turnstileBody':
    'Turnstile (Cloudflare’s bot check) is not set up yet, so the contact form refuses every submission. Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET to start accepting submissions.',
  'notice.contactTitle': 'The contact form is not accepting messages',
  'notice.contactBody':
    'Required settings are missing: {names}. The contact form refuses every submission until they are set.',
  'notice.slack':
    'Slack notifications are off (optional). Set SLACK_WEBHOOK_URL to be notified in Slack when a new inquiry arrives. Notifications contain no personal data.',
  'notice.slackLink': 'About notifications',
  'notice.close': 'Dismiss',

  'forbidden.title': 'This account cannot use the admin screen',
  'forbidden.body':
    'Your email address is not in ADMIN_EMAILS. Ask the site owner to add it, or sign in with another passkey.',

  'error.generic': 'Something went wrong. Please try again.',
} as const;

/** Keys of the admin-only strings. */
export type AdminMessageKey = keyof typeof en;

const ja: Readonly<Record<AdminMessageKey, string>> = {
  'app.name': 'goodnight-web',
  'app.adminLabel': '管理画面',
  'app.skipToContent': '本文へ移動',
  'app.loading': '読み込み中…',
  'app.retry': 'もう一度試す',
  'app.notFound.title': 'ページが見つかりません',
  'app.notFound.body': 'この URL に管理画面のページはありません。',
  'app.backToList': 'お問い合わせ一覧に戻る',
  'app.errorTitle': 'エラーが起きました',

  'language.ja': '日本語',
  'language.en': 'English',

  'header.unread': '未読のお問い合わせ',
  'header.signedInAs': '{email} でログイン中',

  'login.title': '管理画面にログイン',
  'login.lead': 'このサイトに登録したパスキーでログインしてください。',
  'login.signingIn': 'パスキーの操作を待っています…',
  'login.autofillLabel': 'アカウント',
  'login.autofillHint':
    '入力欄を選択すると、保存済みのパスキーが候補に表示されます。下のボタンからでもログインできます。',
  'login.failed':
    'ログインできませんでした。操作がキャンセルされたか、このサイトに登録されていないパスキーです。もう一度お試しください。',
  'login.setupOpen': '管理者がまだ登録されていません。',
  'login.setupLink': '最初の管理者を登録',
  'login.setupNote': 'このサイトにパスキーを登録した人だけがログインできます。',

  'setup.lead':
    'シークレット SETUP_TOKEN の値と、ADMIN_EMAILS に含まれるメールアドレスを入力してください。そのあと、この端末にパスキーを登録します。',
  'setup.step1': 'セットアップトークンの確認',
  'setup.step2': 'パスキーの登録',
  'setup.step3': '完了',
  'setup.stepOf': 'ステップ {current} / {total}',
  'setup.tokenHint': 'Cloudflare に設定したシークレット SETUP_TOKEN の値です。',
  'setup.emailHint': 'ADMIN_EMAILS に含まれるメールアドレスのいずれかです。',
  'setup.nameHint': '任意です。管理画面に表示されます。',
  'setup.continue': '次へ',
  'setup.checking': '確認しています…',
  'setup.passkeyLead':
    'パスキーはパスワードの代わりになるものです。端末やパスワード管理アプリに保存され、ログインするときは指紋や顔認証、PIN で本人確認をします。',
  'setup.passkeyDomain':
    'パスキーはこのドメイン（{host}）でしか使えません。管理画面を独自ドメインに移す予定がある場合は、ここでは登録せず、先にそのドメインを設定してください。',
  'setup.registering': 'パスキーの操作を待っています…',
  'setup.passkeyFailed':
    'パスキーを登録できませんでした。操作がキャンセルされたか、お使いのブラウザがパスキーに対応していません。もう一度お試しください。',
  'setup.doneTitle': 'セットアップが完了しました',
  'setup.doneLead':
    'ログインしました。次回からは、いま登録したパスキーでログインしてください。セットアップ画面はこれで使えなくなりました。',
  'setup.goToList': 'お問い合わせ一覧を開く',
  'setup.closedTitle': 'セットアップは完了しています',
  'setup.closedLead':
    '管理者はすでに登録されています。パスキーでログインしてください。',
  'setup.unavailableTitle': 'セットアップに必要な設定がありません',
  'setup.goToLogin': 'ログイン画面へ',

  'list.title': 'お問い合わせ',
  'list.total': '全 {count} 件',
  'list.sortNewest': '新しい順',
  'list.filterLabel': '状態で絞り込む',
  'list.filter.all': 'すべて',
  'list.emptyFiltered': 'この状態のお問い合わせはありません。',
  'list.emptyHint':
    'フォームから届いたお問い合わせが、新しい順にここに並びます。',
  'list.range': '{total} 件中 {from}〜{to} 件',
  'list.previous': '前へ',
  'list.next': '次へ',
  'list.pagination': 'ページ',
  'list.unreadMark': '未読',
  'list.exportHint': '選択中の状態のお問い合わせをすべて CSV で保存します。',

  'detail.receivedAt': '受信日時',
  'detail.message': 'お問い合わせ内容',
  'detail.contact': '連絡先',
  'detail.statusLabel': '状態',
  'detail.statusChanged': '状態を「{status}」に変更しました。',
  'detail.statusFailed': '状態を変更できませんでした。',
  'detail.reply': 'メールで返信',
  'detail.pagePath': '送信元のページ',
  'detail.country': '国',
  'detail.spamScore': 'スパムスコア',
  'detail.spamReasons': '理由',
  'detail.spamNote':
    'スパム判定で「保留」になりました。保存期間を過ぎるまでは、自動で削除されません。',
  'detail.notFound':
    'このお問い合わせは見つかりません。削除された可能性があります。',
  'detail.deleteTitle': 'このお問い合わせを削除しますか？',
  'detail.deleteBody':
    '{name} さんからのお問い合わせを削除します。この操作は元に戻せません。',
  'detail.deleteConfirm': '削除する',
  'detail.cancel': 'キャンセル',
  'detail.deleted': 'お問い合わせを削除しました。',
  'detail.deleteFailed': 'お問い合わせを削除できませんでした。',
  'notice.turnstileTitle': 'お問い合わせフォームは受け付けを停止しています',
  'notice.turnstileBody':
    'Turnstile（Cloudflare のボット対策）がまだ設定されていないため、フォームからの送信をすべて受け付けていません。TURNSTILE_SITE_KEY と TURNSTILE_SECRET を設定すると、受け付けを始めます。',
  'notice.contactTitle': 'お問い合わせフォームは受け付けを停止しています',
  'notice.contactBody':
    '必要な設定がありません: {names}。設定されるまで、フォームからの送信はすべて受け付けません。',
  'notice.slack':
    'Slack への通知はオフです（任意）。SLACK_WEBHOOK_URL を設定すると、新しいお問い合わせが届いたときに Slack へ通知します。通知に個人情報は含まれません。',
  'notice.slackLink': '通知について',
  'notice.close': '閉じる',

  'forbidden.title': 'このアカウントでは管理画面を使えません',
  'forbidden.body':
    'このメールアドレスは ADMIN_EMAILS に含まれていません。サイトの運用担当者に追加を依頼するか、別のパスキーでログインしてください。',

  'error.generic': 'エラーが起きました。もう一度お試しください。',
};

/** Every key the admin UI can translate: shared keys and admin-only keys. */
export type UiMessageKey = SharedMessageKey | AdminMessageKey;

/** Shared and admin-only strings merged, per locale. */
export const uiMessages: Readonly<
  Record<Locale, Readonly<Record<UiMessageKey, string>>>
> = {
  en: { ...sharedMessages.en, ...en },
  ja: { ...sharedMessages.ja, ...ja },
};

/** Returns whether `key` is a known message key (for API error codes). */
export const isUiMessageKey = (key: string): key is UiMessageKey =>
  Object.hasOwn(uiMessages.en, key);
