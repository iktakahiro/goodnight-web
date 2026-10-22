import {
  getContactForm,
  submitContact,
  type ContactSubmitResult,
  type PublicContactForm,
} from '@goodnight-web/server/client';
import type { Locale } from '../../../site.config';
import {
  renderFields,
  type FieldErrorCode,
  type FieldInputValue,
  type RenderTexts,
  type RenderedField,
} from './contact-form-render';

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
type FormStatus =
  | 'invalid'
  | 'outdated'
  | 'verify'
  | 'turnstile'
  | 'rate-limited'
  | 'error';

/** Texts from the `[data-contact-texts]` JSON in contact-form.astro. */
interface ContactTexts extends RenderTexts {
  fieldRequired: string;
  fieldInvalid: string;
  fieldTooLong: string;
}

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

function toErrorCode(code: string | undefined): FieldErrorCode | null {
  if (code === undefined) return null;
  return code === 'required' || code === 'too_long' ? code : 'invalid';
}

/**
 * Connects the contact form inside `root` (the `[data-contact]` element of
 * `contact-form.astro`).
 *
 * It reads the form from `GET /api/contact/form` first. When the form is
 * available it renders the fields and shows the form with the Turnstile
 * widget; otherwise it shows the "not available yet" notice, or a "could not
 * be loaded" notice when the request fails. On submit it checks the fields
 * in the browser, sends them with `submitContact()` from
 * `@goodnight-web/server/client`, and shows the result: the thank-you
 * message, per-field errors, or a message for a failed Turnstile check, too
 * many submissions, or another error. When the form was changed in the
 * admin screen while the visitor was typing, it renders the new form,
 * keeps the values, and asks the visitor to check and send again.
 */
export async function setupContactForm(root: HTMLElement): Promise<void> {
  const form = root.querySelector<HTMLFormElement>('[data-contact-form]');
  const fieldsBox = root.querySelector<HTMLElement>('[data-contact-fields]');
  const loading = root.querySelector<HTMLElement>('[data-contact-loading]');
  const unavailable = root.querySelector<HTMLElement>(
    '[data-contact-notice="unavailable"]',
  );
  const failed = root.querySelector<HTMLElement>(
    '[data-contact-notice="failed"]',
  );
  const sent = root.querySelector<HTMLElement>('[data-contact-sent]');
  const widget = root.querySelector<HTMLElement>('[data-turnstile]');
  const honeypot = root.querySelector<HTMLInputElement>(
    '[data-contact-honeypot]',
  );
  const consent = root.querySelector<HTMLInputElement>('#contact-consent');
  const consentError = root.querySelector<HTMLElement>(
    '#contact-consent-error',
  );
  const textsJson = root.querySelector('[data-contact-texts]')?.textContent;
  const submitButton =
    form?.querySelector<HTMLButtonElement>('[type="submit"]');
  if (
    !form ||
    !fieldsBox ||
    !loading ||
    !unavailable ||
    !failed ||
    !sent ||
    !widget ||
    !honeypot ||
    !consent ||
    !consentError ||
    !textsJson ||
    !submitButton
  ) {
    return;
  }
  const texts = JSON.parse(textsJson) as ContactTexts;
  const locale: Locale = isLocale(root.dataset.locale)
    ? root.dataset.locale
    : 'en';
  const fieldMessages: Record<FieldErrorCode, string> = {
    required: texts.fieldRequired,
    invalid: texts.fieldInvalid,
    too_long: texts.fieldTooLong,
  };
  const results = form.querySelectorAll<HTMLElement>('[data-result]');

  root
    .querySelector('[data-contact-reload]')
    ?.addEventListener('click', () => location.reload());

  function showOnly(element: HTMLElement | null): void {
    for (const part of [loading, unavailable, failed, sent, form]) {
      if (part) part.hidden = part !== element;
    }
    if (element && element !== form) element.focus();
  }

  function showStatus(status: FormStatus | null): void {
    for (const element of results) {
      element.hidden = element.dataset.result !== status;
    }
    if (status)
      form?.querySelector<HTMLElement>(`[data-result="${status}"]`)?.focus();
  }

  const consentField: RenderedField = {
    key: 'consent',
    focusTarget: consent,
    owns: (target) => target === consent,
    read: () => (consent.checked ? 'yes' : ''),
    write: () => {},
    validate: () => (consent.checked ? null : 'required'),
    setError: (code, message) => {
      if (code) consent.setAttribute('aria-invalid', 'true');
      else if (consent.hasAttribute('aria-invalid')) {
        consent.setAttribute('aria-invalid', 'false');
      }
      if (code) consent.setAttribute('aria-describedby', consentError.id);
      else consent.removeAttribute('aria-describedby');
      consentError.textContent = code ? message : '';
      consentError.hidden = !code;
    },
  };

  let current: PublicContactForm;
  let fields: RenderedField[] = [];

  function allFields(): RenderedField[] {
    return [...fields, consentField];
  }

  function render(next: PublicContactForm): void {
    const keep = new Map<string, FieldInputValue>();
    for (const field of fields) keep.set(field.key, field.read());
    current = next;
    fields = renderFields(fieldsBox as HTMLElement, next, locale, texts, keep);
    if (honeypot) honeypot.name = next.honeypotField;
  }

  const loaded = await getContactForm({ locale });
  if (!loaded) {
    showOnly(failed);
    return;
  }
  if (!loaded.available || !loaded.turnstileSiteKey) {
    showOnly(unavailable);
    return;
  }

  let turnstile: TurnstileApi;
  try {
    turnstile = await loadTurnstile();
  } catch {
    showOnly(failed);
    return;
  }

  render(loaded);
  let token = '';
  const widgetId = turnstile.render(widget, {
    sitekey: loaded.turnstileSiteKey,
    action: loaded.turnstileAction,
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showStatus(null);

    let firstInvalid: HTMLElement | null = null;
    for (const field of allFields()) {
      const code = field.validate();
      field.setError(code, code ? fieldMessages[code] : '');
      if (code) firstInvalid ??= field.focusTarget;
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

    const values: Record<string, string | string[]> = {};
    let email = '';
    for (const field of fields) {
      const value = field.read();
      if (field.key === 'email') email = typeof value === 'string' ? value : '';
      else values[field.key] = value;
    }
    const idleLabel = submitButton.textContent ?? '';
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = submitButton.dataset.labelSending ?? idleLabel;

    let result: ContactSubmitResult;
    try {
      result = await submitContact(
        {
          email,
          fields: values,
          // Send the real state: the server rejects `false` as missing
          // consent, even if the browser check is removed.
          consent: consent.checked,
          formVersion: current.version,
          locale,
          turnstileToken: token,
          gnw_hp_x: honeypot.value,
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
      return;
    }
    resetTurnstile();
    switch (result.code) {
      case 'contact_unavailable':
        showOnly(unavailable);
        return;
      case 'form_outdated': {
        const fresh = await getContactForm({ locale, fresh: true });
        if (!fresh) {
          showOnly(failed);
          return;
        }
        if (!fresh.available) {
          showOnly(unavailable);
          return;
        }
        render(fresh);
        showStatus('outdated');
        return;
      }
      case 'invalid_input': {
        let first: HTMLElement | null = null;
        for (const field of allFields()) {
          const code = toErrorCode(result.fields?.[field.key]);
          field.setError(code, code ? fieldMessages[code] : '');
          if (code) first ??= field.focusTarget;
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

  // Clear a field's error as soon as it is valid again.
  form.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const field = allFields().find((entry) => entry.owns(target));
    if (!field || field.validate() !== null) return;
    field.setError(null, '');
    const invalidMessage = form.querySelector<HTMLElement>(
      '[data-result="invalid"]',
    );
    if (invalidMessage && !form.querySelector('[aria-invalid="true"]')) {
      invalidMessage.hidden = true;
    }
  });
}
