import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@features/queryClient'
import { socketLayer } from '@stores/socketStore'
import { themeLayer } from '@stores/themeStore'
import AppLayout from '@components/template/AppLayout/AppLayout'
import SplashScreen from '@components/template/SplashScreen/SplashScreen'
import DocumentLibrary from '@components/system/documents/DocumentLibrary/DocumentLibrary'
import NoteLibrary from '@components/system/notes/NoteLibrary/NoteLibrary'
import ExtractionUpload from '@components/system/extraction/ExtractionUpload/ExtractionUpload'
import InsightChat from '@components/system/insight/InsightChat/InsightChat'
import ClientNotSelected from '@components/system/clients/ClientNotSelected/ClientNotSelected'
import UploadRequestPortal from '@components/system/uploadRequests/UploadRequestPortal/UploadRequestPortal'

socketLayer.init()
themeLayer.init()

const router = createBrowserRouter([
  { path: 'request/:token', element: <UploadRequestPortal /> },
  {
    element: <AppLayout />,
    children: [
      { path: 'clients/:clientId', element: <InsightChat /> },
      { path: 'clients/:clientId/documents', element: <DocumentLibrary /> },
      { path: 'clients/:clientId/notes', element: <NoteLibrary /> },
      { path: 'clients/:clientId/extract', element: <ExtractionUpload /> },
      { path: '*', element: <ClientNotSelected /> },
    ],
  },
])

export default function App() {
  return <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <SplashScreen />
  </QueryClientProvider>
}
