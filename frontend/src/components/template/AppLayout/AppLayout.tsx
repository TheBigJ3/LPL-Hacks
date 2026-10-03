import { Outlet } from 'react-router'
import Sidebar from '@components/template/Sidebar/Sidebar'

const AppLayout = () =>
  <div className="flex h-dvh w-full overflow-hidden bg-main-white">
    <Sidebar />
    <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
      <Outlet />
    </main>
  </div>

export default AppLayout
