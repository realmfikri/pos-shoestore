import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import { classNames } from '../../lib/classNames'
import { primaryNavigation } from './navigationData'

export const PrimaryNav = () => {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {primaryNavigation.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            classNames(
              'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150',
              'hover:bg-white/60 hover:text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary',
              isActive
                ? 'bg-white/80 text-brand-primary shadow-sm ring-1 ring-brand-primary/40'
                : 'text-ink-500'
            )
          }
        >
          {({ isActive }) => (
            <Fragment>
              <item.icon
                aria-hidden="true"
                className={classNames(
                  'h-5 w-5 transition-colors',
                  isActive ? 'text-brand-primary' : 'text-ink-400 group-hover:text-brand-secondary'
                )}
              />
              <span>{item.name}</span>
            </Fragment>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
