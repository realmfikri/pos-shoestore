interface SpinnerProps {
  label?: string
  className?: string
}

export const Spinner = ({ label, className }: SpinnerProps) => (
  <div className={`flex flex-col items-center gap-2 text-brand-dark ${className ?? ''}`} role="status">
    <svg
      className="h-10 w-10 animate-spin text-brand-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    {label ? <span className="text-sm font-medium text-ink-600">{label}</span> : null}
  </div>
)
