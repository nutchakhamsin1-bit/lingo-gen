import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/format'

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  loadingText?: string
  leading?: ReactNode
  trailing?: ReactNode
  block?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-lime text-ink border border-lime-deep/60 hover:bg-lime-deep active:bg-lime-deep shadow-[0_1px_0_rgba(32,62,50,0.06)] disabled:bg-mint disabled:text-faint disabled:border-line',
  dark: 'bg-ink text-white border border-ink hover:bg-ink-soft active:bg-ink disabled:bg-faint disabled:border-faint',
  outline:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-mint-soft active:bg-mint disabled:text-faint disabled:hover:bg-surface',
  subtle: 'bg-mint-soft text-ink-soft border border-transparent hover:bg-mint active:bg-lime/60 disabled:text-faint',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-mint-soft hover:text-ink active:bg-mint disabled:text-faint disabled:hover:bg-transparent',
  danger:
    'bg-surface text-danger border border-line hover:bg-danger-soft hover:border-danger/30 active:bg-danger-soft disabled:text-faint',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-[10px]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-[12px]',
  icon: 'h-9 w-9 p-0 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading, loadingText, leading, trailing, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-150',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : leading}
      {loading && loadingText ? <span>{loadingText}</span> : children}
      {!loading && trailing}
    </button>
  )
})
