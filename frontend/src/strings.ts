// Every piece of user-facing text lives here.
import type { ShownHazard, Side } from './api/types'
import type { Lang } from './config'
import type { WarningHazard } from './lib/phrase'

/**
 * Hazard phrases, one table per language (no cross-language concatenation). Each language has:
 * - screen: the short phrase shown on screen (Owner approved 3 Nov, "translation ok"), also the box tag words;
 * - voice: the plain-language sentence that is spoken (Owner approved 3 Nov, Brief 5b, "yes to all").
 * EN is approved; ZH / MS / TA are approved pending a native-speaker check.
 */
export interface PhraseLanguage {
  /** Screen hazard words. `unsure` is shown on screen only, never spoken. `steps` is the fast warning (SAM). */
  hazard: Record<ShownHazard, string>
  /** Screen, with metres: N = distance_m. */
  metres: (hazard: string, metres: number, side: Side | null) => string
  /** Screen, without metres: near/far fallback. */
  plain: (hazard: string, side: Side | null, near: boolean) => string
  /** What is spoken. */
  voice: {
    /** Voice hazard words (Tamil: word + verb). */
    hazard: Record<WarningHazard, string>
    clear: string
    /** With metres: N = distance_m. */
    metres: (what: string, metres: number, side: Side | null) => string
    /** Without metres: near / far (unknown distance counts as far). */
    plain: (what: string, side: Side | null, near: boolean) => string
  }
}

const pick = (side: Side | null, left: string, right: string, ahead = '') =>
  side === 'left' ? left : side === 'right' ? right : ahead

export const phrases: Record<Lang, PhraseLanguage> = {
  en: {
    hazard: {
      step_down: 'Step down',
      step_up: 'Step up',
      curb: 'Curb',
      obstacle: 'Obstacle',
      clear: 'Clear',
      unsure: 'Not sure',
      steps: 'Steps', // TENTATIVE (Brief 11): fast warning, direction unknown
    },
    metres: (h, n, side) => `${h}, ${n} ${n === 1 ? 'metre' : 'metres'}${pick(side, ', left', ', right')}`,
    plain: (h, side, near) => `${h} ahead${pick(side, ', left', ', right')}${near ? ', close' : ''}`,
    voice: {
      hazard: {
        step_down: 'Steps going down',
        step_up: 'Steps going up',
        curb: 'A kerb',
        obstacle: 'Something in the way',
        steps: 'Steps', // TENTATIVE (Brief 11)
      },
      clear: 'The path looks clear.',
      metres: (w, n, side) =>
        `${w}, about ${n} ${n === 1 ? 'metre' : 'metres'} ahead${pick(side, ', on your left', ', on your right')}.`,
      plain: (w, side, near) => `${w} ${near ? 'just ahead' : 'ahead'}${pick(side, ', on your left', ', on your right')}.`,
    },
  },
  zh: {
    hazard: {
      step_down: '下台阶',
      step_up: '上台阶',
      curb: '路缘',
      obstacle: '障碍物',
      clear: '畅通',
      unsure: '不确定',
      steps: '台阶', // TENTATIVE (Brief 11)
    },
    metres: (h, n, side) => `${pick(side, '左前方', '右前方', '前方')}${n}米，${h}`,
    plain: (h, side, near) => `${pick(side, '左前方', '右前方', '前方')}${h}${near ? '，很近' : ''}`,
    voice: {
      hazard: {
        step_down: '往下的台阶',
        step_up: '往上的台阶',
        curb: '路缘石',
        obstacle: '东西挡路',
        steps: '台阶', // TENTATIVE (Brief 11)
      },
      clear: '前面的路看起来没有障碍。',
      metres: (w, n, side) => `${pick(side, '左前方', '右前方', '前面')}大约${n}米，有${w}。`,
      plain: (w, side, near) => `${pick(side, '左前方', '右前方', '前面')}${near ? '很近的地方有' : '有'}${w}。`,
    },
  },
  ms: {
    hazard: {
      step_down: 'Tangga turun',
      step_up: 'Tangga naik',
      curb: 'Bebendul jalan',
      obstacle: 'Halangan',
      clear: 'Tiada halangan',
      unsure: 'Tidak pasti',
      steps: 'Tangga', // TENTATIVE (Brief 11)
    },
    metres: (h, n, side) => `${h}, ${n} meter${pick(side, ', sebelah kiri', ', sebelah kanan')}`,
    plain: (h, side, near) => `${h} di hadapan${pick(side, ', sebelah kiri', ', sebelah kanan')}${near ? ', dekat' : ''}`,
    voice: {
      hazard: {
        step_down: 'tangga turun',
        step_up: 'tangga naik',
        curb: 'bebendul jalan',
        obstacle: 'sesuatu yang menghalang',
        steps: 'tangga', // TENTATIVE (Brief 11)
      },
      clear: 'Laluan di hadapan nampak lapang.',
      metres: (w, n, side) =>
        `Ada ${w} kira-kira ${n} meter di hadapan${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
      plain: (w, side, near) =>
        `Ada ${w} ${near ? 'dekat di hadapan' : 'di hadapan'}${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
    },
  },
  ta: {
    hazard: {
      step_down: 'இறங்கு படி',
      step_up: 'ஏறு படி',
      curb: 'நடைபாதை விளிம்பு',
      obstacle: 'தடை',
      clear: 'தடை இல்லை',
      unsure: 'உறுதியில்லை',
      steps: 'படிகள்', // TENTATIVE (Brief 11)
    },
    metres: (h, n, side) => `${h}, ${n} மீட்டர்${pick(side, ', இடது பக்கம்', ', வலது பக்கம்')}`,
    plain: (h, side, near) => `முன்னால் ${h}${pick(side, ', இடது பக்கம்', ', வலது பக்கம்')}${near ? ', அருகில்' : ''}`,
    voice: {
      hazard: {
        step_down: 'கீழே இறங்கும் படிகள் உள்ளன',
        step_up: 'மேலே ஏறும் படிகள் உள்ளன',
        curb: 'நடைபாதை ஓரம் உள்ளது',
        obstacle: 'வழியில் ஏதோ ஒன்று உள்ளது',
        steps: 'படிகள் உள்ளன', // TENTATIVE (Brief 11)
      },
      clear: 'முன்னால் உள்ள பாதை தெளிவாகத் தெரிகிறது.',
      metres: (w, n, side) =>
        `சுமார் ${n} மீட்டர் முன்னால்${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${w}.`,
      plain: (w, side, near) =>
        `${near ? 'மிக அருகில் முன்னால்' : 'முன்னால்'}${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${w}.`,
    },
  },
}

/**
 * Asking a question, per language (shown on the card; `sorry` is also spoken in that language).
 * Owner approved 4 Nov 2026 (Brief 8), verbatim. EN is final; ZH / MS / TA are final pending a native-speaker check.
 * Example question (tests, demo): EN "Hey Eyes, what is there?" · ZH "Hey Eyes，前面有什么？" ·
 * MS "Hey Eyes, apa yang ada di hadapan?" · TA "Hey Eyes, முன்னால் என்ன இருக்கிறது?"
 */
export interface AskText {
  listening: string
  thinking: string
  youAsked: (question: string) => string
  sorry: string
}

export const askText: Record<Lang, AskText> = {
  en: {
    listening: 'Listening for your question…',
    thinking: 'Looking…',
    youAsked: (q) => `You asked: ${q}`,
    sorry: 'Sorry, I could not answer.',
  },
  zh: {
    listening: '请说出您的问题…',
    thinking: '正在查看…',
    youAsked: (q) => `您问：${q}`,
    sorry: '抱歉，我无法回答。',
  },
  ms: {
    listening: 'Sila tanya soalan anda…',
    thinking: 'Sedang melihat…',
    youAsked: (q) => `Anda bertanya: ${q}`,
    sorry: 'Maaf, saya tidak dapat menjawab.',
  },
  ta: {
    listening: 'உங்கள் கேள்வியைக் கேளுங்கள்…',
    thinking: 'பார்க்கிறேன்…',
    youAsked: (q) => `நீங்கள் கேட்டது: ${q}`,
    sorry: 'மன்னிக்கவும், என்னால் பதில் சொல்ல முடியவில்லை.',
  },
}

/** How each language is listed: its own name, and an English subtitle (null for English itself). */
export const languages: Record<Lang, { name: string; english: string | null }> = {
  en: { name: 'English', english: null },
  zh: { name: '中文', english: 'Chinese (Mandarin)' },
  ms: { name: 'Bahasa Melayu', english: 'Malay' },
  ta: { name: 'தமிழ்', english: 'Tamil' },
}

export type VoiceStatus = 'installed' | 'missing' | 'unknown'

export const strings = {
  appName: 'Second Eyes',

  chip: {
    beta: 'Beta', // camera screen
    betaLong: 'Beta · research prototype', // Home
    // TENTATIVE (Brief 7): face blur status, shown next to the mode chip
    faceBlur: { on: 'Faces blurred', off: 'Face blur off', loading: 'Face blur starting…' },
  },

  mode: {
    mock: 'Mock · not a real model answer', // TENTATIVE (Brief 5 separator)
    live: 'Live · Meta Model API',
    checking: 'Checking backend…',
  },

  // TENTATIVE (Brief 5): Home and Settings copy, from the approved mock v2
  home: {
    title: 'Second Eyes',
    help: 'Point the camera at the path ahead. It speaks only when something changes.',
    voice: 'Voice',
    settings: 'Settings',
  },
  settings: {
    title: 'Settings',
    done: 'Done',
    language: 'Language',
    testVoice: 'Test voice',
    about: 'About',
    aboutText: 'Beta · research prototype. Not a mobility aid.',
    voiceLine: (english: string | null, status: VoiceStatus) => {
      const voice = { installed: 'voice installed', missing: 'voice missing', unknown: 'voice not checked yet' }[status]
      return english ? `${english} · ${voice}` : voice.charAt(0).toUpperCase() + voice.slice(1)
    },
    noVoice: 'No voice for this language on this device.',
    // TENTATIVE (Brief 6)
    handsFree: 'Hands-free listening',
    handsFreeLine: 'While running, microphone audio is sent to Meta to hear your questions.',
  },

  // TENTATIVE (Brief 6), English in every language for now: the rest of asking. The card texts are in `askText`.
  ask: {
    micChip: 'Listening',
    stopped: { title: 'Listening stopped', body: 'Touch and hold the screen to ask instead.' },
    micFailed: { title: 'Microphone not available', body: 'Touch and hold will not work either.' },
    timing: (totalS: string, asrS: string, modelS: string) =>
      `ask: question to answer ${totalS} s (speech recognition ${asrS} s, model ${modelS} s)`,
  },

  button: {
    start: 'Start',
    stop: 'Stop',
    capture: 'Capture',
    tryAgain: 'Try again',
  },

  state: {
    cameraStarting: {
      title: 'Opening camera…',
      body: 'Allow camera access if asked.',
    },
    permissionDenied: {
      title: 'Camera permission denied',
      body: 'Allow camera access for this site in your browser settings, then tap Try again.',
    },
    cameraUnavailable: {
      title: 'Camera not available',
      body: 'No usable camera was found, or another app is using it.',
    },
    insecure: {
      title: 'Camera needs HTTPS',
      body: 'Open this page with an https:// address.',
    },
    ready: 'Tap Capture',
    watching: 'Watching…', // TENTATIVE (Brief 3): loop mode before the first answer
    waiting: 'Waiting for answer…',
    notSureHint: 'Hold the phone steady', // TENTATIVE (Brief 5, mock v2); English only
    // TENTATIVE (Brief 5): shown when the chosen language has no installed voice
    noVoice: (language: string) => `No ${language} voice on this device. Shown only, not spoken.`,
    // TENTATIVE (Brief 2): live-mode copy below until the Owner approves it.
    modelSlow: {
      title: 'Model is slow…',
      body: 'Still waiting for the answer.',
    },
    modelFailed: {
      title: 'Model failed',
      body: 'No answer from the model. Tap Capture to try again.',
    },
    budgetReached: {
      title: 'Budget reached',
      body: (spentUsd: number, budgetUsd: number) =>
        `Live calls stopped: $${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)} spent.`,
      bodyUnknown: 'Live calls stopped at the spending cap.',
    },
    keyMissing: {
      title: 'No API key',
      body: 'Live mode needs MODEL_API_KEY in backend/.env.',
    },
    backendUnreachable: {
      title: 'Backend unreachable',
      body: 'Is the FastAPI server running on the Mac? Your next tap retries.',
    },
    answerFailed: {
      title: 'Answer failed',
      body: 'Tap Capture to try again.',
    },
    speechFailed: 'Speech did not start. Check the volume and silent switch.',
  },

  timing: {
    heading: 'Capture to speech',
    last: 'Last',
    min: 'min',
    median: 'median',
    max: 'max',
    ms: 'ms',
    none: 'No captures yet',
    breakdown: (frameMs: number, roundTripMs: number, modelMs: number, speechMs: number) =>
      `frame ${frameMs} · round trip ${roundTripMs} (model ${modelMs}) · speech ${speechMs}`,
    // TENTATIVE (Brief 3)
    counts: (spoken: number, silent: number) => `spoken ${spoken} · silent ${silent}`,
    silentRoundTrip: (min: number, median: number, max: number) => `silent round trip ${min} / ${median} / ${max}`,
    // TENTATIVE (Brief 5): loop-mode pill (capture to answer, seconds) and dropped late answers
    pill: (lastS: string, medianS: string) => `Last ${lastS} s · median ${medianS} s`,
    pillNone: 'No answers yet',
    // TENTATIVE (Brief 11): two channels, median capture to answer
    pillTwo: (fastS: string | null, detailS: string | null) =>
      `fast ${fastS === null ? '–' : `${fastS} s`} · detail ${detailS === null ? '–' : `${detailS} s`}`,
    channels: (samMs: string, modelMs: string) => `last SAM ${samMs} ms · last model ${modelMs} ms`,
    dropped: (n: number) => `dropped late ${n}`,
    // TENTATIVE (Brief 7): the last frame actually sent
    sentFrame: 'Last frame sent',
    sentFrameLine: (blur: 'on' | 'off', faces: number, ms: number) =>
      blur === 'on' ? `faces blurred ${faces} · ${ms} ms` : `face blur off · sent unblurred`,
    // TENTATIVE (Brief 2)
    usage: (inputTokens: number, outputTokens: number, costUsd: number) =>
      `tokens in ${inputTokens} · out ${outputTokens} · $${costUsd.toFixed(4)}`,
  },

  // TENTATIVE (Brief 5): mic test page (?mictest=1), English only
  micTest: {
    title: 'Mic test',
    help: 'Speech plays every 3 s. Turn the mic off and on and listen: does speech get quieter, or move to the earpiece? Try the speaker and Bluetooth.',
    start: 'Start',
    stop: 'Stop',
    micOn: 'Mic is on · tap to turn off',
    micOff: 'Mic is off · tap to turn on',
    level: 'Input level',
    sampleRate: (context: number | null, track: number | null) =>
      `Sample rate: audio ${context ?? '?'} Hz · mic track ${track ?? 'not reported'}${track ? ' Hz' : ''}`,
    echo: (on: boolean | null) => `Echo cancellation: ${on === null ? 'not reported' : on ? 'on' : 'off'}`,
    spoken: (n: number) => `Test sentences spoken: ${n}`,
    sentence: 'This is a speech test. Is it as loud as before?',
    micFailed: 'Microphone not available or permission denied.',
  },
} as const
