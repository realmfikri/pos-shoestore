import type { ComponentProps } from 'react'
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  InboxArrowDownIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

export type PrimaryNavigationItem = {
  name: string
  shortLabel?: string
  to: string
  icon: (props: ComponentProps<'svg'>) => JSX.Element
  showOnMobile?: boolean
}

export const primaryNavigation: PrimaryNavigationItem[] = [
  {
    name: 'Point of Sale',
    shortLabel: 'POS',
    to: '/pos',
    icon: RectangleStackIcon,
    showOnMobile: true,
  },
  {
    name: 'Inventory',
    to: '/inventory',
    icon: CubeIcon,
    showOnMobile: true,
  },
  {
    name: 'Purchase Orders',
    shortLabel: 'POs',
    to: '/purchase-orders',
    icon: ClipboardDocumentListIcon,
    showOnMobile: true,
  },
  { name: 'Receive', to: '/receive', icon: InboxArrowDownIcon },
  { name: 'Suppliers', to: '/suppliers', icon: UserGroupIcon },
  {
    name: 'Reports',
    to: '/reports',
    icon: ChartBarIcon,
    showOnMobile: true,
  },
]
