import { NavLink, Outlet } from 'react-router-dom'
import { PrimaryNav } from '../components/navigation/PrimaryNav'
import { Breadcrumbs } from '../components/navigation/Breadcrumbs'
import { UserMenu } from '../components/navigation/UserMenu'
import { PwaInstallBanner } from '../components/ui/PwaInstallBanner'
import { themeTokens } from '../theme/tokens'
import { classNames } from '../lib/classNames'
import { primaryNavigation } from '../components/navigation/navigationData'

export const AppLayout = () => {
  const { spacing } = themeTokens
  const mobileNavItems = primaryNavigation.filter((item) => item.showOnMobile)

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
        className="relative flex flex-col gap-6 px-4 pb-24 pt-6 sm:px-8 lg:px-12 lg:pb-10"
        style={{ paddingBlockStart: spacing.gutter.cozy }}
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
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-12px_35px_rgba(69,10,10,0.18)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                classNames(
                  'flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary',
                  isActive
                    ? 'text-brand-primary'
                    : 'text-ink-500 hover:text-brand-dark'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    aria-hidden="true"
                    className={classNames(
                      'h-5 w-5 transition-colors',
                      isActive ? 'text-brand-primary' : 'text-ink-400'
                    )}
                  />
                  <span>{item.shortLabel ?? item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
