import { GoogleOAuthProvider } from '@react-oauth/google'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AuthProvider } from '../../system/auth/AuthProvider/AuthProvider'
import { handle as homeHandle } from '../../system/home/HomePage/.ts'
import SiteLayout from '../SiteLayout/SiteLayout'
import Toast from '../Toast/Toast'
import PopupHost from '../PopupHost/PopupHost'
import { queryClient } from '@features/queryClient.ts'
import { authLayer } from '@stores/authStore.ts'
import { socketLayer } from '@stores/socketStore'
import PublicOnlyRoute from '../../system/auth/PublicOnlyRoute/PublicOnlyRoute.tsx'
import OrganizerRoute from '../../system/auth/OrganizerRoute/OrganizerRoute.tsx'
import AuthedRoute from '../../system/auth/AuthedRoute/AuthedRoute.tsx'
import SplashLoader from '../SplashLoader/SplashLoader.tsx'
import { holdSplashUntilAuthSettles } from '@features/authSplash.ts'
import { chunkReloadOnStaleBuild } from '@features/chunkReload.ts'
import { useSplashHold } from '@stores/splashStore.ts'
import { lazyPage, useRouteChunkSplash, useRoutePageMeta, useScrollResetOnNavigate } from './.ts'

authLayer.init()
socketLayer.init()
holdSplashUntilAuthSettles()
chunkReloadOnStaleBuild()

function AppShell() {
  useRouteChunkSplash()
  useScrollResetOnNavigate()
  useRoutePageMeta()
  return <><Outlet /><Toast /><PopupHost /></>
}

function RouteHydrateFallback() {
  useSplashHold(true, { immediate: true, reason: 'route-chunk' })
  return null
}

const router = createBrowserRouter([{ element: <AppShell />, HydrateFallback: RouteHydrateFallback, children: [
  { element: <SiteLayout />, children: [
    { index: true, lazy: lazyPage(() => import('../../system/home/HomePage/HomePage')), handle: homeHandle },
    { path: 'events', lazy: lazyPage(() => import('../../system/events/EventsPage/EventsPage')) },
    { path: 'events/:eventId', lazy: lazyPage(() => import('../../system/eventContent/EventContent/EventContent.tsx')) },

    { element: <AuthedRoute />, children: [
      { path: 'tickets', lazy: lazyPage(() => import('../../system/order/OrdersPage/OrdersPage')) },
      { path: 'tickets/processing', lazy: lazyPage(() => import('../../system/orderProcessing/OrderProcessingPage/OrderProcessingPage')) },
      { path: 'transactions', lazy: lazyPage(() => import('../../system/transactions/TransactionsPage/TransactionsPage')) },
      { path: 'settings', lazy: lazyPage(() => import('../../system/settings/SettingsPage/SettingsPage')) },
      { path: 'scan', lazy: lazyPage(() => import('../../system/inspector/InspectorPage/InspectorPage')) }
    ] },

    { path: 'organizer', element: <OrganizerRoute />, children: [
      { path: 'events/create', lazy: lazyPage(() => import('../../system/createEvent/CreateEvent/CreateEvent.tsx')) },
      { path: 'events/publishing', lazy: lazyPage(() => import('../../system/eventPublishing/EventPublishingPage/EventPublishingPage.tsx')) }
    ] },

    { path: '*', lazy: lazyPage(() => import('../NotFound/NotFound.tsx')) }
  ] },

  { path: 'terms-of-service', lazy: lazyPage(() => import('../../system/legal/TermsOfServicePage/TermsOfServicePage')) },
  { path: 'privacy-policy', lazy: lazyPage(() => import('../../system/legal/PrivacyPolicyPage/PrivacyPolicyPage')) },
  {element: <PublicOnlyRoute/>, children: [
  { path: 'login', lazy: lazyPage(() => import('../../system/auth/LoginPage/LoginPage')) },
  { path: 'forgot-password', lazy: lazyPage(() => import('../../system/auth/ForgotPasswordPage/ForgotPasswordPage')) },
  { path: 'signupOptions', lazy: lazyPage(() => import('../../system/auth/SignUpOptionsPage/SignUpOptionsPage')) },
  { path: 'sign-up', lazy: lazyPage(() => import('../../system/auth/SignUpHandler/SignUpHandler.tsx')) },
  { path: 'complete-account', lazy: lazyPage(() => import('../../system/auth/CompleteAccountPage/CompleteAccountPage')) },
  { path: 'auth-redirect', lazy: lazyPage(() => import('../../system/auth/AuthRedirectPage/AuthRedirectPage')) },
  { path: 'verify-code', lazy: lazyPage(() => import('../../system/auth/VerifyCodePage/VerifyCodePage')) },
  { path: 'new-password', lazy: lazyPage(() => import('../../system/auth/NewPasswordPage/NewPasswordPage')) }
]},
] }])

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  const content =
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RouterProvider router={router} />
      <SplashLoader />
    </AuthProvider>
  </QueryClientProvider>

  return <div className='w-full'>
    {googleClientId
      ? <GoogleOAuthProvider clientId={googleClientId}>{content}</GoogleOAuthProvider>
      : content}
  </div>
}
