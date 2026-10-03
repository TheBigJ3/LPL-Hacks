import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'
import ExtractionUpload from '@components/system/extraction/ExtractionUpload/ExtractionUpload'

socketLayer.init()

const router = createBrowserRouter([
  { path: '/', element: <ExtractionUpload /> },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
}
