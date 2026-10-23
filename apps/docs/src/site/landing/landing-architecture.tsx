import { useRef } from 'react';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { motion, useInView } from 'motion/react';
import {
  Database,
  GitPullRequest,
  Globe,
  Inbox,
  KeyRound,
  Send,
  User,
} from 'lucide-react';

const copy = {
  en: {
    visitor: ['Visitor', 'Submits the form'],
    you: ['You', 'Sign in with face or fingerprint'],
    account: ['Your own ', ' account'],
    steps: [
      ['Website', 'Serves your pages', 'Pages built with Astro'],
      [
        'Intake and checks',
        'Bot protection and a limit on repeated sends',
        'Workers · Turnstile',
      ],
      ['Your own database', 'Stores the inquiry', 'D1'],
      ['Admin panel', 'Where you read inquiries', 'Passkey sign-in'],
    ],
    github:
      ' (where your code lives): updates arrive as proposed changes (PRs) and go live when you apply (merge) them.',
  },
  ja: {
    visitor: ['訪問者', 'フォームから送信'],
    you: ['あなた', '顔や指紋でログイン'],
    account: ['自分の ', ' アカウント'],
    steps: [
      ['Webサイト', 'ページを配信', 'Astro で作ったページ'],
      ['受付とチェック', 'ボット対策と連続送信の制限', 'Workers・Turnstile'],
      ['自分のデータベース', '問い合わせを保存', 'D1'],
      ['管理画面', '届いた問い合わせを確認', 'パスキーでログイン'],
    ],
    github:
      '（コードの置き場所）：更新は変更の提案（PR）として届き、反映（マージ）すると公開されます。',
  },
} as const;

const stepIcons = [Globe, Send, Database, Inbox] as const;

/**
 * The top page architecture: a visitor, the four steps inside your own
 * Cloudflare account, you, and the GitHub repository. A glowing line runs
 * across the steps once when they scroll into view. Brand names are text in
 * elements with `data-brand`, so that they can become logos later.
 */
export function LandingArchitecture() {
  const text = useI18n().locale === 'ja' ? copy.ja : copy.en;
  const flow = useRef<HTMLDivElement>(null);
  const inView = useInView(flow, { once: true, amount: 0.35 });
  return (
    <div className='arch'>
      <div className='arch-actor arch-visitor'>
        <User aria-hidden='true' />
        <b>{text.visitor[0]}</b>
        <span>{text.visitor[1]}</span>
      </div>
      <div className='arch-account'>
        <p className='arch-account-label'>
          {text.account[0]}
          <span data-brand='cloudflare'>Cloudflare</span>
          {text.account[1]}
        </p>
        <div className='arch-flow' ref={flow} data-in={inView || undefined}>
          <motion.span
            className='arch-flow-line motion-reveal'
            aria-hidden='true'
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : undefined}
            transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.span
            className='arch-flow-head'
            aria-hidden='true'
            initial={{ x: '-100%', opacity: 0 }}
            animate={inView ? { x: '0%', opacity: [0, 1, 1, 0] } : undefined}
            transition={{
              x: { duration: 1.4, ease: [0.65, 0, 0.35, 1] },
              opacity: { duration: 1.9, times: [0, 0.1, 0.72, 1] },
            }}
          />
          <ol className='arch-steps'>
            {text.steps.map(([title, body, detail], index) => {
              const Icon = stepIcons[index] ?? Globe;
              return (
                <li
                  key={title}
                  className={
                    index === 2 ? 'arch-step arch-step-own' : 'arch-step'
                  }
                >
                  <span className='arch-step-number' aria-hidden='true'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Icon className='arch-step-icon' aria-hidden='true' />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <small>{detail}</small>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className='arch-actor arch-you'>
        <KeyRound aria-hidden='true' />
        <b>{text.you[0]}</b>
        <span>{text.you[1]}</span>
      </div>
      <div className='arch-repo'>
        <GitPullRequest aria-hidden='true' />
        <p>
          <b data-brand='github'>GitHub</b>
          {text.github}
        </p>
      </div>
    </div>
  );
}
