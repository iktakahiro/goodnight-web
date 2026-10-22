import { Field as BaseField } from '@base-ui/react/field';
import { Input as BaseInput } from '@base-ui/react/input';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Groups a label, a control, a description, and an error (Base UI Field). */
export const Field = ({
  className,
  ...props
}: ComponentProps<typeof BaseField.Root>) => (
  <BaseField.Root className={cn('flex flex-col gap-2', className)} {...props} />
);

/** The label of a {@link Field}. */
export const FieldLabel = ({
  className,
  ...props
}: ComponentProps<typeof BaseField.Label>) => (
  <BaseField.Label
    className={cn('text-sm font-semibold text-foreground', className)}
    {...props}
  />
);

/** Help text under a field's control. */
export const FieldDescription = ({
  className,
  ...props
}: ComponentProps<typeof BaseField.Description>) => (
  <BaseField.Description
    className={cn(
      'text-[0.8125rem] leading-relaxed text-muted-foreground',
      className,
    )}
    {...props}
  />
);

/** A validation message for a field. */
export const FieldError = ({
  className,
  ...props
}: ComponentProps<typeof BaseField.Error>) => (
  <BaseField.Error
    className={cn('text-[0.8125rem] font-medium text-destructive', className)}
    {...props}
  />
);

/** A text input (Base UI Input) that works inside or outside a Field. */
export const Input = ({
  className,
  ...props
}: ComponentProps<typeof BaseInput>) => (
  <BaseInput
    className={cn(
      'h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-base text-foreground shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60 data-invalid:border-destructive/60 data-invalid:ring-destructive/20 sm:text-[0.95rem]',
      className,
    )}
    {...props}
  />
);
