// ?voices=1 (Brief 24): every speechSynthesis voice the browser reports, as plain text, for a screenshot.
// No network calls; nothing is stored. Also shows how lib/voices.ts reads each voice (language / region).
import { useVoices } from '../hooks/useLanguage'
import { voiceInfo } from '../lib/voices'
import { strings } from '../strings'

const t = strings.voiceTest

export function VoiceTest() {
  const voices = useVoices()
  return (
    <div className="mictest">
      <div className="home__top">
        <h1 className="home__title">{t.title}</h1>
        <p className="mictest__line">{voices.length ? t.count(voices.length) : t.none}</p>
      </div>
      <ol className="mictest__panel voicetest">
        {voices.map((v, i) => {
          const info = voiceInfo(v)
          return (
            <li key={i} className="mictest__line">
              <strong>{v.name}</strong>
              <br />
              {t.fields(v)}
              <br />
              {t.seenAs(info.lang, info.region)}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
