import Archive from '@gravity-ui/icons/Archive';
import ArrowRotateLeft from '@gravity-ui/icons/ArrowRotateLeft';
import ArrowUturnCcwLeft from '@gravity-ui/icons/ArrowUturnCcwLeft';
import CircleExclamation from '@gravity-ui/icons/CircleExclamation';
import Envelope from '@gravity-ui/icons/Envelope';
import FloppyDisk from '@gravity-ui/icons/FloppyDisk';
import Lock from '@gravity-ui/icons/Lock';
import Plus from '@gravity-ui/icons/Plus';
import SquareCheck from '@gravity-ui/icons/SquareCheck';
import { useForm, useStore } from '@tanstack/react-form';
import { useEffect, useState, type ReactNode } from 'react';
import { FORM_LIMITS } from '../../../../src/features/contact-form/form-definition.ts';
import type { AdminFormState } from '../../../../src/features/contact-form/form-admin-routes.ts';
import type { Locale } from '../../../../src/shared/messages.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Badge } from '../../shared/ui/badge.tsx';
import { Button } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import { Notice } from '../../shared/ui/notice.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { showToast } from '../../shared/ui/toast.tsx';
import { useSignInOnUnauthorized } from '../auth/admin-session.tsx';
import { labelText } from '../inquiries/field-value.ts';
import { PageError } from '../layout/page-states.tsx';
import {
  archivedEntries,
  isDirty,
  newEditorField,
  serverErrors,
  toEditorField,
  toEditorValues,
  toUpdateBody,
  validateUpdate,
  type EditorError,
  type EditorField,
  type EditorValues,
} from './editor-model.ts';
import { FieldCard } from './field-card.tsx';
import { fetchFormState, restoreFormVersion, saveForm } from './form-api.ts';
import { FormHistory } from './form-history.tsx';
import { FormPreview, previewFromEditor } from './form-preview.tsx';

const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

/** A fixed row of the form (email, consent) that cannot be edited. */
const FixedRow = ({
  icon,
  title,
  note,
}: {
  icon: ReactNode;
  title: string;
  note: string;
}) => {
  const { t } = useI18n();
  return (
    <li
      data-testid='form-fixed-row'
      className='flex gap-3 rounded-2xl border border-dashed border-border bg-muted/50 px-4 py-3.5'
    >
      <span className='mt-0.5 text-muted-foreground [&_svg]:size-4'>
        {icon}
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='flex flex-wrap items-center gap-2'>
          <span className='font-semibold'>{title}</span>
          <Badge tone='slate'>
            <Lock aria-hidden='true' />
            {t('form.fixed')}
          </Badge>
        </span>
        <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
          {note}
        </p>
      </div>
    </li>
  );
};

const PreviewCard = ({ fields }: { fields: readonly EditorField[] }) => {
  const { locale, t } = useI18n();
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  return (
    <Card data-testid='form-preview-card' className='flex flex-col gap-4 p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-base font-semibold'>
            {t('form.previewHeading')}
          </h2>
          <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
            {t('form.previewLead')}
          </p>
        </div>
        <div
          role='group'
          aria-label={t('form.previewLanguage')}
          className='flex rounded-full border border-border bg-muted/60 p-0.5'
        >
          {(['ja', 'en'] as const).map((option) => (
            <button
              key={option}
              type='button'
              aria-pressed={previewLocale === option}
              onClick={() => setPreviewLocale(option)}
              className={cn(
                'h-7 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring',
                previewLocale === option
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`language.${option}`)}
            </button>
          ))}
        </div>
      </div>
      <div className='rounded-xl border border-border/70 bg-background/60 p-4'>
        <FormPreview
          fields={fields.map(previewFromEditor)}
          locale={previewLocale}
          untitled={t('form.untitled')}
        />
      </div>
    </Card>
  );
};

const FormEditor = ({
  state,
  onSaved,
  onReload,
}: {
  state: AdminFormState;
  onSaved: (next: AdminFormState) => void;
  onReload: () => void;
}) => {
  const { locale, t } = useI18n();
  const { current, history } = state;
  const [errors, setErrors] = useState<EditorError[]>([]);
  const [conflict, setConflict] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Built once: `toEditorValues` makes new client keys on every call, and
  // `useForm` resets an untouched form whenever `defaultValues` changes, so
  // building them in render loops forever. A new version remounts the editor.
  const [defaultValues] = useState(() => toEditorValues(current.definition));

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setConflict(false);
      const body = toUpdateBody(current.version, value);
      const problems = validateUpdate(body);
      if (problems.length > 0) {
        setErrors(problems);
        openWithErrors(value, problems);
        return;
      }
      setErrors([]);
      try {
        const next = await saveForm(body);
        showToast(
          next.current.version === current.version
            ? t('form.noChanges')
            : t('form.saved', { version: next.current.version }),
        );
        onSaved(next);
      } catch (error) {
        const apiError = toApiError(error);
        if (apiError.code === 'form_conflict') {
          setConflict(true);
          return;
        }
        if (apiError.code === 'invalid_input') {
          const fromServer = serverErrors(apiError.fields);
          setErrors(fromServer);
          openWithErrors(value, fromServer);
          return;
        }
        showToast(
          `${t('form.saveFailed')} ${errorMessage(t, apiError)}`,
          'error',
        );
      }
    },
  });

  const values = useStore(form.store, (s) => s.values);
  const submitting = useStore(form.store, (s) => s.isSubmitting);
  const dirty = isDirty(current.version, current.definition, values);
  const fields = values.fields;
  const archived = archivedEntries(current.definition, values);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function openWithErrors(value: EditorValues, problems: EditorError[]) {
    setOpen((keys) => {
      const next = new Set(keys);
      for (const problem of problems) {
        const key =
          problem.index === null ? undefined : value.fields[problem.index]?.key;
        if (key) next.add(key);
      }
      return next;
    });
  }

  const toggle = (key: string) =>
    setOpen((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const update = (index: number, change: (field: EditorField) => EditorField) =>
    form.setFieldValue('fields', (list) =>
      list.map((field, i) => (i === index ? change(field) : field)),
    );

  const add = (field: EditorField) => {
    setErrors([]);
    form.pushFieldValue('fields', field);
    setOpen((keys) => new Set(keys).add(field.key));
  };

  const restore = async (version: number) => {
    const next = await restoreFormVersion(version, current.version);
    showToast(t('form.restored', { version, next: next.current.version }));
    onSaved(next);
  };

  const full = fields.length >= FORM_LIMITS.fields;
  const formError = errors.length > 0;

  return (
    <form
      noValidate
      aria-labelledby='form-editor-title'
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className='flex flex-col gap-6'
    >
      <div className='flex flex-col gap-2'>
        <h1
          id='form-editor-title'
          className='text-2xl font-bold tracking-tight sm:text-[1.75rem]'
        >
          {t('form.title')}
        </h1>
        <p className='max-w-2xl text-sm leading-relaxed text-muted-foreground'>
          {t('form.lead')}
        </p>
      </div>

      <div className='sticky top-16 z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border/70 bg-background/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
          <Badge tone='outline' className='tabular-nums'>
            {t('form.version', { version: current.version })}
          </Badge>
          <span
            aria-live='polite'
            data-testid='form-dirty'
            className={cn(
              'text-sm',
              dirty ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {dirty ? t('form.unsaved') : t('form.upToDate')}
          </span>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='ghost'
            size='sm'
            disabled={!dirty || submitting}
            onClick={() => {
              setErrors([]);
              setConflict(false);
              setOpen(new Set());
              form.reset(defaultValues);
            }}
          >
            <ArrowUturnCcwLeft aria-hidden='true' />
            <span className='sr-only sm:not-sr-only'>{t('form.discard')}</span>
          </Button>
          <Button
            type='submit'
            size='sm'
            disabled={!dirty || submitting}
            data-testid='form-save'
          >
            {submitting ? <Spinner /> : <FloppyDisk aria-hidden='true' />}
            {submitting
              ? t('form.saving')
              : t('form.save', { version: current.version + 1 })}
          </Button>
        </div>
      </div>

      {conflict ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleExclamation aria-hidden='true' />}
          title={t('error.form_conflict')}
        >
          <div>
            <Button variant='outline' size='sm' onClick={onReload}>
              <ArrowRotateLeft aria-hidden='true' />
              {t('form.reload')}
            </Button>
          </div>
        </Notice>
      ) : null}
      {formError ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleExclamation aria-hidden='true' />}
        >
          {t('form.invalid')}
        </Notice>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]'>
        <div className='flex min-w-0 flex-col gap-6'>
          <section
            aria-labelledby='form-fields-heading'
            className='flex flex-col gap-3'
          >
            <div className='flex items-baseline justify-between gap-3'>
              <h2 id='form-fields-heading' className='text-lg font-semibold'>
                {t('form.fieldsHeading')}
              </h2>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {t('form.fieldsCount', {
                  count: fields.length,
                  max: FORM_LIMITS.fields,
                })}
              </span>
            </div>
            <ol className='flex flex-col gap-3'>
              <FixedRow
                icon={<Envelope aria-hidden='true' />}
                title={t('field.email')}
                note={t('form.emailNote')}
              />
              {fields.map((field, index) => (
                <FieldCard
                  key={field.key}
                  field={field}
                  index={index}
                  count={fields.length}
                  open={open.has(field.key)}
                  errors={errors.filter((error) => error.index === index)}
                  onToggle={() => toggle(field.key)}
                  onUpdate={(change) => update(index, change)}
                  onMove={(to) => {
                    setErrors([]);
                    form.moveFieldValues('fields', index, to);
                  }}
                  onRemove={() => {
                    setErrors([]);
                    void form.removeFieldValue('fields', index);
                    showToast(
                      t('form.removed', {
                        label: labelText(
                          field.label,
                          locale,
                          t('form.untitled'),
                        ),
                      }),
                    );
                  }}
                />
              ))}
              <FixedRow
                icon={<SquareCheck aria-hidden='true' />}
                title={t('field.consent')}
                note={t('form.consentNote')}
              />
            </ol>
            <div className='flex flex-wrap items-center gap-3'>
              <Button
                variant='outline'
                disabled={full}
                data-testid='form-add-field'
                onClick={() => add(newEditorField())}
              >
                <Plus aria-hidden='true' />
                {t('form.addField')}
              </Button>
              {full ? (
                <span className='text-sm text-muted-foreground'>
                  {t('form.tooManyFields', { max: FORM_LIMITS.fields })}
                </span>
              ) : null}
            </div>
          </section>

          {archived.length > 0 ? (
            <section
              aria-labelledby='form-archived-heading'
              className='flex flex-col gap-3'
            >
              <div className='flex flex-col gap-1'>
                <h2
                  id='form-archived-heading'
                  className='flex items-center gap-2 text-lg font-semibold'
                >
                  <Archive
                    aria-hidden='true'
                    className='size-4 text-muted-foreground'
                  />
                  {t('form.archivedHeading')}
                </h2>
                <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
                  {t('form.archivedLead')}
                </p>
              </div>
              <ul
                data-testid='form-archived'
                className='flex flex-col divide-y divide-border/70 rounded-2xl border border-border/80 bg-card'
              >
                {archived.map(({ field, pending }) => {
                  const label = labelText(field.label, locale, field.id);
                  return (
                    <li
                      key={field.id}
                      className='flex flex-wrap items-center gap-3 px-4 py-3'
                    >
                      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                        <span className='truncate font-medium'>{label}</span>
                        <span className='text-xs text-muted-foreground'>
                          {t(`form.type.${field.type}`)}
                          {' · '}
                          {pending
                            ? t('form.archivedPending')
                            : 'lastVersion' in field
                              ? t('form.archivedLast', {
                                  version: field.lastVersion,
                                })
                              : null}
                          {' · '}
                          <span className='font-mono'>{field.id}</span>
                        </span>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={full}
                        aria-label={t('form.putBackLabel', { label })}
                        onClick={() => add(toEditorField(field))}
                      >
                        <ArrowRotateLeft aria-hidden='true' />
                        {t('form.putBack')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className='flex min-w-0 flex-col gap-6'>
          <PreviewCard fields={fields} />
          <FormHistory
            history={history}
            currentVersion={current.version}
            dirty={dirty}
            onRestore={restore}
          />
        </aside>
      </div>
    </form>
  );
};

const EditorSkeleton = () => {
  const { t } = useI18n();
  return (
    <div className='flex flex-col gap-4'>
      <span role='status' className='sr-only'>
        {t('app.loading')}
      </span>
      <Skeleton className='h-8 w-64' />
      <Skeleton className='h-4 w-full max-w-xl' />
      {['a', 'b', 'c', 'd'].map((key) => (
        <Skeleton key={key} className='h-20 w-full rounded-2xl' />
      ))}
    </div>
  );
};

/**
 * The contact form editor (`/admin/form`): the fields of the current
 * version, a live preview in either language, the archived fields, and the
 * version history. Saving or restoring creates a new version.
 */
export const FormEditorPage = () => {
  const { t } = useI18n();
  const state = useAsync(fetchFormState, 'form');
  useSignInOnUnauthorized(state.status === 'error' ? state.error : null);
  if (state.status === 'loading') return <EditorSkeleton />;
  if (state.status === 'error') {
    return (
      <PageError
        message={errorMessage(t, state.error)}
        onRetry={state.reload}
      />
    );
  }
  return (
    <FormEditor
      key={state.data.current.version}
      state={state.data}
      onSaved={state.setData}
      onReload={state.reload}
    />
  );
};
