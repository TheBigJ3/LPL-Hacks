import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'
import { themeLayer } from '@stores/themeStore'
import AppLayout from '@components/template/AppLayout/AppLayout'
import DocumentLibrary from '@components/system/documents/DocumentLibrary/DocumentLibrary'
import NoteLibrary from '@components/system/notes/NoteLibrary/NoteLibrary'
import ExtractionUpload from '@components/system/extraction/ExtractionUpload/ExtractionUpload'

socketLayer.init()
themeLayer.init()

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: 'documents', element: <DocumentLibrary /> },
      { path: 'clients/:clientId/documents', element: <DocumentLibrary /> },
      { path: 'notes', element: <NoteLibrary /> },
      { path: 'clients/:clientId/notes', element: <NoteLibrary /> },
      { path: 'extract', element: <ExtractionUpload /> },
      { path: 'clients/:clientId/extract', element: <ExtractionUpload /> },
      { path: '*', element: <div /> },
    ],
  },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
}
