import { Outlet } from 'react-router-dom'
import { PrimaryNav } from '../components/navigation/PrimaryNav'
import { Breadcrumbs } from '../components/navigation/Breadcrumbs'
import { UserMenu } from '../components/navigation/UserMenu'
import { PwaInstallBanner } from '../components/ui/PwaInstallBanner'
import { themeTokens } from '../theme/tokens'

export const AppLayout = () => {
  const { spacing } = themeTokens

  return (
    <div className="grid min-h-screen bg-brand-surface/90 text-ink-800 lg:grid-cols-[18rem_1fr]">
      <aside
        className="hidden border-r border-white/40 bg-gradient-to-b from-brand-dark/95 via-brand-primary to-brand-primary/90 text-brand-surface lg:flex lg:flex-col lg:gap-8"
        style={{ padding: spacing.gutter.roomy }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-accent">Shoehaven</p>
          <h1 className="text-3xl font-display font-bold text-white">Retail POS</h1>
        </div>
        <div className="flex-1 overflow-y-auto pr-2">
          <PrimaryNav />
        </div>
        <p className="text-xs text-white/70">
          Crafted for modern footwear retailers. Generous spacing keeps every workflow breathable.
        </p>
      </aside>
      <main
        className="relative flex flex-col gap-6 px-4 pb-10 pt-6 sm:px-8 lg:px-12"
        style={{ paddingBlock: spacing.gutter.cozy }}
      >
        <header className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/90 px-4 py-3 shadow-brand backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2">
            <Breadcrumbs />
            <h2 className="text-2xl font-display font-semibold text-brand-dark">Welcome back</h2>
            <p className="text-sm text-ink-500">
              Manage sales, stock, and deliveries seamlessly across Shoehaven locations.
            </p>
          </div>
          <UserMenu />
        </header>
        <PwaInstallBanner />
        <section className="flex-1">
          <div className="card h-full">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  )
}
