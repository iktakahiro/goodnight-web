import { submitContact, type SubmitResult } from './submit-contact';

/**
 * Connects the contact form on the page: checks the fields in the browser,
 * sends the form with {@link submitContact}, and shows the result message.
 * Messages are elements in the form marked with `data-result="<status>"`.
 */
export function setupContactForm(form: HTMLFormElement): void {
  const submitButton = form.querySelector<HTMLButtonElement>('[type="submit"]');
  const results = form.querySelectorAll<HTMLElement>('[data-result]');
  const unavailableNotice = document.querySelector<HTMLElement>(
    '[data-contact-unavailable]',
  );

  function showResult(result: SubmitResult): void {
    for (const element of results) {
      element.hidden = element.dataset.result !== result.status;
    }
    if (result.status === 'unavailable' && unavailableNotice) {
      unavailableNotice.hidden = false;
    }
    const shown = form.querySelector<HTMLElement>(
      `[data-result="${result.status}"]`,
    );
    shown?.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    for (const element of results) element.hidden = true;

    if (!form.checkValidity()) {
      for (const field of form.querySelectorAll<HTMLInputElement>(
        'input, select, textarea',
      )) {
        field.setAttribute('aria-invalid', String(!field.validity.valid));
      }
      form.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }

    const idleLabel = submitButton?.textContent ?? '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = submitButton.dataset.labelSending ?? idleLabel;
    }
    try {
      const result = await submitContact(form);
      showResult(result);
      if (result.status === 'success') form.reset();
    } catch {
      showResult({ status: 'error' });
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.textContent = idleLabel;
      }
    }
  });

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) &&
      target.hasAttribute('aria-invalid')
    ) {
      target.setAttribute('aria-invalid', String(!target.validity.valid));
    }
  });
}
