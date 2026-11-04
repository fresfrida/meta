import { useState } from 'react'
import { LANGS, type Lang, SPEECH_LANGS } from '../config'
import { speechFor } from '../lib/phrase'
import { speak } from '../lib/speech'
import { chooseVoice, setVoicePref, voicePref, voiceRows, voiceStatus } from '../lib/voices'
import { languages, strings } from '../strings'
import { Notice } from './Notice'

const t = strings.settings
/** "Test voice" says the plain-language sentence for a close step down. */
const SAMPLE = { hazard: 'step_down', side: 'ahead', distance: 'near', distance_m: 2 } as const

interface SettingsProps {
  lang: Lang
  voices: SpeechSynthesisVoice[]
  onLang: (lang: Lang) => void
  handsFree: boolean
  onHandsFree: (on: boolean) => void
  talkMore: boolean
  onTalkMore: (on: boolean) => void
  onDone: () => void
}

export function Settings({ lang, voices, onLang, handsFree, onHandsFree, talkMore, onTalkMore, onDone }: SettingsProps) {
  const [testFailed, setTestFailed] = useState(false)
  const status = (l: Lang) => voiceStatus(voices, SPEECH_LANGS[l])
  const speechLang = SPEECH_LANGS[lang]
  // The chosen voice per language lives in storage (read on every speech); this state only re-renders the list.
  const [pref, setPref] = useState(() => voicePref(speechLang))
  const [prefLang, setPrefLang] = useState(speechLang)
  if (prefLang !== speechLang) {
    setPrefLang(speechLang)
    setPref(voicePref(speechLang))
  }
  // Built fresh from the current language on every render; rows keyed by a unique voice id (Brief 22).
  const rows = voiceRows(voices, speechLang, pref)
  const selected = chooseVoice(voices, speechLang, pref)

  const testVoice = (voice = selected) => {
    if (status(lang) === 'missing') return setTestFailed(true)
    setTestFailed(false)
    speak(speechFor(SAMPLE, lang) ?? '', { lang: speechLang, voice }).started.catch(() => setTestFailed(true))
  }

  const chooseOne = (id: string, voice: SpeechSynthesisVoice) => {
    setVoicePref(speechLang, id)
    setPref(id)
    testVoice(voice) // hear it straight away
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

      {rows.length > 0 && (
        <>
          <h2 className="label" id="voice-label">
            {t.voice}
          </h2>
          <div className="list" role="radiogroup" aria-labelledby="voice-label" key={speechLang}>
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                role="radio"
                aria-checked={row.selected}
                className="list__item"
                onClick={() => chooseOne(row.key, row.voice)}
              >
                <span className="list__text">
                  <span className="list__title">{row.label}</span>
                  {row.recommended && <span className="list__subtitle">{t.recommended}</span>}
                </span>
                <i className={row.selected ? 'radio radio--on' : 'radio'} aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}

      <button type="button" className="button button--outline" onClick={() => testVoice()}>
        {t.testVoice}
      </button>
      {testFailed && <Notice title={t.noVoice} />}

      <div className="list">
        <button
          type="button"
          role="switch"
          aria-checked={handsFree}
          className="list__item"
          onClick={() => onHandsFree(!handsFree)}
        >
          <span className="list__text">
            <span className="list__title">{t.handsFree}</span>
            <span className="list__subtitle">{t.handsFreeLine}</span>
          </span>
          <i className={handsFree ? 'switch switch--on' : 'switch'} aria-hidden="true" />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={talkMore}
          className="list__item"
          onClick={() => onTalkMore(!talkMore)}
        >
          <span className="list__text">
            <span className="list__title">{t.talkMore}</span>
            <span className="list__subtitle">{t.talkMoreLine}</span>
          </span>
          <i className={talkMore ? 'switch switch--on' : 'switch'} aria-hidden="true" />
        </button>
      </div>

      <h2 className="label">{t.about}</h2>
      <p className="settings__about">{t.aboutText}</p>
    </div>
  )
}
