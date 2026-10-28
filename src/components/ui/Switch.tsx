import { cx } from '../../lib/format'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id: string
}

export function Switch({ checked, onChange, label, description, disabled, id }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className={cx('min-w-0 cursor-pointer', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-200',
          checked ? 'bg-leaf' : 'bg-line-strong',
          disabled && 'opacity-60',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'block size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}
