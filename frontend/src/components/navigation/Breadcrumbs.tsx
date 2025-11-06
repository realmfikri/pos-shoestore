import { Link, useMatches } from 'react-router-dom'
import { Fragment } from 'react'
import { ChevronRightIcon, HomeModernIcon } from '@heroicons/react/24/outline'
import { classNames } from '../../lib/classNames'

interface BreadcrumbHandle {
  breadcrumb?: string
}

export const Breadcrumbs = () => {
  const matches = useMatches()
  const crumbs = matches
    .filter((match) => Boolean((match.handle as BreadcrumbHandle | undefined)?.breadcrumb))
    .map((match) => ({
      label: (match.handle as BreadcrumbHandle).breadcrumb!,
      href: match.pathname,
    }))

  if (crumbs.length === 0) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-ink-500">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-1 text-ink-500 shadow-sm transition hover:text-brand-primary"
      >
        <HomeModernIcon aria-hidden="true" className="h-4 w-4" />
        Home
      </Link>
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.href}>
          <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5 text-ink-300" />
          <Link
            to={crumb.href}
            className={classNames(
              'rounded-full px-2.5 py-1 transition',
              index === crumbs.length - 1
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'hover:bg-white/60 hover:text-brand-dark'
            )}
          >
            {crumb.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  )
}
