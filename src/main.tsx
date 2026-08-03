import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.tsx'
import Widget from './Widget.tsx'
import QuickCapture from './QuickCapture.tsx'
import { initStore } from './lib/store.ts'
import { isTauri } from './lib/persistence.ts'
import { IS_PHONE } from './lib/platform.ts'

// Every window loads the same bundle; the query string picks the view. The
// phone has one window and no query string, so it always lands on the app.
const view = IS_PHONE ? null : new URLSearchParams(window.location.search).get('view')

if (!isTauri()) document.documentElement.classList.add('in-browser')
if (IS_PHONE) document.documentElement.classList.add('phone')

void initStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user" honours the Windows "show animations" setting. */}
    <MotionConfig reducedMotion="user">
      {/* One icon weight and size for the whole app, set in a single place. */}
      <IconContext.Provider value={{ size: 16, weight: 'regular' }}>
        {view === 'widget' ? <Widget /> : view === 'quick' ? <QuickCapture /> : <App />}
      </IconContext.Provider>
    </MotionConfig>
  </StrictMode>,
)
