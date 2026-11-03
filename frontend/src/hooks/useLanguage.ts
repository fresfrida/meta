// The chosen speech language (remembered in localStorage) and the browser's installed voices.
import { useCallback, useEffect, useState } from 'react'
import { LANGS, LANG_STORAGE_KEY, type Lang } from '../config'
import { speechSupported } from '../lib/speech'

function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY)
    return LANGS.find((l) => l === saved) ?? LANGS[0]
  } catch {
    return LANGS[0] // storage blocked (private mode): fall back silently
  }
}

export function useLanguage(): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // not remembered; the choice still applies for this visit
    }
  }, [])
  return [lang, setLang]
}

/** Installed voices. Browsers load them lazily, so the list can start empty and fill in on `voiceschanged`. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    speechSupported() ? window.speechSynthesis.getVoices() : [],
  )
  useEffect(() => {
    if (!speechSupported()) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', update)
    // The list may have loaded between the first render and now, with the event already fired.
    const loaded = setTimeout(update, 0)
    return () => {
      clearTimeout(loaded)
      window.speechSynthesis.removeEventListener('voiceschanged', update)
    }
  }, [])
  return voices
}
