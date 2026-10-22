import ArrowDown from '@gravity-ui/icons/ArrowDown';
import ArrowUp from '@gravity-ui/icons/ArrowUp';
import ChevronDown from '@gravity-ui/icons/ChevronDown';
import Plus from '@gravity-ui/icons/Plus';
import TrashBin from '@gravity-ui/icons/TrashBin';
import Xmark from '@gravity-ui/icons/Xmark';
import { useId, type ReactNode } from 'react';
import {
  isChoiceFieldType,
  isTextFieldType,
  type FormFieldType,
  type LocalizedText,
} from '../../../../src/features/contact-form/form-definition.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Badge } from '../../shared/ui/badge.tsx';
import { Button } from '../../shared/ui/button.tsx';
import { cn } from '../../shared/ui/cn.ts';
import { Input } from '../../shared/ui/field.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/select.tsx';
import { labelText } from '../inquiries/field-value.ts';
import {
  allowedTypes,
  defaultMaxLength,
  maxLengthLimit,
  newEditorOption,
  type EditorError,
  type EditorField,
  type EditorOption,
} from './editor-model.ts';

/** Changes one field of the editor. */
export type UpdateField = (update: (field: EditorField) => EditorField) => void;

const settingError = (errors: readonly EditorError[], setting: string) =>
  errors.find((error) => error.setting === setting) ?? null;

const ErrorText = ({
  id,
  error,
}: {
  id: string;
  error: EditorError | null;
}) => {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <p id={id} className='text-[0.8125rem] font-medium text-destructive'>
      {t(error.message)}
    </p>
  );
};

const SettingLabel = ({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) => (
  <label htmlFor={htmlFor} className='text-sm font-semibold text-foreground'>
    {children}
  </label>
);

/** Two text inputs, Japanese and English, side by side on wide screens. */
const LocalizedInputs = ({
  idPrefix,
  labels,
  value,
  onChange,
  maxLength,
  error,
}: {
  idPrefix: string;
  labels: { ja: string; en: string };
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  maxLength: number;
  error?: EditorError | null;
}) => {
  const errorId = `${idPrefix}-error`;
  return (
    <div className='flex flex-col gap-2'>
      <div className='grid gap-3 sm:grid-cols-2'>
        {(['ja', 'en'] as const).map((lang) => (
          <div key={lang} className='flex flex-col gap-1.5'>
            <SettingLabel htmlFor={`${idPrefix}-${lang}`}>
              {labels[lang]}
            </SettingLabel>
            <Input
              id={`${idPrefix}-${lang}`}
              lang={lang}
              value={value[lang]}
              maxLength={maxLength}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) =>
                onChange({ ...value, [lang]: event.target.value })
              }
            />
          </div>
        ))}
      </div>
      <ErrorText id={errorId} error={error ?? null} />
    </div>
  );
};

const Toggle = ({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => (
  <label
    htmlFor={id}
    className='inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium'
  >
    <input
      id={id}
      type='checkbox'
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className='size-4.5 shrink-0 cursor-pointer accent-primary'
    />
    {children}
  </label>
);

const IconButton = ({
  label,
  onClick,
  disabled,
  children,
  tone = 'default',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: 'default' | 'destructive';
}) => (
  <Button
    variant='ghost'
    size='icon'
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'size-9',
      tone === 'destructive' &&
        'text-destructive hover:bg-destructive-soft hover:text-destructive',
    )}
  >
    {children}
  </Button>
);

const OptionsEditor = ({
  idPrefix,
  options,
  onChange,
  error,
}: {
  idPrefix: string;
  options: EditorOption[];
  onChange: (options: EditorOption[]) => void;
  error: EditorError | null;
}) => {
  const { t } = useI18n();
  const move = (from: number, to: number) => {
    const next = [...options];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  };
  return (
    <fieldset className='flex flex-col gap-3'>
      <legend className='mb-2 text-sm font-semibold'>
        {t('form.options')}
      </legend>
      <ol className='flex flex-col gap-3'>
        {options.map((option, index) => {
          const n = index + 1;
          return (
            <li
              key={option.key}
              className='flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/40 p-3 sm:flex-row sm:items-end'
            >
              <span
                aria-hidden='true'
                className='hidden w-5 pb-3 text-center text-xs text-muted-foreground tabular-nums sm:block'
              >
                {n}
              </span>
              <div className='grid flex-1 gap-2 sm:grid-cols-2'>
                {(['ja', 'en'] as const).map((lang) => (
                  <div key={lang} className='flex flex-col gap-1'>
                    <label
                      htmlFor={`${idPrefix}-${option.key}-${lang}`}
                      className='text-xs font-medium text-muted-foreground'
                    >
                      {t(lang === 'ja' ? 'form.optionJa' : 'form.optionEn', {
                        n,
                      })}
                    </label>
                    <Input
                      id={`${idPrefix}-${option.key}-${lang}`}
                      lang={lang}
                      value={option.label[lang]}
                      maxLength={100}
                      className='h-10'
                      onChange={(event) =>
                        onChange(
                          options.map((entry) =>
                            entry.key === option.key
                              ? {
                                  ...entry,
                                  label: {
                                    ...entry.label,
                                    [lang]: event.target.value,
                                  },
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <div className='flex shrink-0 justify-end gap-0.5'>
                <IconButton
                  label={t('form.optionUp', { n })}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp aria-hidden='true' />
                </IconButton>
                <IconButton
                  label={t('form.optionDown', { n })}
                  disabled={index === options.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown aria-hidden='true' />
                </IconButton>
                <IconButton
                  label={t('form.optionRemove', { n })}
                  tone='destructive'
                  onClick={() =>
                    onChange(
                      options.filter((entry) => entry.key !== option.key),
                    )
                  }
                >
                  <Xmark aria-hidden='true' />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
      <ErrorText id={`${idPrefix}-options-error`} error={error} />
      <Button
        variant='outline'
        size='sm'
        className='self-start'
        disabled={options.length >= 50}
        onClick={() => onChange([...options, newEditorOption()])}
      >
        <Plus aria-hidden='true' />
        {t('form.addOption')}
      </Button>
    </fieldset>
  );
};

/**
 * One field in the editor: a summary row with the order buttons, and the
 * settings when it is open.
 */
export const FieldCard = ({
  field,
  index,
  count,
  open,
  errors,
  onToggle,
  onUpdate,
  onMove,
  onRemove,
}: {
  field: EditorField;
  index: number;
  count: number;
  open: boolean;
  errors: readonly EditorError[];
  onToggle: () => void;
  onUpdate: UpdateField;
  onMove: (to: number) => void;
  onRemove: () => void;
}) => {
  const { locale, t } = useI18n();
  const id = useId();
  const title = labelText(field.label, locale, t('form.untitled'));
  const types = allowedTypes(field);
  const textType = isTextFieldType(field.type);
  const choiceType = isChoiceFieldType(field.type);
  const limit = maxLengthLimit(field.type);
  const hasErrors = errors.length > 0;
  const fieldError =
    settingError(errors, 'field') ?? settingError(errors, 'type');
  const maxLengthError = settingError(errors, 'maxLength');

  return (
    <li
      data-testid='form-field-card'
      className={cn(
        'rounded-2xl border bg-card shadow-xs transition-colors',
        hasErrors ? 'border-destructive/50' : 'border-border/80',
      )}
    >
      <div className='flex items-center gap-2 py-2.5 pr-2 pl-4 sm:gap-3'>
        <span
          aria-hidden='true'
          className='w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums'
        >
          {index + 1}
        </span>
        <button
          type='button'
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-settings`}
          className='flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-lg py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring'
        >
          <span className='flex w-full min-w-0 items-center gap-2'>
            <span
              className={cn(
                'truncate font-semibold',
                title === t('form.untitled') && 'text-muted-foreground',
              )}
            >
              {title}
            </span>
            <ChevronDown
              aria-hidden='true'
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </span>
          <span className='flex flex-wrap items-center gap-1.5'>
            <Badge tone='outline'>{t(`form.type.${field.type}`)}</Badge>
            {field.required ? (
              <Badge tone='violet'>{t('form.previewRequired')}</Badge>
            ) : null}
            {field.id ? (
              <span className='font-mono text-[0.7rem] text-muted-foreground'>
                {t('form.fieldId', { id: field.id })}
              </span>
            ) : (
              <Badge tone='violet'>{t('form.new')}</Badge>
            )}
          </span>
        </button>
        <div className='flex shrink-0 items-center'>
          <IconButton
            label={t('form.moveUp', { label: title })}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp aria-hidden='true' />
          </IconButton>
          <IconButton
            label={t('form.moveDown', { label: title })}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown aria-hidden='true' />
          </IconButton>
        </div>
      </div>

      {open ? (
        <div
          id={`${id}-settings`}
          className='flex flex-col gap-5 border-t border-border/70 px-4 pt-4 pb-5 sm:px-5'
        >
          <LocalizedInputs
            idPrefix={`${id}-label`}
            labels={{ ja: t('form.labelJa'), en: t('form.labelEn') }}
            value={field.label}
            maxLength={100}
            error={settingError(errors, 'label')}
            onChange={(label) => onUpdate((f) => ({ ...f, label }))}
          />

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-1.5'>
              <Select
                items={types.map((type) => ({
                  value: type,
                  label: t(`form.type.${type}`),
                }))}
                value={field.type}
                onValueChange={(value: unknown) => {
                  const type = types.find((entry) => entry === value);
                  if (!type) return;
                  onUpdate((f) => ({
                    ...f,
                    type,
                    options:
                      isChoiceFieldType(type) && f.options.length === 0
                        ? [newEditorOption()]
                        : f.options,
                  }));
                }}
              >
                <span className='text-sm font-semibold' id={`${id}-type-label`}>
                  {t('form.type')}
                </span>
                <SelectTrigger aria-labelledby={`${id}-type-label`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type: FormFieldType) => (
                    <SelectItem key={type} value={type}>
                      {t(`form.type.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.savedType ? (
                <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
                  {t('form.typeLocked')}
                </p>
              ) : null}
            </div>
            {textType ? (
              <div className='flex flex-col gap-1.5'>
                <SettingLabel htmlFor={`${id}-max`}>
                  {t('form.maxLength')}
                </SettingLabel>
                <Input
                  id={`${id}-max`}
                  inputMode='numeric'
                  value={field.maxLength}
                  placeholder={String(defaultMaxLength(field.type))}
                  aria-invalid={maxLengthError ? true : undefined}
                  aria-describedby={`${id}-max-hint`}
                  onChange={(event) =>
                    onUpdate((f) => ({ ...f, maxLength: event.target.value }))
                  }
                />
                <p
                  id={`${id}-max-hint`}
                  className={cn(
                    'text-[0.8125rem] leading-relaxed',
                    maxLengthError
                      ? 'font-medium text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {maxLengthError
                    ? t('form.error.max_length', { max: limit })
                    : t('form.maxLengthHint', {
                        max: limit,
                        default: defaultMaxLength(field.type),
                      })}
                </p>
              </div>
            ) : null}
          </div>

          <div className='flex flex-wrap gap-x-6 gap-y-3'>
            <Toggle
              id={`${id}-required`}
              checked={field.required}
              onChange={(required) => onUpdate((f) => ({ ...f, required }))}
            >
              {t('form.required')}
            </Toggle>
            <Toggle
              id={`${id}-list`}
              checked={field.showInList}
              onChange={(showInList) => onUpdate((f) => ({ ...f, showInList }))}
            >
              {t('form.showInList')}
            </Toggle>
          </div>

          {choiceType ? (
            <OptionsEditor
              idPrefix={`${id}-option`}
              options={field.options}
              error={settingError(errors, 'options')}
              onChange={(options) => onUpdate((f) => ({ ...f, options }))}
            />
          ) : null}

          <details
            className='group rounded-xl border border-border/70 px-4 py-3'
            open={
              Boolean(
                field.placeholder.ja ||
                field.placeholder.en ||
                field.hint.ja ||
                field.hint.en,
              ) || undefined
            }
          >
            <summary className='cursor-pointer text-sm font-semibold text-muted-foreground outline-none select-none focus-visible:text-foreground'>
              {t('form.moreSettings')}
            </summary>
            <div className='mt-4 flex flex-col gap-4'>
              {field.type === 'radio' || field.type === 'checkbox' ? null : (
                <LocalizedInputs
                  idPrefix={`${id}-placeholder`}
                  labels={{
                    ja: t('form.placeholderJa'),
                    en: t('form.placeholderEn'),
                  }}
                  value={field.placeholder}
                  maxLength={100}
                  error={settingError(errors, 'placeholder')}
                  onChange={(placeholder) =>
                    onUpdate((f) => ({ ...f, placeholder }))
                  }
                />
              )}
              <LocalizedInputs
                idPrefix={`${id}-hint`}
                labels={{ ja: t('form.hintJa'), en: t('form.hintEn') }}
                value={field.hint}
                maxLength={200}
                error={settingError(errors, 'hint')}
                onChange={(hint) => onUpdate((f) => ({ ...f, hint }))}
              />
            </div>
          </details>

          {fieldError ? (
            <ErrorText id={`${id}-field-error`} error={fieldError} />
          ) : null}

          <div className='flex justify-end border-t border-border/60 pt-4'>
            <Button
              variant='destructive-outline'
              size='sm'
              aria-label={t('form.removeLabel', { label: title })}
              onClick={onRemove}
            >
              <TrashBin aria-hidden='true' />
              {t('form.remove')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
};
