import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './chat-preview-v4.css'
import { installTextInputFocusGuard } from './lib/textInputFocusGuard'

installTextInputFocusGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
