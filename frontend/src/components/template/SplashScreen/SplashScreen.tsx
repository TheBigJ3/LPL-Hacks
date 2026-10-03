import './.css'
import { createPortal } from 'react-dom'
import { SPLASH_SCREEN_MARK_PATHS, SPLASH_SCREEN_MARK_VIEW_BOX, useSplashScreen } from './.ts'

const SplashScreen = () => {
  const splash = useSplashScreen()

  if (!splash.visible) return null

  return createPortal(
    <div className="splash-screen fixed inset-0 flex items-center justify-center" data-phase={splash.phase} style={splash.style} role="status" aria-label="Loading LPL Financial">
      <span className="splash-screen__logo flex" aria-hidden="true">
        <svg className="splash-screen__mark" viewBox={SPLASH_SCREEN_MARK_VIEW_BOX} fill="currentColor">
          <path className="splash-screen__square" d={SPLASH_SCREEN_MARK_PATHS.square} />
          <path className="splash-screen__inner" d={SPLASH_SCREEN_MARK_PATHS.inner} />
          <path className="splash-screen__outer" d={SPLASH_SCREEN_MARK_PATHS.outer} />
        </svg>
      </span>
    </div>,
    document.body
  )
}

export default SplashScreen
