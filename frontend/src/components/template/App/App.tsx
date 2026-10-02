import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'
import { themeLayer } from '@stores/themeStore'
import AppLayout from '@components/template/AppLayout/AppLayout'

socketLayer.init()
themeLayer.init()

const router = createBrowserRouter([
  { element: <AppLayout />, children: [{ path: '*', element: <div /> }] },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
}
