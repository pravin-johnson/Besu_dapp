import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FaucetApp from './FaucetApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FaucetApp />
  </StrictMode>,
)
