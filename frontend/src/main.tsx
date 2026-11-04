import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { MicTest } from './components/MicTest'
import { VoiceTest } from './components/VoiceTest'
import { MIC_TEST, VOICE_TEST } from './config'

// ?mictest=1 / ?voices=1 render only that page, so the main app (and its backend calls) never starts.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{MIC_TEST ? <MicTest /> : VOICE_TEST ? <VoiceTest /> : <App />}</StrictMode>,
)
