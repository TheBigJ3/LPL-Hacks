import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'
import { themeLayer } from '@stores/themeStore'
import AppLayout from '@components/template/AppLayout/AppLayout'
import DocumentLibrary from '@components/system/documents/DocumentLibrary/DocumentLibrary'

socketLayer.init()
themeLayer.init()

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: 'documents', element: <DocumentLibrary /> },
      { path: 'clients/:clientId/documents', element: <DocumentLibrary /> },
      { path: '*', element: <div /> },
    ],
  },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
}
