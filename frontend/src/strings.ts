// Every piece of user-facing text lives here.
import type { ShownHazard, Side } from './api/types'
import type { Lang } from './config'
import type { WarningHazard } from './lib/phrase'

/**
 * Hazard phrases, one table per language (no cross-language concatenation). Each language has:
 * - screen: the short phrase shown on screen (Owner approved 3 Nov, "translation ok"), also the box tag words;
 * - voice: the plain-language sentence that is spoken (Owner approved 3 Nov, Brief 5b, "yes to all").
 * EN is approved; ZH / MS / TA are approved pending a native-speaker check.
 * The prompt v5 kinds (drain ... wall) and the new catch-all words (obstacle) were Owner approved 4 Nov (Brief 12).
 * Brief 13: escalator, uneven, road, crossing, cycle_path and the clear words Owner approved 4 Nov.
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
    /** Hedged (Brief 13b, "There might be ..."): with metres, and near / far. Same voice word. */
    maybeMetres: (what: string, metres: number, side: Side | null) => string
    maybePlain: (what: string, side: Side | null, near: boolean) => string
  }
}

const pick = (side: Side | null, left: string, right: string, ahead = '') =>
  side === 'left' ? left : side === 'right' ? right : ahead

/** English voice words start with a capital ("A kerb"); inside "There might be ..." they are lower case. */
const lower = (w: string) => w.charAt(0).toLowerCase() + w.slice(1)

/** Tamil voice words end in a verb (உள்ளது / உள்ளன / இருக்கிறார் / இருக்கிறார்கள்); hedged, it becomes இருக்கலாம். */
export const TA_VERB = / (உள்ளது|உள்ளன|இருக்கிறார்கள்|இருக்கிறார்)$/
const taMaybe = (w: string) => w.replace(TA_VERB, ' இருக்கலாம்')

export const phrases: Record<Lang, PhraseLanguage> = {
  en: {
    hazard: {
      step_down: 'Step down',
      step_up: 'Step up',
      curb: 'Kerb', // British spelling (Brief 13b), like the voice
      drain: 'Drain',
      head_height: 'Head height',
      person: 'Person',
      people: 'People',
      bike: 'Bike',
      vehicle: 'Vehicle',
      pole: 'Pole',
      barrier: 'Barrier',
      ramp: 'Ramp',
      door: 'Door',
      wall: 'Wall',
      road: 'Road',
      crossing: 'Crossing',
      cycle_path: 'Cycle path',
      escalator: 'Escalator',
      lift: 'Lift', // Brief 28, Owner approved 5 Nov ("Approve all")
      uneven: 'Uneven ground',
      obstacle: 'In your path',
      clear: 'Nothing seen',
      unsure: 'Not sure',
      steps: 'Steps', // fast warning (SAM), direction unknown; Owner approved 4 Nov (Brief 11)
    },
    metres: (h, n, side) => `${h}, ${n} ${n === 1 ? 'metre' : 'metres'}${pick(side, ', left', ', right')}`,
    plain: (h, side, near) => `${h} ahead${pick(side, ', left', ', right')}${near ? ', close' : ''}`,
    voice: {
      hazard: {
        step_down: 'Steps going down',
        step_up: 'Steps going up',
        curb: 'A kerb',
        drain: 'An open drain',
        head_height: 'Something at head height',
        person: 'A person',
        people: 'A group of people',
        bike: 'A bicycle or scooter',
        vehicle: 'A vehicle',
        pole: 'A pole',
        barrier: 'A barrier',
        ramp: 'A ramp',
        door: 'A door',
        wall: 'A wall',
        road: 'The edge of a road',
        crossing: 'A pedestrian crossing',
        cycle_path: 'A cycle path',
        escalator: 'An escalator',
        lift: 'A lift', // Brief 28, Owner approved 5 Nov
        uneven: 'Uneven ground',
        obstacle: 'Something in your path',
        steps: 'Steps',
      },
      clear: 'Nothing seen in your path.',
      metres: (w, n, side) =>
        `${w}, about ${n} ${n === 1 ? 'metre' : 'metres'} ahead${pick(side, ', on your left', ', on your right')}.`,
      plain: (w, side, near) => `${w} ${near ? 'very close' : 'ahead'}${pick(side, ', on your left', ', on your right')}.`,
      maybeMetres: (w, n, side) =>
        `There might be ${lower(w)} about ${n} ${n === 1 ? 'metre' : 'metres'} ahead${pick(side, ', on your left', ', on your right')}.`,
      maybePlain: (w, side, near) =>
        `There might be ${lower(w)} ${near ? 'very close' : 'ahead'}${pick(side, ', on your left', ', on your right')}.`,
    },
  },
  zh: {
    hazard: {
      step_down: '下台阶',
      step_up: '上台阶',
      curb: '路缘',
      drain: '水沟',
      head_height: '头顶障碍',
      person: '行人',
      people: '人群',
      bike: '自行车',
      vehicle: '车辆',
      pole: '柱子',
      barrier: '路障',
      ramp: '坡道',
      door: '门',
      wall: '墙',
      road: '路边',
      crossing: '人行横道',
      cycle_path: '自行车道',
      escalator: '扶梯',
      lift: '电梯', // Brief 28, Owner approved 5 Nov
      uneven: '地面不平',
      obstacle: '挡路物',
      clear: '未见障碍',
      unsure: '不确定',
      steps: '台阶',
    },
    metres: (h, n, side) => `${pick(side, '左前方', '右前方', '前方')}${n}米，${h}`,
    plain: (h, side, near) => `${pick(side, '左前方', '右前方', '前方')}${h}${near ? '，很近' : ''}`,
    voice: {
      hazard: {
        step_down: '往下的台阶',
        step_up: '往上的台阶',
        curb: '路缘石',
        drain: '敞开的水沟',
        head_height: '头部高度的障碍物',
        person: '人',
        people: '一群人',
        bike: '自行车或滑板车',
        vehicle: '车',
        pole: '柱子',
        barrier: '路障',
        ramp: '坡道',
        door: '门',
        wall: '墙',
        road: '马路边缘',
        crossing: '人行横道',
        cycle_path: '自行车道',
        escalator: '自动扶梯',
        lift: '电梯', // Brief 28, Owner approved 5 Nov
        uneven: '不平的地面',
        obstacle: '挡路的东西',
        steps: '台阶',
      },
      clear: '前面的路上没有看到障碍。',
      metres: (w, n, side) => `${pick(side, '左前方', '右前方', '前面')}大约${n}米，有${w}。`,
      plain: (w, side, near) => `${pick(side, '左前方', '右前方', '前面')}${near ? '很近的地方有' : '有'}${w}。`,
      maybeMetres: (w, n, side) => `${pick(side, '左前方', '右前方', '前面')}大约${n}米，可能有${w}。`,
      maybePlain: (w, side, near) => `${pick(side, '左前方', '右前方', '前面')}${near ? '很近的地方可能有' : '可能有'}${w}。`,
    },
  },
  ms: {
    hazard: {
      step_down: 'Tangga turun',
      step_up: 'Tangga naik',
      curb: 'Bebendul jalan',
      drain: 'Longkang',
      head_height: 'Paras kepala',
      person: 'Orang',
      people: 'Sekumpulan orang',
      bike: 'Basikal',
      vehicle: 'Kenderaan',
      pole: 'Tiang',
      barrier: 'Penghadang',
      ramp: 'Landaian',
      door: 'Pintu',
      wall: 'Dinding',
      road: 'Tepi jalan',
      crossing: 'Lintasan',
      cycle_path: 'Laluan basikal',
      escalator: 'Eskalator',
      lift: 'Lif', // Brief 28, Owner approved 5 Nov
      uneven: 'Tidak rata',
      obstacle: 'Di laluan anda',
      clear: 'Tiada apa-apa',
      unsure: 'Tidak pasti',
      steps: 'Tangga',
    },
    metres: (h, n, side) => `${h}, ${n} meter${pick(side, ', sebelah kiri', ', sebelah kanan')}`,
    plain: (h, side, near) => `${h} di hadapan${pick(side, ', sebelah kiri', ', sebelah kanan')}${near ? ', dekat' : ''}`,
    voice: {
      hazard: {
        step_down: 'tangga turun',
        step_up: 'tangga naik',
        curb: 'bebendul jalan',
        drain: 'longkang terbuka',
        head_height: 'sesuatu di paras kepala',
        person: 'orang',
        people: 'sekumpulan orang',
        bike: 'basikal atau skuter',
        vehicle: 'kenderaan',
        pole: 'tiang',
        barrier: 'penghadang',
        ramp: 'landaian',
        door: 'pintu',
        wall: 'dinding',
        road: 'tepi jalan raya',
        crossing: 'lintasan pejalan kaki',
        cycle_path: 'laluan basikal',
        escalator: 'eskalator',
        lift: 'lif', // Brief 28, Owner approved 5 Nov
        uneven: 'permukaan tidak rata',
        obstacle: 'sesuatu di laluan anda',
        steps: 'tangga',
      },
      clear: 'Tiada apa-apa dilihat di laluan anda.',
      metres: (w, n, side) =>
        `Ada ${w} kira-kira ${n} meter di hadapan${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
      plain: (w, side, near) =>
        `Ada ${w} ${near ? 'sangat dekat di hadapan' : 'di hadapan'}${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
      maybeMetres: (w, n, side) =>
        `Mungkin ada ${w} kira-kira ${n} meter di hadapan${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
      maybePlain: (w, side, near) =>
        `Mungkin ada ${w} ${near ? 'sangat dekat di hadapan' : 'di hadapan'}${pick(side, ', di sebelah kiri', ', di sebelah kanan')}.`,
    },
  },
  ta: {
    hazard: {
      step_down: 'இறங்கு படி',
      step_up: 'ஏறு படி',
      curb: 'நடைபாதை விளிம்பு',
      drain: 'வடிகால்',
      head_height: 'தலை உயரத் தடை',
      person: 'நபர்',
      people: 'மக்கள் கூட்டம்',
      bike: 'மிதிவண்டி',
      vehicle: 'வாகனம்',
      pole: 'கம்பம்',
      barrier: 'தடுப்பு',
      ramp: 'சாய்வுப் பாதை',
      door: 'கதவு',
      wall: 'சுவர்',
      road: 'சாலை ஓரம்',
      crossing: 'பாதசாரி கடவை',
      cycle_path: 'மிதிவண்டிப் பாதை',
      escalator: 'நகரும் படிக்கட்டு',
      lift: 'லிஃப்ட்', // Brief 28, Owner approved 5 Nov
      uneven: 'சீரற்ற தரை',
      obstacle: 'பாதையில் தடை',
      clear: 'எதுவும் தெரியவில்லை',
      unsure: 'உறுதியில்லை',
      steps: 'படிகள்',
    },
    metres: (h, n, side) => `${h}, ${n} மீட்டர்${pick(side, ', இடது பக்கம்', ', வலது பக்கம்')}`,
    plain: (h, side, near) => `முன்னால் ${h}${pick(side, ', இடது பக்கம்', ', வலது பக்கம்')}${near ? ', அருகில்' : ''}`,
    voice: {
      hazard: {
        step_down: 'கீழே இறங்கும் படிகள் உள்ளன',
        step_up: 'மேலே ஏறும் படிகள் உள்ளன',
        curb: 'நடைபாதை ஓரம் உள்ளது',
        drain: 'திறந்த வடிகால் உள்ளது',
        head_height: 'தலை உயரத்தில் ஏதோ உள்ளது',
        person: 'ஒருவர் இருக்கிறார்',
        people: 'மக்கள் கூட்டம் உள்ளது',
        bike: 'மிதிவண்டி அல்லது ஸ்கூட்டர் உள்ளது',
        vehicle: 'வாகனம் உள்ளது',
        pole: 'கம்பம் உள்ளது',
        barrier: 'தடுப்பு உள்ளது',
        ramp: 'சாய்வுப் பாதை உள்ளது',
        door: 'கதவு உள்ளது',
        wall: 'சுவர் உள்ளது',
        road: 'சாலையின் ஓரம் உள்ளது',
        crossing: 'பாதசாரி கடவை உள்ளது',
        cycle_path: 'மிதிவண்டிப் பாதை உள்ளது',
        escalator: 'நகரும் படிக்கட்டு உள்ளது',
        lift: 'லிஃப்ட் உள்ளது', // Brief 28, Owner approved 5 Nov
        uneven: 'சீரற்ற தரை உள்ளது',
        obstacle: 'உங்கள் பாதையில் ஏதோ ஒன்று உள்ளது',
        steps: 'படிகள் உள்ளன',
      },
      clear: 'உங்கள் பாதையில் எதுவும் தெரியவில்லை.',
      metres: (w, n, side) =>
        `சுமார் ${n} மீட்டர் முன்னால்${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${w}.`,
      plain: (w, side, near) =>
        `${near ? 'மிக அருகில் முன்னால்' : 'முன்னால்'}${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${w}.`,
      maybeMetres: (w, n, side) =>
        `சுமார் ${n} மீட்டர் முன்னால்${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${taMaybe(w)}.`,
      maybePlain: (w, side, near) =>
        `${near ? 'மிக அருகில் முன்னால்' : 'முன்னால்'}${pick(side, ', உங்கள் இடது பக்கம்', ', உங்கள் வலது பக்கம்')}, ${taMaybe(w)}.`,
    },
  },
}

/**
 * Asking a question, per language (shown on the card; `sorry` is also spoken in that language).
 * Owner approved 4 Nov 2026 (Brief 8), verbatim. EN is final; ZH / MS / TA are final pending a native-speaker check.
 * Example question (tests, demo): EN "Hey Eyes, what is there?" · ZH "Hey Eyes，前面有什么？" ·
 * MS "Hey Eyes, apa yang ada di hadapan?" · TA "Hey Eyes, முன்னால் என்ன இருக்கிறது?"
 * Brief 29: also EN "Hey Eyes, where does the path go?" (the Ask prompt describes the path, never gives directions).
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

/** Connection alerts (Brief 13), spoken and shown in the chosen language. Owner approved 4 Nov, verbatim. */
// Wording v2 (Brief 14): Owner approved 4 Nov, all 4 languages; ZH / MS / TA native check pending.
/** Brief 34: the camera looks covered (2 s in a row). Owner approved 5 Nov, verbatim; spoken in English only for now,
 *  shown in English in every language. */
export const coveredText = "I can't see right now. Please check the camera."

export const connectionText: Record<Lang, { lost: string; back: string }> = {
  en: { lost: "Connection lost. I can't warn you right now. Please use your cane.", back: "I'm back. Warnings are on again." },
  zh: { lost: '连接中断。我现在无法提醒您，请使用手杖。', back: '我回来了，提醒已恢复。' },
  ms: {
    lost: 'Sambungan terputus. Saya tidak dapat memberi amaran sekarang. Sila gunakan tongkat anda.',
    back: 'Saya kembali. Amaran aktif semula.',
  },
  ta: {
    lost: 'இணைப்பு துண்டிக்கப்பட்டது. இப்போது என்னால் எச்சரிக்க முடியாது. உங்கள் கைத்தடியைப் பயன்படுத்துங்கள்.',
    back: 'நான் திரும்பி வந்துவிட்டேன். எச்சரிக்கைகள் மீண்டும் இயங்குகின்றன.',
  },
}

/** Said once when the user taps Start / Stop (Brief 14). Owner approved 4 Nov; ZH / MS / TA native check pending. */
/**
 * Start / Stop lines (Brief 14), and the getting-ready lines (Brief 27, English approved by the Owner 4 Nov, verbatim).
 * `ready` / `still` are null until the ZH / MS / TA wording comes: those languages keep their Brief 14 start line and
 * skip the two new lines.
 */
export const sessionText: Record<Lang, { start: string; stop: string; ready: string | null; still: string | null }> = {
  en: {
    start: 'Second Eyes is getting ready. Please wait a moment before you walk.',
    stop: 'Second Eyes is off.',
    ready: "Ready. I'll tell you what I see in your path.",
    still: 'Still getting ready. Thank you for waiting.',
  },
  zh: { start: 'Second Eyes 已开启。我会告诉您路上看到的情况。', stop: 'Second Eyes 已关闭。', ready: null, still: null },
  ms: {
    start: 'Second Eyes sudah dihidupkan. Saya akan beritahu apa yang saya nampak di laluan anda.',
    stop: 'Second Eyes sudah dimatikan.',
    ready: null,
    still: null,
  },
  ta: {
    start: 'Second Eyes இயக்கப்பட்டது. உங்கள் பாதையில் நான் பார்ப்பதைச் சொல்வேன்.',
    stop: 'Second Eyes நிறுத்தப்பட்டது.',
    ready: null,
    still: null,
  },
}

/**
 * Brief 30: the spoken Ask hint, once per Start after the ready line, with hands-free listening on. English approved by
 * the Owner 5 Nov ("Approve and send"), verbatim. Null: no spoken hint in that language for now.
 */
export const askHintText: Record<Lang, string | null> = {
  en: 'You can ask me anything. Just say "Hey Eyes", then your question.',
  zh: null,
  ms: null,
  ta: null,
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
    // Brief 20: the existing "Voice" label, and "Recommended" on the default voice (wording from the brief)
    voice: 'Voice',
    recommended: 'Recommended',
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
    // TENTATIVE (Brief 13)
    talkMore: 'Talk more',
    talkMoreLine: 'Repeats the current warning every few seconds.',
    // Brief 35 (TENTATIVE): for a phone worn on a lanyard, top end down
    upsideDown: 'Phone hangs upside down',
    upsideDownLine: 'Turns every picture the right way up before it is checked.',
  },

  // TENTATIVE (Brief 6), English in every language for now: the rest of asking. The card texts are in `askText`.
  ask: {
    micChip: 'Listening',
    // Brief 30, Owner approved 5 Nov, verbatim: the camera screen line while hands-free listening is on. English in
    // every language ("Hey Eyes" is said in English everywhere).
    hintLine: 'Say "Hey Eyes", then ask',
    stopped: { title: 'Listening stopped', body: 'Touch and hold the screen to ask instead.' },
    micFailed: { title: 'Microphone not available', body: 'Touch and hold will not work either.' },
    timing: (totalS: string, asrS: string, modelS: string) =>
      `ask: question to answer ${totalS} s (speech recognition ${asrS} s, model ${modelS} s)`,
  },

  // Public demo (Brief 19): Owner approved 4 Nov, verbatim, English only. `minutes` comes from DEMO_SLOT_S.
  demo: {
    welcomeTitle: 'Try Second Eyes',
    welcomeLine:
      'Point your phone ahead. Second Eyes tells you about steps, kerbs and other things in your path, out loud.',
    youHave: (minutes: string) => `You have ${minutes}.`,
    // Brief 30, Owner approved 5 Nov ("Approve and send"), verbatim
    askBullet: 'Ask me anything. Say "Hey Eyes", then your question, like "What\'s in front of me?" or "Where does the path go?"',
    privacyBullet:
      "Faces are blurred on your phone. Images and questions go to Meta's AI to be understood, and we don't keep them.",
    safety: 'This is an early demo. Please keep using your cane or guide, and take extra care near roads.',
    start: (minutes: string) => `Start my ${minutes}`,
    left: (time: string) => `${time} left`,
    timeUp: (minutes: string) => `That's your ${minutes}. Thank you for trying Second Eyes.`,
    full: (withVideo: boolean) =>
      withVideo
        ? "Today's demo spots are all taken. Please come back tomorrow, or watch the demo video."
        : "Today's demo spots are all taken. Please come back tomorrow.",
    watchVideo: 'Watch the video',
    tryLater: 'Lots of people are trying Second Eyes right now. Please try again in a minute.',
    back: 'Back', // TENTATIVE (Brief 17): not part of the Brief 19 wording
  },

  button: {
    start: 'Start',
    stop: 'Stop',
    capture: 'Capture',
    tryAgain: 'Try again',
  },

  state: {
    // Brief 27 (English approved by the Owner 4 Nov, verbatim; shown in English in every language for now)
    gettingReady: {
      title: 'Getting ready…',
      body: 'This takes a few seconds the first time.',
      steps: { camera: 'Camera', privacy: 'Privacy', firstLook: 'First look' },
      done: 'done',
    },
    soundBack: { title: 'Tap to turn the sound back on' },
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
    // Debug (Brief 16): distance at capture and at speaking time
    distanceNow: (capturedM: string, nowM: string) => `distance: at capture ${capturedM} · when said ${nowM}`,
    dropped: (n: number) => `dropped late ${n}`,
    // Debug (Brief 25), English only: is speech unlocked, how did the last phrase go, Web Audio state
    speech: (unlocked: boolean, last: string | null, detail: string | null, audio: string, session: string) =>
      `speech: unlocked ${unlocked ? 'yes' : 'no'} · last speak ${last ?? '–'}${detail ? ` (${detail})` : ''} · audio ${audio} · session ${session}`,
    // Debug (Brief 27), English only: audio route changes, picture pauses, stuck phrases spoken again
    recovery: (changes: number, last: string | null, paused: number, recovered: number, respoken: number, failures: number) =>
      `route changes ${changes}${last ? ` (last: ${last})` : ''} · video paused ${paused} · recovered ${recovered} · re-spoken ${respoken} · not started in a row ${failures}`,
    // Debug (Brief 34), English only: frame orientation and the covered-camera measure
    orientation: (upsideDown: boolean, source: string, y: number | null, flipped: boolean) =>
      `orientation: ${upsideDown ? 'upside down' : 'upright'} (${source}) · gravity y ${y === null ? '–' : y.toFixed(1)} · last frame ${flipped ? 'turned' : 'as is'}`,
    cover: (mean: number, sd: number, covered: boolean) => `camera: ${covered ? 'covered' : 'clear'} · mean ${mean.toFixed(0)} · sd ${sd.toFixed(0)}`,
    // Debug (Brief 30), English only: phrases whose end never came (the safety net ended them)
    endsLost: (n: number) => `ends lost ${n}`,
    // Debug (Brief 30), English only: mic frames sent / dropped by the self-sound gate, the listen socket, capture rate
    mic: (sent: number, gated: number, socket: string, rateHz: number | null) =>
      `mic: sent ${sent} · gated ${gated} · listen ${socket}${rateHz ? ` · in ${rateHz} Hz -> 16000` : ''}`,
    // Debug (Brief 28), English only: heartbeat ticks
    ticks: (played: number, skipped: number) => `ticks played ${played} · skipped ${skipped}`,
    // Debug (Brief 26), English only: what the camera gives, and the vertical field of view the distances use
    camera: (c: {
      size: string
      aspect: string
      frame: string
      zoom: string
      facing: string
      label: string
      switched: boolean
      vfov: string
    }) =>
      `camera: ${c.size} (${c.aspect}) · frame ${c.frame} · zoom ${c.zoom} · ${c.facing} · "${c.label}"${c.switched ? ' (switched from ultra-wide)' : ''} · vfov ${c.vfov}`,
    // Debug (Brief 26), English only: where the time of the last answer went, ms
    stages: (s: {
      channel: string
      captureMs: number
      blurMs: number
      encodeMs: number
      queueMs: number
      netMs: number
      modelMs: number
      waitMs: number | null
      speechMs: number | null
    }) =>
      `last answer (${s.channel}): capture ${s.captureMs} · blur ${s.blurMs} · encode ${s.encodeMs} · queue ${s.queueMs} · net ${s.netMs} · model ${s.modelMs}` +
      (s.waitMs === null ? ' · not spoken' : ` · wait ${s.waitMs} · speech start ${s.speechMs ?? '…'}`) +
      ' ms',
    // TENTATIVE (Brief 7): the last frame actually sent
    sentFrame: 'Last frame sent',
    sentFrameLine: (blur: 'on' | 'off', faces: number, ms: number) =>
      blur === 'on' ? `faces blurred ${faces} · ${ms} ms` : `face blur off · sent unblurred`,
    // TENTATIVE (Brief 2)
    usage: (inputTokens: number, outputTokens: number, costUsd: number) =>
      `tokens in ${inputTokens} · out ${outputTokens} · $${costUsd.toFixed(4)}`,
  },

  // Diagnostic (Brief 24): voice list page (?voices=1), English only, never in the normal app
  voiceTest: {
    title: 'Voices on this device',
    count: (n: number) => `${n} voices`,
    none: 'No voices reported yet.',
    fields: (v: { lang: string; voiceURI: string; localService: boolean; default: boolean }) =>
      `lang "${v.lang}" · voiceURI "${v.voiceURI}" · localService ${v.localService} · default ${v.default}`,
    seenAs: (lang: string | null, region: string | null) => `read as: ${lang ?? '?'} / ${region ?? '?'}`,
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
