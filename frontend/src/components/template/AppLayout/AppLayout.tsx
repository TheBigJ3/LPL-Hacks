import { Outlet } from 'react-router'
import Sidebar from '@components/template/Sidebar/Sidebar'
import { APP_LAYOUT_CONTENT_ID, useAppLayout } from './.ts'

const AppLayout = () => {
  const layout = useAppLayout()

  return <div className="flex h-dvh w-full overflow-hidden bg-main-white">
    <Sidebar />
    <div id={APP_LAYOUT_CONTENT_ID} className="relative flex min-w-0 flex-1 flex-col">
      <main ref={layout.mainRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  </div>
}

export default AppLayout
