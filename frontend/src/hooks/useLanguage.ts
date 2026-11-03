// The chosen speech language (remembered in localStorage) and the browser's installed voices.
import { useCallback, useEffect, useState } from 'react'
import { HANDS_FREE_DEFAULT, HANDS_FREE_STORAGE_KEY, LANGS, LANG_STORAGE_KEY, type Lang } from '../config'
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

function readHandsFree(): boolean {
  try {
    const saved = window.localStorage.getItem(HANDS_FREE_STORAGE_KEY)
    return saved === null ? HANDS_FREE_DEFAULT : saved === '1'
  } catch {
    return HANDS_FREE_DEFAULT
  }
}

/** Hands-free "Hey Eyes" listening on/off (Settings), remembered in localStorage. */
export function useHandsFree(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState<boolean>(readHandsFree)
  const setOn = useCallback((next: boolean) => {
    setOnState(next)
    try {
      window.localStorage.setItem(HANDS_FREE_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // not remembered; applies for this visit
    }
  }, [])
  return [on, setOn]
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
