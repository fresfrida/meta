import { useState } from 'react'
import { LANGS, type Lang, SPEECH_LANGS } from '../config'
import { phraseFor } from '../lib/phrase'
import { speak } from '../lib/speech'
import { pickVoice, voiceStatus } from '../lib/voices'
import { languages, strings } from '../strings'
import { Notice } from './Notice'

const t = strings.settings
/** "Test voice" says what a close step down would sound like. */
const SAMPLE = { hazard: 'step_down', side: 'ahead', distance: 'near', distance_m: 2 } as const

interface SettingsProps {
  lang: Lang
  voices: SpeechSynthesisVoice[]
  onLang: (lang: Lang) => void
  onDone: () => void
}

export function Settings({ lang, voices, onLang, onDone }: SettingsProps) {
  const [testFailed, setTestFailed] = useState(false)
  const status = (l: Lang) => voiceStatus(voices, SPEECH_LANGS[l])

  const testVoice = () => {
    const speechLang = SPEECH_LANGS[lang]
    if (status(lang) === 'missing') return setTestFailed(true)
    setTestFailed(false)
    speak(phraseFor(SAMPLE, lang), { lang: speechLang, voice: pickVoice(voices, speechLang) }).started.catch(() =>
      setTestFailed(true),
    )
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="settings__title">{t.title}</h1>
        <button type="button" className="text-button" onClick={onDone}>
          {t.done}
        </button>
      </header>

      <h2 className="label" id="language-label">
        {t.language}
      </h2>
      <div className="list" role="radiogroup" aria-labelledby="language-label">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === lang}
            className="list__item"
            onClick={() => {
              setTestFailed(false)
              onLang(l)
            }}
          >
            <span className="list__text">
              <span className="list__title" lang={l}>
                {languages[l].name}
              </span>
              <span className="list__subtitle">{t.voiceLine(languages[l].english, status(l))}</span>
            </span>
            <i className={l === lang ? 'radio radio--on' : 'radio'} aria-hidden="true" />
          </button>
        ))}
      </div>

      <button type="button" className="button button--outline" onClick={testVoice}>
        {t.testVoice}
      </button>
      {testFailed && <Notice title={t.noVoice} />}

      <h2 className="label">{t.about}</h2>
      <p className="settings__about">{t.aboutText}</p>
    </div>
  )
}
