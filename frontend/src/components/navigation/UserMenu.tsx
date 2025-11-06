import { Menu, Transition } from '@headlessui/react'
import { ArrowRightStartOnRectangleIcon, ChevronDownIcon, UserCircleIcon } from '@heroicons/react/24/solid'
import { Fragment } from 'react'
import { useAuth } from '../../modules/auth/AuthProvider'
import { classNames } from '../../lib/classNames'

export const UserMenu = () => {
  const { user, logout } = useAuth()

  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-brand-dark shadow-sm ring-1 ring-brand-primary/20 transition hover:bg-white">
        <UserCircleIcon aria-hidden="true" className="h-6 w-6 text-brand-primary" />
        <span className="hidden sm:block">{user?.name ?? 'Team Member'}</span>
        <ChevronDownIcon aria-hidden="true" className="h-4 w-4 text-ink-400" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-2xl bg-white p-2 text-sm shadow-brand ring-1 ring-ink-100 focus:outline-none">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-400">
            Signed in as
            <p className="truncate text-sm font-semibold text-brand-primary">{user?.email ?? 'user@shoestore.com'}</p>
          </div>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={logout}
                className={classNames(
                  'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-ink-600 transition',
                  active ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-brand-primary/10'
                )}
              >
                <ArrowRightStartOnRectangleIcon aria-hidden="true" className="h-4 w-4" />
                Sign out
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
