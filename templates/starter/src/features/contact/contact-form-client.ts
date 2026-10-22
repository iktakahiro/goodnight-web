import {
  getContactConfig,
  submitContact,
  type ContactConfig,
  type ContactSubmitResult,
} from '@goodnight-web/server/client';
import type { Locale } from '../../../site.config';

/** The part of Turnstile's browser API that this form uses. */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      language: string;
      theme: 'light';
      size: 'flexible';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string | undefined;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** A message shown above the submit button, by its `data-result` value. */
type FormStatus = 'invalid' | 'verify' | 'turnstile' | 'rate-limited' | 'error';

/** Per-field error code, as returned by the server for `invalid_input`. */
type FieldErrorCode = 'required' | 'invalid' | 'too_long';

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile did not load'));
    });
    script.addEventListener('error', () =>
      reject(new Error('Turnstile did not load')),
    );
    document.head.append(script);
  });
}

function isLocale(value: string | undefined): value is Locale {
  return value === 'ja' || value === 'en';
}

function fieldErrorCode(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): FieldErrorCode {
  if (control.validity.valueMissing) return 'required';
  if (control.validity.tooLong) return 'too_long';
  return 'invalid';
}

/**
 * Connects the contact form inside `root` (the `[data-contact]` element of
 * `contact-form.astro`).
 *
 * It reads `GET /api/contact/config` first. When the form is available it
 * shows the form and the Turnstile widget; otherwise it shows the "not
 * available yet" notice. On submit it checks the fields in the browser, sends
 * them with `submitContact()` from `@goodnight-web/server/client`, and shows
 * the result: the thank-you message, per-field errors, or a message for a
 * failed Turnstile check, too many submissions, or another error.
 */
export async function setupContactForm(root: HTMLElement): Promise<void> {
  const form = root.querySelector<HTMLFormElement>('[data-contact-form]');
  const loading = root.querySelector<HTMLElement>('[data-contact-loading]');
  const unavailable = root.querySelector<HTMLElement>(
    '[data-contact-unavailable]',
  );
  const sent = root.querySelector<HTMLElement>('[data-contact-sent]');
  const widget = root.querySelector<HTMLElement>('[data-turnstile]');
  const submitButton =
    form?.querySelector<HTMLButtonElement>('[type="submit"]');
  if (!form || !loading || !unavailable || !sent || !widget || !submitButton) {
    return;
  }
  const locale: Locale = isLocale(root.dataset.locale)
    ? root.dataset.locale
    : 'en';
  const fieldMessages: Record<FieldErrorCode, string> = {
    required: root.dataset.messageRequired ?? '',
    invalid: root.dataset.messageInvalid ?? '',
    too_long: root.dataset.messageTooLong ?? '',
  };
  const results = form.querySelectorAll<HTMLElement>('[data-result]');
  const controls = form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input:not([name="website"]), select, textarea');

  function showOnly(element: HTMLElement | null): void {
    for (const part of [loading, unavailable, sent, form]) {
      if (part) part.hidden = part !== element;
    }
  }

  function showUnavailable(): void {
    showOnly(unavailable);
    unavailable?.focus();
  }

  function showStatus(status: FormStatus | null): void {
    for (const element of results) {
      element.hidden = element.dataset.result !== status;
    }
    if (status)
      form?.querySelector<HTMLElement>(`[data-result="${status}"]`)?.focus();
  }

  function setFieldError(
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    code: FieldErrorCode | null,
  ): void {
    const message = document.getElementById(`${control.id}-error`);
    const describedBy = (control.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter((id) => id !== '' && id !== `${control.id}-error`);
    if (code) {
      control.setAttribute('aria-invalid', 'true');
      describedBy.push(`${control.id}-error`);
    } else if (control.hasAttribute('aria-invalid')) {
      control.setAttribute('aria-invalid', 'false');
    }
    if (describedBy.length > 0) {
      control.setAttribute('aria-describedby', describedBy.join(' '));
    } else {
      control.removeAttribute('aria-describedby');
    }
    if (message) {
      message.textContent = code ? fieldMessages[code] : '';
      message.hidden = !code;
    }
  }

  let config: ContactConfig | null;
  try {
    config = await getContactConfig({ locale });
  } catch {
    config = null;
  }
  if (!config?.available || !config.turnstileSiteKey) {
    showUnavailable();
    return;
  }

  let turnstile: TurnstileApi;
  try {
    turnstile = await loadTurnstile();
  } catch {
    showUnavailable();
    return;
  }

  let token = '';
  const widgetId = turnstile.render(widget, {
    sitekey: config.turnstileSiteKey,
    action: config.turnstileAction,
    language: locale,
    theme: 'light',
    size: 'flexible',
    callback: (value) => {
      token = value;
    },
    'expired-callback': () => {
      token = '';
    },
    'error-callback': () => {
      token = '';
    },
  });
  // A Turnstile token can be used once. Get a new one after every attempt.
  function resetTurnstile(): void {
    token = '';
    if (widgetId !== undefined) turnstile.reset(widgetId);
  }

  showOnly(form);
  const shownAt = Date.now();
  const honeypot = form.elements.namedItem(config.honeypotField);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showStatus(null);

    let firstInvalid: HTMLElement | null = null;
    for (const control of controls) {
      const valid = control.checkValidity();
      setFieldError(control, valid ? null : fieldErrorCode(control));
      if (!valid) firstInvalid ??= control;
    }
    if (firstInvalid) {
      showStatus('invalid');
      firstInvalid.focus();
      return;
    }
    if (token === '') {
      showStatus('verify');
      return;
    }

    const data = new FormData(form);
    const value = (name: string): string => {
      const entry = data.get(name);
      return typeof entry === 'string' ? entry : '';
    };
    const idleLabel = submitButton.textContent ?? '';
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = submitButton.dataset.labelSending ?? idleLabel;

    let result: ContactSubmitResult;
    try {
      result = await submitContact(
        {
          name: value('name'),
          email: value('email'),
          company: value('company'),
          phone: value('phone'),
          category: value('category'),
          message: value('message'),
          // Send the real state: the server rejects `false` as missing
          // consent, even if the browser check is removed.
          consent: (data.get('consent') !== null) as true,
          turnstileToken: token,
          website: honeypot instanceof HTMLInputElement ? honeypot.value : '',
          elapsedMs: Date.now() - shownAt,
          pagePath: location.pathname,
        },
        { locale },
      );
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = idleLabel;
    }

    if (result.ok) {
      form.reset();
      showOnly(sent);
      sent?.focus();
      return;
    }
    resetTurnstile();
    switch (result.code) {
      case 'contact_unavailable':
        showUnavailable();
        return;
      case 'invalid_input': {
        let first: HTMLElement | null = null;
        for (const control of controls) {
          const code = result.fields?.[control.name];
          const known =
            code === 'required' || code === 'too_long' || code === 'invalid'
              ? code
              : code === undefined
                ? null
                : 'invalid';
          setFieldError(control, known);
          if (known) first ??= control;
        }
        showStatus('invalid');
        first?.focus();
        return;
      }
      case 'turnstile_failed':
        showStatus('turnstile');
        return;
      case 'rate_limited':
        showStatus('rate-limited');
        return;
      default:
        showStatus('error');
    }
  });

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) &&
      target.getAttribute('aria-invalid') === 'true' &&
      target.checkValidity()
    ) {
      setFieldError(target, null);
      const invalidMessage = form.querySelector<HTMLElement>(
        '[data-result="invalid"]',
      );
      if (invalidMessage && !form.querySelector('[aria-invalid="true"]')) {
        invalidMessage.hidden = true;
      }
    }
  });
}
