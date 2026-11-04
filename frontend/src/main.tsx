import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { MicTest } from './components/MicTest'
import { MIC_TEST } from './config'

// ?mictest=1 renders only the mic test, so the main app (and its backend calls) never starts.
createRoot(document.getElementById('root')!).render(<StrictMode>{MIC_TEST ? <MicTest /> : <App />}</StrictMode>)
