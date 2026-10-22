import type {
  LocalizedText,
  PublicContactForm,
  PublicFormField,
} from '@goodnight-web/server/client';
import { controlClass } from '../../components/ui/input-styles';
import type { Locale } from '../../../site.config';

/** Per-field error code, as returned by the server for `invalid_input`. */
export type FieldErrorCode = 'required' | 'invalid' | 'too_long';

/** A value the form sends: text, or the checked options of a checkbox group. */
export type FieldInputValue = string | string[];

/** Texts the rendered fields need, in the page language. */
export interface RenderTexts {
  required: string;
  optional: string;
  selectPlaceholder: string;
  emailLabel: string;
  emailHint: string;
  emailPlaceholder: string;
}

/** A rendered field: its controls and how to read, write, and mark it. */
export interface RenderedField {
  /** Key in the request: `email` or the field id. */
  key: string;
  /** The element to focus when the field has an error. */
  focusTarget: HTMLElement;
  /** Whether `target` (an input event target) is one of its controls. */
  owns(target: Element): boolean;
  read(): FieldInputValue;
  write(value: FieldInputValue): void;
  /** Checks the field in the browser. `null` when it is valid. */
  validate(): FieldErrorCode | null;
  setError(code: FieldErrorCode | null, message: string): void;
}

/**
 * The text in `locale`, or in the other language when that one is empty.
 * Same rule as the server and the admin screen.
 */
export function localized(text: LocalizedText | undefined, locale: Locale) {
  if (!text) return '';
  return text[locale] || text[locale === 'ja' ? 'en' : 'ja'];
}

const TEL_PATTERN = '[0-9０-９+\\(\\)\\- ]*';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; id?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  // Labels and hints come from the admin screen: always text, never HTML.
  if (props.text !== undefined) node.textContent = props.text;
  return node;
}

function badge(required: boolean, texts: RenderTexts): HTMLSpanElement {
  return element('span', {
    className: required
      ? 'rounded-full bg-primary px-2 py-px text-[0.7rem] text-primary-foreground'
      : 'rounded-full bg-primary-soft px-2 py-px text-[0.7rem] text-primary-strong',
    text: required ? texts.required : texts.optional,
  });
}

/** Sets `aria-invalid` and links or unlinks the error message. */
function markInvalid(
  target: HTMLElement,
  errorId: string,
  code: FieldErrorCode | null,
): void {
  const ids = (target.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '' && id !== errorId);
  if (code) {
    target.setAttribute('aria-invalid', 'true');
    ids.push(errorId);
  } else if (target.hasAttribute('aria-invalid')) {
    target.setAttribute('aria-invalid', 'false');
  }
  if (ids.length > 0) target.setAttribute('aria-describedby', ids.join(' '));
  else target.removeAttribute('aria-describedby');
}

function errorParagraph(id: string): HTMLParagraphElement {
  const error = element('p', {
    id: `${id}-error`,
    className: 'text-sm font-bold text-danger',
  });
  error.hidden = true;
  return error;
}

function showError(
  error: HTMLParagraphElement,
  code: FieldErrorCode | null,
  message: string,
): void {
  error.textContent = code ? message : '';
  error.hidden = !code;
}

type SingleControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controlError(control: SingleControl): FieldErrorCode | null {
  if (control.checkValidity()) return null;
  if (control.validity.valueMissing) return 'required';
  if (control.validity.tooLong) return 'too_long';
  return 'invalid';
}

/** One input, select, or text area with a label above it. */
function renderSingle(
  field: PublicFormField,
  locale: Locale,
  texts: RenderTexts,
): { wrapper: HTMLElement; rendered: RenderedField } {
  const id = `contact-${field.id}`;
  const wrapper = element('div', { className: 'space-y-2' });
  const label = element('label', {
    className: 'flex items-center gap-2 text-sm font-bold',
  });
  label.htmlFor = id;
  label.append(localized(field.label, locale), badge(field.required, texts));
  wrapper.append(label);

  let control: SingleControl;
  if (field.type === 'textarea') {
    const area = element('textarea', {
      id,
      className: `${controlClass} min-h-48 resize-y leading-relaxed`,
    });
    area.rows = 8;
    control = area;
  } else if (field.type === 'select') {
    const select = element('select', {
      id,
      className: `${controlClass} appearance-none pr-12`,
    });
    select.append(
      new Option(
        localized(field.placeholder, locale) || texts.selectPlaceholder,
        '',
      ),
    );
    for (const option of field.options ?? []) {
      select.append(new Option(localized(option.label, locale), option.value));
    }
    control = select;
  } else {
    const input = element('input', { id, className: controlClass });
    input.type = field.type;
    if (field.type === 'tel') {
      input.autocomplete = 'tel';
      input.inputMode = 'tel';
      input.pattern = TEL_PATTERN;
    } else if (field.type === 'url') {
      input.inputMode = 'url';
    } else if (field.type === 'number') {
      input.inputMode = 'decimal';
      input.step = 'any';
    }
    control = input;
  }
  control.name = field.id;
  control.required = field.required;
  if (field.maxLength && !(control instanceof HTMLSelectElement)) {
    control.maxLength = field.maxLength;
  }
  const placeholder = localized(field.placeholder, locale);
  if (placeholder && !(control instanceof HTMLSelectElement)) {
    control.placeholder = placeholder;
  }

  if (control instanceof HTMLSelectElement) {
    const box = element('div', { className: 'relative' });
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute(
      'class',
      'pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted',
    );
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6');
    arrow.append(path);
    box.append(control, arrow);
    wrapper.append(box);
  } else {
    wrapper.append(control);
  }

  const hint = localized(field.hint, locale);
  if (hint) {
    wrapper.append(
      element('p', {
        id: `${id}-hint`,
        className: 'text-sm text-muted',
        text: hint,
      }),
    );
    control.setAttribute('aria-describedby', `${id}-hint`);
  }
  const error = errorParagraph(id);
  wrapper.append(error);

  return {
    wrapper,
    rendered: {
      key: field.id,
      focusTarget: control,
      owns: (target) => target === control,
      read: () => control.value,
      write: (value) => {
        if (typeof value === 'string') control.value = value;
      },
      validate: () => controlError(control),
      setError: (code, message) => {
        markInvalid(control, error.id, code);
        showError(error, code, message);
      },
    },
  };
}

/** A radio or checkbox group in a fieldset with a legend. */
function renderGroup(
  field: PublicFormField,
  locale: Locale,
  texts: RenderTexts,
): { wrapper: HTMLElement; rendered: RenderedField } {
  const id = `contact-${field.id}`;
  const wrapper = element('fieldset', { id, className: 'space-y-2' });
  const legend = element('legend', {
    className: 'flex items-center gap-2 text-sm font-bold',
  });
  legend.append(localized(field.label, locale), badge(field.required, texts));
  wrapper.append(legend);
  const hint = localized(field.hint, locale);
  const hintId = hint ? `${id}-hint` : null;

  const list = element('div', {
    className: 'flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:gap-x-6',
  });
  const inputs: HTMLInputElement[] = [];
  for (const [index, option] of (field.options ?? []).entries()) {
    const optionLabel = element('label', {
      className: 'flex items-center gap-2.5',
    });
    const input = element('input', {
      id: `${id}-${index}`,
      className: 'size-5 shrink-0 accent-primary',
    });
    input.type = field.type === 'radio' ? 'radio' : 'checkbox';
    input.name = field.id;
    input.value = option.value;
    if (field.type === 'radio' && field.required) input.required = true;
    optionLabel.append(input, localized(option.label, locale));
    list.append(optionLabel);
    inputs.push(input);
  }
  wrapper.append(list);
  if (hint && hintId) {
    wrapper.append(
      element('p', { id: hintId, className: 'text-sm text-muted', text: hint }),
    );
  }
  if (hintId) wrapper.setAttribute('aria-describedby', hintId);
  const error = errorParagraph(id);
  wrapper.append(error);

  const checked = () =>
    inputs.filter((input) => input.checked).map((input) => input.value);
  const first = inputs[0] ?? wrapper;
  return {
    wrapper,
    rendered: {
      key: field.id,
      focusTarget: first,
      owns: (target) => wrapper.contains(target),
      read: () =>
        field.type === 'checkbox' ? checked() : (checked()[0] ?? ''),
      write: (value) => {
        const values = Array.isArray(value) ? value : [value];
        for (const input of inputs)
          input.checked = values.includes(input.value);
      },
      validate: () =>
        field.required && checked().length === 0 ? 'required' : null,
      setError: (code, message) => {
        markInvalid(wrapper, error.id, code);
        showError(error, code, message);
      },
    },
  };
}

/** The fixed email field. It is not part of the editable form. */
function renderEmail(
  form: PublicContactForm,
  texts: RenderTexts,
): { wrapper: HTMLElement; rendered: RenderedField } {
  const id = 'contact-email';
  const wrapper = element('div', { className: 'space-y-2' });
  const label = element('label', {
    className: 'flex items-center gap-2 text-sm font-bold',
  });
  label.htmlFor = id;
  label.append(texts.emailLabel, badge(true, texts));
  const input = element('input', { id, className: controlClass });
  input.type = 'email';
  input.name = 'email';
  input.autocomplete = 'email';
  input.inputMode = 'email';
  input.required = true;
  input.maxLength = form.email.maxLength;
  input.placeholder = texts.emailPlaceholder;
  input.setAttribute('aria-describedby', `${id}-hint`);
  const hint = element('p', {
    id: `${id}-hint`,
    className: 'text-sm text-muted',
    text: texts.emailHint,
  });
  const error = errorParagraph(id);
  wrapper.append(label, input, hint, error);
  return {
    wrapper,
    rendered: {
      key: 'email',
      focusTarget: input,
      owns: (target) => target === input,
      read: () => input.value,
      write: (value) => {
        if (typeof value === 'string') input.value = value;
      },
      validate: () => controlError(input),
      setError: (code, message) => {
        markInvalid(input, error.id, code);
        showError(error, code, message);
      },
    },
  };
}

/**
 * Renders the email field and then the form's fields, in order, into
 * `container`, replacing what was there. Values in `keep` (by request key)
 * are filled in again, so a re-render after a form update keeps what the
 * visitor typed.
 */
export function renderFields(
  container: HTMLElement,
  form: PublicContactForm,
  locale: Locale,
  texts: RenderTexts,
  keep: ReadonlyMap<string, FieldInputValue> = new Map(),
): RenderedField[] {
  const parts = [renderEmail(form, texts)];
  for (const field of form.fields) {
    parts.push(
      field.type === 'radio' || field.type === 'checkbox'
        ? renderGroup(field, locale, texts)
        : renderSingle(field, locale, texts),
    );
  }
  container.replaceChildren(...parts.map((part) => part.wrapper));
  const rendered = parts.map((part) => part.rendered);
  for (const field of rendered) {
    const value = keep.get(field.key);
    if (value !== undefined) field.write(value);
  }
  return rendered;
}
