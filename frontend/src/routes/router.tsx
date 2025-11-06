import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from './LoginPage'
import { PosDashboard } from './PosDashboard'
import { InventoryIndex } from './InventoryIndex'
import { InventoryDetail } from './InventoryDetail'
import { ReceiveShipment } from './ReceiveShipment'
import { ReportsOverview } from './ReportsOverview'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    handle: {
      breadcrumb: 'Login',
    },
  },
  {
    element: <AuthLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/pos" replace /> },
          {
            path: '/pos',
            element: <PosDashboard />,
            handle: { breadcrumb: 'Point of Sale' },
          },
          {
            path: '/inventory',
            element: <InventoryIndex />,
            handle: { breadcrumb: 'Inventory' },
          },
          {
            path: '/inventory/:id',
            element: <InventoryDetail />,
            handle: { breadcrumb: 'Inventory detail' },
          },
          {
            path: '/receive',
            element: <ReceiveShipment />,
            handle: { breadcrumb: 'Receive' },
          },
          {
            path: '/reports',
            element: <ReportsOverview />,
            handle: { breadcrumb: 'Reports' },
          },
        ],
      },
    ],
  },
])
