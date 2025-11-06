import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from './LoginPage'
import { PosDashboard } from './PosDashboard'
import { InventoryIndex } from './InventoryIndex'
import { InventoryDetail } from './InventoryDetail'
import { InventoryQuickAdd } from './InventoryQuickAdd'
import { ReceiveShipment } from './ReceiveShipment'
import { ReportsOverview } from './ReportsOverview'
import { PurchaseOrdersList } from './PurchaseOrdersList'
import { PurchaseOrderCreate } from './PurchaseOrderCreate'
import { PurchaseOrderDetail } from './PurchaseOrderDetail'
import { SuppliersIndex } from './SuppliersIndex'
import { SupplierDetail } from './SupplierDetail'

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
            path: '/inventory/quick-add',
            element: <InventoryQuickAdd />,
            handle: { breadcrumb: 'Quick add' },
          },
          {
            path: '/inventory/:id',
            element: <InventoryDetail />,
            handle: { breadcrumb: 'Inventory detail' },
          },
          {
            path: '/purchase-orders',
            element: <PurchaseOrdersList />,
            handle: { breadcrumb: 'Purchase orders' },
          },
          {
            path: '/purchase-orders/new',
            element: <PurchaseOrderCreate />,
            handle: { breadcrumb: 'New purchase order' },
          },
          {
            path: '/purchase-orders/:id',
            element: <PurchaseOrderDetail />,
            handle: { breadcrumb: 'Purchase order detail' },
          },
          {
            path: '/receive',
            element: <ReceiveShipment />,
            handle: { breadcrumb: 'Receive' },
          },
          {
            path: '/suppliers',
            element: <SuppliersIndex />,
            handle: { breadcrumb: 'Suppliers' },
          },
          {
            path: '/suppliers/:id',
            element: <SupplierDetail />,
            handle: { breadcrumb: 'Supplier detail' },
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
