import CircleCheck from '@gravity-ui/icons/CircleCheck';
import CircleExclamation from '@gravity-ui/icons/CircleExclamation';
import Fingerprint from '@gravity-ui/icons/Fingerprint';
import Key from '@gravity-ui/icons/Key';
import ShieldCheck from '@gravity-ui/icons/ShieldCheck';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  setupInputSchema,
  type SetupInput,
} from '../../../../src/features/setup/setup-schema.ts';
import type { SetupState } from '../../../../src/features/setup/setup-routes.ts';
import type { SetupProblem } from '../../../../src/features/setup/setup-state.ts';
import { MIN_SECRET_LENGTH } from '../../../../src/shared/secret-length.ts';
import { ApiError, apiFetch } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { fieldErrorMessage } from '../../shared/form/field-error.ts';
import { Button, buttonVariants } from '../../shared/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from '../../shared/ui/field.tsx';
import { Notice } from '../../shared/ui/notice.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { fetchMe, fetchSetupState } from '../auth/admin-api.ts';
import { authClient } from '../auth/auth-client.ts';
import { AuthLayout } from '../layout/auth-layout.tsx';
import { PageLoading } from '../layout/page-states.tsx';

type Step =
  | { name: 'loading' }
  | { name: 'unavailable'; problems: SetupProblem[] }
  | { name: 'closed'; signedIn: boolean }
  | { name: 'token'; tokenName: TokenName }
  | { name: 'passkey' }
  | { name: 'done' };

const STEPS = ['setup.step1', 'setup.step2', 'setup.step3'] as const;

/** The secret the setup form asks for (`SetupState.tokenName`). */
type TokenName = NonNullable<SetupState['tokenName']>;

const StepIndicator = ({ current }: { current: 1 | 2 | 3 }) => {
  const { t } = useI18n();
  return (
    <ol
      aria-label={t('setup.stepOf', { current, total: STEPS.length })}
      className='flex items-center gap-2'
    >
      {STEPS.map((key, index) => {
        const number = index + 1;
        const state =
          number < current ? 'done' : number === current ? 'current' : 'todo';
        return (
          <li
            key={key}
            aria-current={state === 'current' ? 'step' : undefined}
            className='flex flex-1 flex-col gap-2'
          >
            <span
              className={cn(
                'h-1.5 rounded-full',
                state === 'todo' ? 'bg-accent' : 'bg-primary',
                state === 'current' && 'bg-primary/70',
              )}
            />
            <span
              className={cn(
                'text-xs leading-snug',
                state === 'current'
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {t(key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

type SetupFieldName = 'token' | 'email';

const EMPTY_SETUP_INPUT: SetupInput = { token: '', email: '', name: '' };

/**
 * Step 1: the setup token (`SETUP_TOKEN`, or `APP_SECRET` when
 * `SETUP_TOKEN` is not set), an address in `ADMIN_EMAILS`, and a name.
 */
const TokenStep = ({
  tokenName,
  onDone,
}: {
  tokenName: TokenName;
  onDone: () => void;
}) => {
  const { t } = useI18n();
  // Errors from the API that belong to one field, cleared when it changes.
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<SetupFieldName, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const clearServerError = (name: SetupFieldName) =>
    setServerErrors((errors) =>
      errors[name] ? { ...errors, [name]: undefined } : errors,
    );

  const form = useForm({
    defaultValues: EMPTY_SETUP_INPUT,
    // Check on submit, then again on every change until the input is valid.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: setupInputSchema },
    onSubmit: async ({ value }) => {
      setServerErrors({});
      setFormError(null);
      try {
        await apiFetch('/api/setup', {
          method: 'POST',
          body: JSON.stringify({
            token: value.token.trim(),
            email: value.email.trim(),
            name: value.name?.trim() || undefined,
          }),
        });
        onDone();
      } catch (error) {
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError(0, 'server_error', 'unexpected error');
        const message = errorMessage(t, apiError);
        if (apiError.code === 'invalid_setup_token') {
          setServerErrors({ token: message });
        } else if (apiError.code === 'email_not_allowed') {
          setServerErrors({ email: message });
        } else {
          setFormError(message);
        }
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className='flex flex-col gap-5'
    >
      <form.Field
        name='token'
        listeners={{ onChange: () => clearServerError('token') }}
      >
        {(field) => {
          const error =
            serverErrors.token ??
            fieldErrorMessage(t, field.state.value, field.state.meta.errors);
          return (
            <Field name={field.name} invalid={error !== null}>
              <FieldLabel>{t('admin.setup.token')}</FieldLabel>
              <Input
                type='password'
                required
                autoComplete='off'
                spellCheck={false}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldDescription>
                {t('setup.tokenHint', { name: tokenName })}
              </FieldDescription>
              {error ? <FieldError match>{error}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      <form.Field
        name='email'
        listeners={{ onChange: () => clearServerError('email') }}
      >
        {(field) => {
          const error =
            serverErrors.email ??
            fieldErrorMessage(t, field.state.value, field.state.meta.errors);
          return (
            <Field name={field.name} invalid={error !== null}>
              <FieldLabel>{t('admin.setup.email')}</FieldLabel>
              <Input
                type='email'
                required
                autoComplete='email'
                spellCheck={false}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldDescription>{t('setup.emailHint')}</FieldDescription>
              {error ? <FieldError match>{error}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      <form.Field name='name'>
        {(field) => {
          const error = fieldErrorMessage(
            t,
            field.state.value,
            field.state.meta.errors,
          );
          return (
            <Field name={field.name} invalid={error !== null}>
              <FieldLabel>{t('admin.setup.name')}</FieldLabel>
              <Input
                type='text'
                autoComplete='name'
                maxLength={100}
                value={field.state.value ?? ''}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldDescription>{t('setup.nameHint')}</FieldDescription>
              {error ? <FieldError match>{error}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      {formError ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleExclamation aria-hidden='true' />}
        >
          <p>{formError}</p>
        </Notice>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => (
          <Button type='submit' size='lg' disabled={busy} className='mt-1'>
            {busy ? <Spinner /> : null}
            {busy ? t('setup.checking') : t('setup.continue')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};

/** Step 2: register a passkey with the session from step 1. */
const PasskeyStep = ({ onDone }: { onDone: () => void }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const register = async () => {
    setBusy(true);
    setFailed(false);
    // Registering the first passkey deletes every session, including the
    // one from step 1. createSession signs the admin in with a new session
    // created after the passkey.
    const result = await authClient.passkey.addPasskey({
      name: 'goodnight-web',
      createSession: true,
    });
    setBusy(false);
    if (result?.error) {
      setFailed(true);
      return;
    }
    onDone();
  };

  return (
    <div className='flex flex-col gap-5'>
      <p className='text-[0.95rem] leading-relaxed'>{t('setup.passkeyLead')}</p>
      <Notice tone='info' icon={<ShieldCheck aria-hidden='true' />}>
        <p>{t('setup.passkeyDomain', { host: window.location.host })}</p>
      </Notice>
      {failed ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleExclamation aria-hidden='true' />}
        >
          <p>{t('setup.passkeyFailed')}</p>
        </Notice>
      ) : null}
      <Button size='lg' onClick={() => void register()} disabled={busy}>
        {busy ? <Spinner /> : <Fingerprint aria-hidden='true' />}
        {busy ? t('setup.registering') : t('admin.setup.registerPasskey')}
      </Button>
    </div>
  );
};

/**
 * First-admin setup: the setup token form (`POST /api/setup`), passkey
 * registration, and a done step. Shows why setup cannot run when it is not
 * configured or already closed. A visitor who finished step 1 earlier but
 * left before registering a passkey continues at step 2.
 */
export const SetupPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ name: 'loading' });

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchSetupState().catch(() => null),
      fetchMe().then(
        () => 'signed-in' as const,
        (error: unknown) =>
          error instanceof ApiError && error.code === 'passkey_required'
            ? ('needs-passkey' as const)
            : ('signed-out' as const),
      ),
    ]).then(([state, session]) => {
      if (!active) return;
      if (!state || !state.configured)
        setStep({ name: 'unavailable', problems: state?.problems ?? [] });
      else if (!state.open)
        setStep({ name: 'closed', signedIn: session === 'signed-in' });
      else if (session === 'needs-passkey') setStep({ name: 'passkey' });
      else
        setStep({ name: 'token', tokenName: state.tokenName ?? 'SETUP_TOKEN' });
    });
    return () => {
      active = false;
    };
  }, []);

  if (step.name === 'loading') {
    return (
      <AuthLayout>
        <PageLoading />
      </AuthLayout>
    );
  }

  if (step.name === 'unavailable' || step.name === 'closed') {
    const closed = step.name === 'closed';
    return (
      <AuthLayout>
        <Card>
          <CardHeader className='items-center text-center'>
            <div className='mb-2 flex size-14 items-center justify-center rounded-full bg-accent text-primary'>
              {closed ? (
                <CircleCheck aria-hidden='true' className='size-6' />
              ) : (
                <CircleExclamation aria-hidden='true' className='size-6' />
              )}
            </div>
            <CardTitle>
              {closed ? t('setup.closedTitle') : t('setup.unavailableTitle')}
            </CardTitle>
            <CardDescription>
              {closed ? t('setup.closedLead') : t('error.setup_unavailable')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col items-center gap-4'>
            {step.name === 'unavailable' && step.problems.length > 0 ? (
              <ul
                data-testid='setup-problems'
                className='flex list-disc flex-col gap-1 pl-5 text-[0.95rem]'
              >
                {step.problems.map((problem) => (
                  <li key={problem.name}>
                    {problem.issue === 'too_short'
                      ? t('setup.problemTooShort', {
                          name: problem.name,
                          min: MIN_SECRET_LENGTH,
                        })
                      : t('setup.problemMissing', { name: problem.name })}
                  </li>
                ))}
              </ul>
            ) : null}
            {closed ? (
              <Link
                to={step.signedIn ? '/' : '/login'}
                className={buttonVariants({ variant: 'primary' })}
              >
                {step.signedIn ? t('setup.goToList') : t('setup.goToLogin')}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const current = step.name === 'token' ? 1 : step.name === 'passkey' ? 2 : 3;
  return (
    <AuthLayout>
      <Card>
        <CardHeader className='gap-5'>
          <StepIndicator current={current} />
          <div className='flex flex-col gap-1.5'>
            <CardTitle className='flex items-center gap-2'>
              {step.name === 'done' ? (
                <CircleCheck
                  aria-hidden='true'
                  className='size-5 text-primary'
                />
              ) : (
                <Key aria-hidden='true' className='size-5 text-primary' />
              )}
              {step.name === 'token'
                ? t('admin.setup.title')
                : step.name === 'passkey'
                  ? t('admin.setup.registerPasskey')
                  : t('setup.doneTitle')}
            </CardTitle>
            {step.name === 'token' ? (
              <CardDescription>
                {t('setup.lead', { name: step.tokenName })}
              </CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {step.name === 'token' ? (
            <TokenStep
              tokenName={step.tokenName}
              onDone={() => setStep({ name: 'passkey' })}
            />
          ) : step.name === 'passkey' ? (
            <PasskeyStep onDone={() => setStep({ name: 'done' })} />
          ) : (
            <div className='flex flex-col gap-6'>
              <p className='text-[0.95rem] leading-relaxed'>
                {t('setup.doneLead')}
              </p>
              <Button
                size='lg'
                onClick={() => void navigate({ to: '/', replace: true })}
              >
                {t('setup.goToList')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
