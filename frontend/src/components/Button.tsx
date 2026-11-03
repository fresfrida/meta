interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export function Button({ label, onClick, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <button type="button" className={`button button--${variant}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}
