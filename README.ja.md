<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/goodnight-web-lockup-dark.svg">
  <img src="brand/goodnight-web-lockup-light.svg" alt="goodnight web" width="360">
</picture>

# goodnight-web

goodnight-web は、Webサイト、ブログ、問い合わせフォームをまとめたスターターキットです。Cloudflare® だけで動きます。1 つの Worker が静的なサイト、問い合わせ API、問い合わせを読むための管理画面を配信し、1 つの D1 データベースに問い合わせを保存します。

[English](README.md) · [ドキュメント](https://goodnight-web.dev/ja/)

## クイックスタート

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iktakahiro/goodnight-web/tree/main/templates/starter)

1. ボタンを押すと、スターター（`templates/starter`）があなたの GitHub アカウントの新しいリポジトリにコピーされます。設定フォームでは **Create private Git repository** にチェックを入れ、求められるシークレットを入力します。
2. Cloudflare Workers® が D1 データベースを作り、サイトをビルドして、あなたの Cloudflare アカウントにデプロイします。
3. 新しいサイトの `/admin` を開き、セットアップトークンを入力して、最初の管理者のパスキーを登録します。

各手順は[ドキュメント](https://goodnight-web.dev/ja/docs/getting-started/)で説明しています。独自ドメインや Turnstile の設定もここに載っています。設定とシークレットの一覧は[スターターの README](templates/starter/README.ja.md) にあります。

## 目的

- サーバー、言語のランタイム、データベースサーバーを自分で保守せずに、小さな会社のWebサイトを運用できるようにする。
- 問い合わせを確実に受け取る。問い合わせは D1 に保存してから応答を返す。スパム対策には Turnstile、Workers の Rate Limiting、honeypot 欄を使う。
- エンジニアでない人でも、AI ツールなどでサイトを編集できるようにする。問い合わせ API と管理画面はパッケージから提供し、利用者は編集しない。
- 修正は依存関係を更新するプルリクエストとして届ける。サイトの持ち主は、そのプルリクエストを確認してマージする必要がある。この保守は残る。

利用者が目にするものは、すべて日本語と英語に対応しています。

## 構成

| パス                         | 内容                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `packages/server`            | `@goodnight-web/server`: Worker、問い合わせ API、管理 API と管理画面、マイグレーション |
| `packages/typescript-config` | 共通の TypeScript 設定                                                                 |
| `templates/starter`          | 利用者がコピーして編集する Astro のサイト                                              |
| `apps/docs`                  | ドキュメントサイト                                                                     |
| `docs`                       | 開発者向けのドキュメント                                                               |
| `brand`                      | ロゴ、ファビコン、アプリアイコンのファイルと、それを作るスクリプト（ライセンス参照）   |

詳しくは [docs/architecture.md](docs/architecture.md)（英語）を参照してください。

## 開発

[Bun](https://bun.sh) が必要です（バージョンは `.bun-version` を参照）。

```sh
bun install
bun run validate
bun run build
```

開発のルールは [AGENTS.md](AGENTS.md)（英語）にあります。脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

コードは [MIT ライセンス](LICENSE)です。ロゴ、ワードマーク、アイコン、共有用の画像は対象外で、すべての権利を留保します。認めている使い方は [brand/LICENSE](brand/LICENSE)（英語）にあります。プロジェクトを紹介するために goodnight-web という名前を使うのは自由です。

Cloudflare、Cloudflare のロゴ、Cloudflare Workers は、米国およびその他の国における Cloudflare, Inc. の商標または登録商標です。goodnight-web は Cloudflare, Inc. の提携先でも、承認を受けたものでもありません。
