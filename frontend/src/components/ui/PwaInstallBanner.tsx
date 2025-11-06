import { ArrowDownOnSquareStackIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'

export const PwaInstallBanner = () => {
  const { canInstall, requestInstall, dismiss } = usePwaInstallPrompt()

  if (!canInstall) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-brand-primary/30 bg-white/90 px-4 py-3 shadow-brand">
      <div className="flex items-center gap-3 text-sm text-ink-700">
        <ArrowDownOnSquareStackIcon aria-hidden="true" className="h-5 w-5 text-brand-primary" />
        <p className="font-medium">
          Install the Shoehaven POS app for a faster, offline-ready experience.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-brand-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-primary transition hover:bg-brand-primary hover:text-white"
          onClick={requestInstall}
        >
          Install
        </button>
        <button
          type="button"
          className="rounded-full p-1 text-brand-dark transition hover:bg-brand-primary/10"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <XMarkIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
