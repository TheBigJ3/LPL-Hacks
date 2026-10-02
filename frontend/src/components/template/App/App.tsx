import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'

socketLayer.init()

const router = createBrowserRouter([
  { path: '/', element: <div /> },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
}
