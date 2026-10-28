import { ChevronDown } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react'
import { cx } from '../../lib/format'

export function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink">
      <span>{children}</span>
      {hint && <span className="text-[12px] font-normal text-faint">{hint}</span>}
    </label>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  leading?: ReactNode
  invalid?: boolean
  ref?: Ref<HTMLSelectElement>
}

export function Select({ leading, invalid, className, children, ref, ...rest }: SelectProps) {
  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted" aria-hidden>
          {leading}
        </span>
      )}
      <select
        ref={ref}
        {...rest}
        aria-invalid={invalid || undefined}
        className={cx(
          'h-11 w-full appearance-none rounded-field border bg-surface pr-10 text-sm text-ink transition-colors',
          leading ? 'pl-10' : 'pl-3.5',
          invalid ? 'border-danger/60 bg-danger-soft/40' : 'border-line hover:border-line-strong focus:border-leaf',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-faint',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </div>
  )
}

export function TextInput({
  className,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(
        'h-11 w-full rounded-field border bg-surface px-3.5 text-sm text-ink placeholder:text-faint transition-colors',
        invalid ? 'border-danger/60 bg-danger-soft/40' : 'border-line hover:border-line-strong focus:border-leaf',
        'disabled:cursor-not-allowed disabled:bg-canvas',
        className,
      )}
    />
  )
}
