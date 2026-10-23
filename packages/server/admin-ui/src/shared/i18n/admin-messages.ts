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

  'theme.label': 'Appearance',
  'theme.system': 'Match the system',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

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
  'setup.problemMissing': '{name} is not set.',
  'setup.problemTooShort': '{name} is shorter than {min} characters.',
  'setup.goToLogin': 'Go to sign-in',

  'list.title': 'Inquiries',
  'list.total': '{count} in total',
  'list.sortNewest': 'Newest first',
  'list.sortOldest': 'Oldest first',
  'list.filterLabel': 'Show inquiries',
  'list.view.unread': 'Unread',
  'list.view.read': 'Read',
  'list.view.all': 'All',
  'list.view.spam': 'Suspected spam',
  'list.empty.unread': 'No unread inquiries.',
  'list.empty.read': 'No read inquiries.',
  'list.empty.spam': 'No suspected spam.',
  'list.spamHint':
    'Suspected spam is not shown here. It is saved and kept apart under “Suspected spam”.',
  'list.spamHintLink': 'Show suspected spam ({count})',
  'list.spamViewHint':
    'These inquiries filled in the hidden spam trap or reached the spam score. They are saved, but no Slack notification was sent. If one is a real inquiry, open it and choose “Not spam”.',
  'list.search.label': 'Search by email address',
  'list.search.placeholder': 'Part of an email address',
  'list.search.submit': 'Search',
  'list.search.clear': 'Clear the search',
  'list.search.active': 'Email address contains “{term}”',
  'list.markRead': 'Mark as read',
  'list.markUnread': 'Mark as unread',
  'list.markFailed': 'The inquiry could not be updated.',
  'list.emptyFiltered': 'No inquiries match these filters.',
  'list.emptyHint':
    'Inquiries from the contact form will appear here, newest first.',
  'list.range': '{from}–{to} of {total}',
  'list.previous': 'Previous',
  'list.next': 'Next',
  'list.pagination': 'Pages',
  'list.unreadMark': 'Unread',
  'list.exportHint':
    'Download every inquiry that matches the filters as CSV, with headers in the current language.',

  'detail.receivedAt': 'Received',
  'detail.message': 'Message',
  'detail.contact': 'Contact details',
  'detail.markedRead': 'Marked as read.',
  'detail.markedUnread': 'Marked as unread.',
  'detail.statusFailed': 'The status could not be changed.',
  'detail.reply': 'Reply by email',
  'detail.pagePath': 'Sent from',
  'detail.country': 'Country',
  'detail.spamScore': 'Spam score',
  'detail.spamReasons': 'Reasons',
  'detail.spamNote':
    'This inquiry is saved and listed under “Suspected spam”. No Slack notification was sent for it.',
  'detail.spamManual': 'No rule matched. An admin marked it as spam.',
  'detail.notSpam': 'Not spam',
  'detail.markSpam': 'Mark as spam',
  'detail.notSpamDone': 'Moved out of suspected spam.',
  'detail.markSpamDone': 'Moved to suspected spam.',
  'detail.spamFailed': 'The spam mark could not be changed.',
  'spam.badge': 'Suspected spam',
  'spam.reason.honeypot': 'The hidden spam trap field was filled in.',
  'spam.reason.links': '{count} links in long text fields.',
  'spam.reason.link_in_field': 'A link in a one-line field, such as a name.',
  'spam.reason.too_fast': 'Sent within 3 seconds of opening the form.',
  'detail.notFound': 'This inquiry does not exist. It may have been deleted.',
  'detail.deleteTitle': 'Delete this inquiry?',
  'detail.deleteBody':
    'The inquiry from {name} will be deleted. This cannot be undone.',
  'detail.deleteConfirm': 'Delete',
  'detail.cancel': 'Cancel',
  'detail.deleted': 'The inquiry was deleted.',
  'detail.deleteFailed': 'The inquiry could not be deleted.',

  'nav.label': 'Admin sections',
  'nav.inquiries': 'Inquiries',
  'nav.form': 'Form',

  'list.columns': 'Columns',
  'list.columnsLabel': 'Choose the columns to show',
  'list.col.receivedAt': 'Received',
  'list.col.status': 'Status',
  'list.tableRegion': 'Inquiry table. Scroll sideways to see every column.',
  'list.sortToggle': 'Received: {order}. Select to show {next}.',
  'list.versionFilter': 'Form version',
  'list.allVersions': 'All versions',
  'list.fieldFilter': 'Filter by answer',
  'list.fieldFilterNone': 'Any answer',
  'list.valueFilter': 'Answer',
  'list.clearFilters': 'Clear filters',

  'detail.answers': 'Answers',
  'detail.formVersion': 'Form version',
  'detail.locale': 'Language',
  'detail.archivedField': 'From version {version} · archived',
  'detail.oldVersion':
    'Sent with version {version} of the form. The labels are shown as they were then.',
  'detail.noAnswers': 'No other fields were filled in.',

  'form.title': 'Contact form',
  'form.lead':
    'Choose the fields that visitors fill in on the contact form. Each save creates a new version. Earlier versions, and the answers sent with them, are kept.',
  'form.version': 'Version {version}',
  'form.unsaved': 'Unsaved changes',
  'form.upToDate': 'All changes are saved',
  'form.save': 'Save as version {version}',
  'form.saving': 'Saving…',
  'form.saved': 'Saved as version {version}.',
  'form.noChanges': 'There are no changes to save.',
  'form.discard': 'Discard changes',
  'form.saveFailed': 'The form could not be saved.',
  'form.invalid':
    'Some settings need your attention. Check the fields marked in red.',
  'form.reload': 'Reload',
  'form.fieldsHeading': 'Fields',
  'form.fieldsCount': '{count} of {max} fields',
  'form.fixed': 'Fixed',
  'form.emailNote':
    'Always on the form and required. Replies go to this address, so it cannot be removed or changed.',
  'form.consentNote':
    'Always at the end of the form. Visitors must agree to the privacy policy before they can send.',
  'form.addField': 'Add a field',
  'form.tooManyFields': 'A form can have up to {max} fields.',
  'form.new': 'New',
  'form.fieldId': 'ID {id}',
  'form.moveUp': 'Move “{label}” up',
  'form.moveDown': 'Move “{label}” down',
  'form.remove': 'Remove',
  'form.removeLabel': 'Remove “{label}”',
  'form.removed':
    '“{label}” was removed. It is archived when you save, and its answers are kept.',
  'form.untitled': 'Untitled field',
  'form.type': 'Type',
  'form.type.text': 'Single-line text',
  'form.type.textarea': 'Multi-line text',
  'form.type.tel': 'Phone number',
  'form.type.url': 'URL',
  'form.type.number': 'Number',
  'form.type.select': 'Dropdown',
  'form.type.radio': 'Radio buttons',
  'form.type.checkbox': 'Checkboxes',
  'form.type.date': 'Date',
  'form.typeLocked':
    'A saved field can only switch to types that store the same kind of answer, so earlier answers stay readable. To ask for another kind of answer, add a new field.',
  'form.labelJa': 'Label (Japanese)',
  'form.labelEn': 'Label (English)',
  'form.placeholderJa': 'Placeholder (Japanese)',
  'form.placeholderEn': 'Placeholder (English)',
  'form.hintJa': 'Help text (Japanese)',
  'form.hintEn': 'Help text (English)',
  'form.moreSettings': 'Placeholder and help text',
  'form.required': 'Required',
  'form.showInList': 'Show in the inquiry list',
  'form.maxLength': 'Maximum length',
  'form.maxLengthHint': 'Up to {max} characters. Leave empty for {default}.',
  'form.options': 'Choices',
  'form.addOption': 'Add a choice',
  'form.optionJa': 'Choice {n} (Japanese)',
  'form.optionEn': 'Choice {n} (English)',
  'form.optionUp': 'Move choice {n} up',
  'form.optionDown': 'Move choice {n} down',
  'form.optionRemove': 'Remove choice {n}',
  'form.archivedHeading': 'Archived fields',
  'form.archivedLead':
    'Fields removed from the form. Their answers in earlier inquiries are kept. A field you put back keeps its ID, so its old and new answers stay together.',
  'form.archivedPending': 'Removed now; archived when you save',
  'form.archivedLast': 'Last on the form in version {version}',
  'form.putBack': 'Put back',
  'form.putBackLabel': 'Put back “{label}”',
  'form.previewHeading': 'Preview',
  'form.previewLead':
    'How the form looks on the site. The real form also has the Turnstile check and the send button.',
  'form.previewLanguage': 'Preview language',
  'form.previewRequired': 'Required',
  'form.previewOptional': 'Optional',
  'form.previewSelect': 'Select…',
  'form.historyHeading': 'Version history',
  'form.historyLead':
    'Every saved version. Restoring one saves its fields as a new version; nothing is deleted.',
  'form.current': 'Current',
  'form.builtIn': 'Built-in',
  'form.fieldCount': '{count} fields',
  'form.restoredFrom': 'Restored from version {version}',
  'form.view': 'View',
  'form.viewLabel': 'View version {version}',
  'form.restore': 'Restore',
  'form.restoreLabel': 'Restore version {version}',
  'form.restoreTitle': 'Restore version {version}?',
  'form.restoreBody':
    'The fields of version {version} are saved as a new version. Inquiries are not changed. Fields that version {version} did not have are archived.',
  'form.restoreUnsaved': 'Your unsaved changes will be lost.',
  'form.restored': 'Version {version} was restored as version {next}.',
  'form.restoreFailed': 'The version could not be restored.',
  'form.close': 'Close',
  'form.cancel': 'Cancel',
  'form.error.label_required': 'Enter the label in Japanese or English.',
  'form.error.options_required': 'Add at least one choice.',
  'form.error.too_long': 'Too long.',
  'form.error.max_length': 'Enter a number from 1 to {max}.',
  'form.error.type_change':
    'This type cannot keep the earlier answers. Add a new field instead.',
  'form.error.reload':
    'The server does not know this field or choice. Reload the page and try again.',
  'form.error.invalid': 'Check this setting.',

  'notice.turnstileTitle': 'The contact form is not accepting messages',
  'notice.turnstileBody':
    'Turnstile (Cloudflare’s bot check) is not set up yet, so the contact form refuses every submission. Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET to start accepting submissions.',
  'notice.contactTitle': 'The contact form is not accepting messages',
  'notice.contactBody':
    'Required settings are missing: {names}. The contact form refuses every submission until they are set.',
  'notice.contactTooShort':
    '{names} is set but shorter than {min} characters. Replace it with a longer random value.',
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

  'theme.label': '表示モード',
  'theme.system': 'システムに合わせる',
  'theme.light': 'ライト',
  'theme.dark': 'ダーク',

  'header.unread': '未読のお問い合わせ',
  'header.signedInAs': '{email} でログイン中',

  'login.title': '管理画面にログイン',
  'login.lead': 'このサイトに登録した Passkey でログインしてください。',
  'login.signingIn': 'Passkey の操作を待っています…',
  'login.autofillLabel': 'アカウント',
  'login.autofillHint':
    '入力欄を選択すると、保存済みの Passkey が候補に表示されます。下のボタンからでもログインできます。',
  'login.failed':
    'ログインできませんでした。操作がキャンセルされたか、このサイトに登録されていない Passkey です。もう一度お試しください。',
  'login.setupOpen': '管理者がまだ登録されていません。',
  'login.setupLink': '最初の管理者を登録',
  'login.setupNote':
    'このサイトに Passkey を登録した人だけがログインできます。',

  'setup.lead':
    'シークレット SETUP_TOKEN の値と、ADMIN_EMAILS に含まれるメールアドレスを入力してください。そのあと、この端末に Passkey を登録します。',
  'setup.step1': 'セットアップトークンの確認',
  'setup.step2': 'Passkeyの登録',
  'setup.step3': '完了',
  'setup.stepOf': 'ステップ {current} / {total}',
  'setup.tokenHint': 'Cloudflare に設定したシークレット SETUP_TOKEN の値です。',
  'setup.emailHint': 'ADMIN_EMAILS に含まれるメールアドレスのいずれかです。',
  'setup.nameHint': '任意です。管理画面に表示されます。',
  'setup.continue': '次へ',
  'setup.checking': '確認しています…',
  'setup.passkeyLead':
    'Passkey はパスワードの代わりになるものです。端末やパスワード管理アプリに保存され、ログインするときは指紋や顔認証、PIN で本人確認をします。',
  'setup.passkeyDomain':
    'Passkey はこのドメイン（{host}）でしか使えません。管理画面を独自ドメインに移す予定がある場合は、ここでは登録せず、先にそのドメインを設定してください。',
  'setup.registering': 'Passkey の操作を待っています…',
  'setup.passkeyFailed':
    'Passkey を登録できませんでした。操作がキャンセルされたか、お使いのブラウザが Passkey に対応していません。もう一度お試しください。',
  'setup.doneTitle': 'セットアップが完了しました',
  'setup.doneLead':
    'ログインしました。次回からは、いま登録した Passkey でログインしてください。セットアップ画面はこれで使えなくなりました。',
  'setup.goToList': 'お問い合わせ一覧を開く',
  'setup.closedTitle': 'セットアップは完了しています',
  'setup.closedLead':
    '管理者はすでに登録されています。Passkey でログインしてください。',
  'setup.unavailableTitle': 'セットアップに必要な設定がありません',
  'setup.problemMissing': '{name} が設定されていません。',
  'setup.problemTooShort': '{name} が {min} 文字より短いです。',
  'setup.goToLogin': 'ログイン画面へ',

  'list.title': 'お問い合わせ',
  'list.total': '全 {count} 件',
  'list.sortNewest': '新しい順',
  'list.sortOldest': '古い順',
  'list.filterLabel': '表示するお問い合わせ',
  'list.view.unread': '未読',
  'list.view.read': '既読',
  'list.view.all': 'すべて',
  'list.view.spam': 'スパムの疑い',
  'list.empty.unread': '未読のお問い合わせはありません。',
  'list.empty.read': '既読のお問い合わせはありません。',
  'list.empty.spam': 'スパムの疑いがあるお問い合わせはありません。',
  'list.spamHint':
    'スパムの疑いがあるお問い合わせは、ここには表示しません。保存したうえで「スパムの疑い」に分けています。',
  'list.spamHintLink': 'スパムの疑いを見る（{count} 件）',
  'list.spamViewHint':
    '人には見えないスパム対策欄に入力があったか、スパムスコアが基準に達したお問い合わせです。保存していますが、Slack には通知していません。本物のお問い合わせなら、開いて「スパムではない」を選んでください。',
  'list.search.label': 'メールアドレスで検索',
  'list.search.placeholder': 'メールアドレスの一部',
  'list.search.submit': '検索',
  'list.search.clear': '検索をやめる',
  'list.search.active': 'メールアドレスに「{term}」を含む',
  'list.markRead': '既読にする',
  'list.markUnread': '未読に戻す',
  'list.markFailed': 'お問い合わせを更新できませんでした。',
  'list.emptyFiltered': '条件に合うお問い合わせはありません。',
  'list.emptyHint':
    'フォームから届いたお問い合わせが、新しい順にここに並びます。',
  'list.range': '{total} 件中 {from}〜{to} 件',
  'list.previous': '前へ',
  'list.next': '次へ',
  'list.pagination': 'ページ',
  'list.unreadMark': '未読',
  'list.exportHint':
    '絞り込みに合うお問い合わせをすべて CSV で保存します。見出しは表示中の言語になります。',

  'detail.receivedAt': '受信日時',
  'detail.message': 'お問い合わせ内容',
  'detail.contact': '連絡先',
  'detail.markedRead': '既読にしました。',
  'detail.markedUnread': '未読に戻しました。',
  'detail.statusFailed': '状態を変更できませんでした。',
  'detail.reply': 'メールで返信',
  'detail.pagePath': '送信元のページ',
  'detail.country': '国',
  'detail.spamScore': 'スパムスコア',
  'detail.spamReasons': '理由',
  'detail.spamNote':
    'このお問い合わせは保存され、「スパムの疑い」に表示されます。Slack には通知していません。',
  'detail.spamManual':
    'どのルールにも当てはまりません。管理者がスパムとして扱いました。',
  'detail.notSpam': 'スパムではない',
  'detail.markSpam': 'スパムとして扱う',
  'detail.notSpamDone': '「スパムの疑い」から外しました。',
  'detail.markSpamDone': '「スパムの疑い」に移しました。',
  'detail.spamFailed': 'スパムの扱いを変更できませんでした。',
  'spam.badge': 'スパムの疑い',
  'spam.reason.honeypot': '人には見えないスパム対策欄に入力がありました。',
  'spam.reason.links': '長文の項目にリンクが {count} 件あります。',
  'spam.reason.link_in_field': '名前など 1 行の項目にリンクがあります。',
  'spam.reason.too_fast': 'フォームを開いてから 3 秒以内に送信されました。',
  'detail.notFound':
    'このお問い合わせは見つかりません。削除された可能性があります。',
  'detail.deleteTitle': 'このお問い合わせを削除しますか？',
  'detail.deleteBody':
    '{name} さんからのお問い合わせを削除します。この操作は元に戻せません。',
  'detail.deleteConfirm': '削除する',
  'detail.cancel': 'キャンセル',
  'detail.deleted': 'お問い合わせを削除しました。',
  'detail.deleteFailed': 'お問い合わせを削除できませんでした。',
  'nav.label': '管理メニュー',
  'nav.inquiries': 'お問い合わせ',
  'nav.form': 'フォーム',

  'list.columns': '表示する列',
  'list.columnsLabel': '一覧に表示する列を選ぶ',
  'list.col.receivedAt': '受信日時',
  'list.col.status': '状態',
  'list.tableRegion':
    'お問い合わせの表。横にスクロールするとすべての列を表示できます。',
  'list.sortToggle': '受信日時: {order}。選ぶと{next}にします。',
  'list.versionFilter': 'フォームのバージョン',
  'list.allVersions': 'すべてのバージョン',
  'list.fieldFilter': '回答で絞り込む',
  'list.fieldFilterNone': '絞り込まない',
  'list.valueFilter': '回答',
  'list.clearFilters': '絞り込みを解除',

  'detail.answers': '入力内容',
  'detail.formVersion': 'フォームのバージョン',
  'detail.locale': '言語',
  'detail.archivedField': 'バージョン {version} の項目・アーカイブ済み',
  'detail.oldVersion':
    'フォームのバージョン {version} で送信されました。項目名は送信時のものです。',
  'detail.noAnswers': 'ほかに入力された項目はありません。',

  'form.title': 'お問い合わせフォーム',
  'form.lead':
    'お問い合わせフォームで訪問者に入力してもらう項目を設定します。保存するたびに新しいバージョンになります。以前のバージョンと、そのバージョンで届いた内容はそのまま残ります。',
  'form.version': 'バージョン {version}',
  'form.unsaved': '未保存の変更があります',
  'form.upToDate': '変更はすべて保存されています',
  'form.save': 'バージョン {version} として保存',
  'form.saving': '保存しています…',
  'form.saved': 'バージョン {version} として保存しました。',
  'form.noChanges': '保存する変更はありません。',
  'form.discard': '変更を取り消す',
  'form.saveFailed': 'フォームを保存できませんでした。',
  'form.invalid':
    '確認が必要な設定があります。赤く表示された項目を確認してください。',
  'form.reload': '再読み込み',
  'form.fieldsHeading': '項目',
  'form.fieldsCount': '{count} / {max} 項目',
  'form.fixed': '固定',
  'form.emailNote':
    'いつもフォームにあり、入力は必須です。返信はこのアドレスに送るため、削除や変更はできません。',
  'form.consentNote':
    'いつもフォームの最後にあります。プライバシーポリシーに同意しないと送信できません。',
  'form.addField': '項目を追加',
  'form.tooManyFields': 'フォームの項目は {max} 個までです。',
  'form.new': '新規',
  'form.fieldId': 'ID {id}',
  'form.moveUp': '「{label}」を上へ移動',
  'form.moveDown': '「{label}」を下へ移動',
  'form.remove': '削除',
  'form.removeLabel': '「{label}」を削除',
  'form.removed':
    '「{label}」を削除しました。保存するとアーカイブされ、届いた回答は残ります。',
  'form.untitled': '名前のない項目',
  'form.type': '種類',
  'form.type.text': '1 行のテキスト',
  'form.type.textarea': '複数行のテキスト',
  'form.type.tel': '電話番号',
  'form.type.url': 'URL',
  'form.type.number': '数値',
  'form.type.select': 'プルダウン',
  'form.type.radio': 'ラジオボタン',
  'form.type.checkbox': 'チェックボックス',
  'form.type.date': '日付',
  'form.typeLocked':
    '保存済みの項目は、同じ形の回答を保存する種類にだけ変えられます。以前の回答を読めるようにするためです。別の形の回答が必要なときは、新しい項目を追加してください。',
  'form.labelJa': '項目名（日本語）',
  'form.labelEn': '項目名（英語）',
  'form.placeholderJa': '入力例（日本語）',
  'form.placeholderEn': '入力例（英語）',
  'form.hintJa': '説明（日本語）',
  'form.hintEn': '説明（英語）',
  'form.moreSettings': '入力例と説明',
  'form.required': '必須にする',
  'form.showInList': 'お問い合わせ一覧に表示する',
  'form.maxLength': '最大文字数',
  'form.maxLengthHint':
    '{max} 文字まで指定できます。空欄の場合は {default} 文字です。',
  'form.options': '選択肢',
  'form.addOption': '選択肢を追加',
  'form.optionJa': '選択肢 {n}（日本語）',
  'form.optionEn': '選択肢 {n}（英語）',
  'form.optionUp': '選択肢 {n} を上へ移動',
  'form.optionDown': '選択肢 {n} を下へ移動',
  'form.optionRemove': '選択肢 {n} を削除',
  'form.archivedHeading': 'アーカイブした項目',
  'form.archivedLead':
    'フォームから削除した項目です。以前に届いた回答は残っています。元に戻した項目は同じ ID を使うため、以前の回答と新しい回答がひとつの列にまとまります。',
  'form.archivedPending': 'いま削除しました（保存するとアーカイブ）',
  'form.archivedLast': 'バージョン {version} までフォームにありました',
  'form.putBack': '元に戻す',
  'form.putBackLabel': '「{label}」を元に戻す',
  'form.previewHeading': 'プレビュー',
  'form.previewLead':
    'サイトでのフォームの見え方です。実際のフォームには、Turnstile の確認と送信ボタンもあります。',
  'form.previewLanguage': 'プレビューの言語',
  'form.previewRequired': '必須',
  'form.previewOptional': '任意',
  'form.previewSelect': '選択してください',
  'form.historyHeading': '変更履歴',
  'form.historyLead':
    '保存したすべてのバージョンです。復元すると、そのバージョンの項目を新しいバージョンとして保存します。削除されるものはありません。',
  'form.current': '現在',
  'form.builtIn': '初期設定',
  'form.fieldCount': '{count} 項目',
  'form.restoredFrom': 'バージョン {version} から復元',
  'form.view': '表示',
  'form.viewLabel': 'バージョン {version} を表示',
  'form.restore': '復元',
  'form.restoreLabel': 'バージョン {version} を復元',
  'form.restoreTitle': 'バージョン {version} を復元しますか？',
  'form.restoreBody':
    'バージョン {version} の項目を新しいバージョンとして保存します。お問い合わせは変更されません。バージョン {version} になかった項目はアーカイブされます。',
  'form.restoreUnsaved': '保存していない変更は失われます。',
  'form.restored':
    'バージョン {version} をバージョン {next} として復元しました。',
  'form.restoreFailed': 'バージョンを復元できませんでした。',
  'form.close': '閉じる',
  'form.cancel': 'キャンセル',
  'form.error.label_required': '項目名を日本語か英語で入力してください。',
  'form.error.options_required': '選択肢を 1 つ以上追加してください。',
  'form.error.too_long': '長すぎます。',
  'form.error.max_length': '1 から {max} までの数を入力してください。',
  'form.error.type_change':
    'この種類では以前の回答を保てません。新しい項目を追加してください。',
  'form.error.reload':
    'サーバーが知らない項目か選択肢があります。ページを再読み込みしてから、もう一度お試しください。',
  'form.error.invalid': 'この設定を確認してください。',

  'notice.turnstileTitle': 'お問い合わせフォームは受け付けを停止しています',
  'notice.turnstileBody':
    'Turnstile（Cloudflare のボット対策）がまだ設定されていないため、フォームからの送信をすべて受け付けていません。TURNSTILE_SITE_KEY と TURNSTILE_SECRET を設定すると、受け付けを始めます。',
  'notice.contactTitle': 'お問い合わせフォームは受け付けを停止しています',
  'notice.contactBody':
    '必要な設定がありません: {names}。設定されるまで、フォームからの送信はすべて受け付けません。',
  'notice.contactTooShort':
    '{names} は設定されていますが、{min} 文字より短いです。より長いランダムな値に置き換えてください。',
  'notice.slack':
    'Slack への通知はオフです（任意）。SLACK_WEBHOOK_URL を設定すると、新しいお問い合わせが届いたときに Slack へ通知します。通知に個人情報は含まれません。',
  'notice.slackLink': '通知について',
  'notice.close': '閉じる',

  'forbidden.title': 'このアカウントでは管理画面を使えません',
  'forbidden.body':
    'このメールアドレスは ADMIN_EMAILS に含まれていません。サイトの運用担当者に追加を依頼するか、別の Passkey でログインしてください。',

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
