import './.css'

type ToggleSwitchProps = {
  on: boolean
  onChange: (next: boolean) => void
  label?: string
  className?: string
}

export default function ToggleSwitch({ on, onChange, label, className = '' }: ToggleSwitchProps) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={on}
      aria-label={label}
      data-on={on}
      onClick={() => onChange(!on)}
      className={`toggle-switch ${className}`}
    >
      <span className='toggle-switch__knob' />
    </button>
  )
}
