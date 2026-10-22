import { ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  localizedText,
  type FormField,
  type FormFieldType,
  type LocalizedText,
} from '../../../../src/features/contact-form/form-definition.ts';
import { uiMessages } from '../../shared/i18n/admin-messages.ts';
import type { Locale } from '../../../../src/shared/messages.ts';
import { cn } from '../../shared/ui/cn.ts';
import type { EditorField } from './editor-model.ts';

/** A field as the preview draws it. */
export interface PreviewField {
  key: string;
  type: FormFieldType;
  label: LocalizedText;
  placeholder?: LocalizedText | undefined;
  hint?: LocalizedText | undefined;
  required: boolean;
  options: { key: string; label: LocalizedText }[];
}

/** An editor field for the preview. */
export const previewFromEditor = (field: EditorField): PreviewField => ({
  key: field.key,
  type: field.type,
  label: field.label,
  placeholder: field.placeholder,
  hint: field.hint,
  required: field.required,
  options: field.options.map((option) => ({
    key: option.key,
    label: option.label,
  })),
});

/** A saved field for the preview. */
export const previewFromField = (field: FormField): PreviewField => ({
  key: field.id,
  type: field.type,
  label: field.label,
  placeholder: field.placeholder,
  hint: field.hint,
  required: field.required,
  options: (field.options ?? []).map((option) => ({
    key: option.value,
    label: option.label,
  })),
});

const control =
  'block w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-[0.95rem] text-foreground placeholder:text-muted-foreground';

const PreviewLabel = ({
  text,
  required,
  locale,
  children,
}: {
  text: string;
  required: boolean;
  locale: Locale;
  children?: ReactNode;
}) => {
  const strings = uiMessages[locale];
  return (
    <span className='flex flex-wrap items-center gap-2 text-sm font-semibold'>
      {text}
      <span
        className={cn(
          'rounded-full px-2 py-px text-[0.7rem]',
          required
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {required
          ? strings['form.previewRequired']
          : strings['form.previewOptional']}
      </span>
      {children}
    </span>
  );
};

const PreviewInput = ({
  field,
  locale,
}: {
  field: PreviewField;
  locale: Locale;
}) => {
  const placeholder = field.placeholder
    ? localizedText(field.placeholder, locale)
    : '';
  const strings = uiMessages[locale];
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          readOnly
          rows={4}
          placeholder={placeholder}
          className={cn(control, 'resize-none')}
        />
      );
    case 'select':
      return (
        <span className={cn(control, 'flex items-center justify-between')}>
          <span className='text-muted-foreground'>
            {placeholder || strings['form.previewSelect']}
          </span>
          <ChevronsUpDown
            aria-hidden='true'
            className='size-4 text-muted-foreground'
          />
        </span>
      );
    case 'radio':
    case 'checkbox':
      return (
        <span className='flex flex-col gap-2'>
          {field.options.map((option) => (
            <span key={option.key} className='flex items-center gap-2.5'>
              <input
                type={field.type}
                readOnly
                tabIndex={-1}
                className='size-4 accent-primary'
              />
              <span className='text-[0.95rem]'>
                {localizedText(option.label, locale) || '—'}
              </span>
            </span>
          ))}
        </span>
      );
    default:
      return (
        <input
          readOnly
          type={field.type === 'number' ? 'text' : field.type}
          placeholder={placeholder}
          className={control}
        />
      );
  }
};

/**
 * A static drawing of the public form in `locale`: the fixed email field,
 * the fields in order, and the fixed consent checkbox. It is inert: nothing
 * in it can be focused or changed.
 */
export const FormPreview = ({
  fields,
  locale,
  untitled,
}: {
  fields: readonly PreviewField[];
  locale: Locale;
  /** Shown for a field without a label. */
  untitled: string;
}) => {
  const strings = uiMessages[locale];
  return (
    <div
      inert
      lang={locale}
      data-testid='form-preview'
      className='flex flex-col gap-5'
    >
      <div className='flex flex-col gap-2'>
        <PreviewLabel text={strings['field.email']} required locale={locale} />
        <input
          readOnly
          type='email'
          placeholder='name@example.com'
          className={control}
        />
      </div>
      {fields.map((field) => {
        const hint = field.hint ? localizedText(field.hint, locale) : '';
        return (
          <div key={field.key} className='flex flex-col gap-2'>
            <PreviewLabel
              text={localizedText(field.label, locale) || untitled}
              required={field.required}
              locale={locale}
            />
            <PreviewInput field={field} locale={locale} />
            {hint ? (
              <span className='text-[0.8125rem] text-muted-foreground'>
                {hint}
              </span>
            ) : null}
          </div>
        );
      })}
      <span className='flex items-start gap-2.5 rounded-xl bg-muted/70 p-3.5 text-sm font-semibold'>
        <input
          type='checkbox'
          readOnly
          tabIndex={-1}
          className='mt-0.5 size-4 accent-primary'
        />
        {strings['field.consent']}
      </span>
    </div>
  );
};
