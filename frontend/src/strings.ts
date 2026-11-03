// Every piece of user-facing text lives here.
import type { Distance, Hazard, Side } from './api/types'

export const strings = {
  appName: 'Second Eyes',
  betaLabel: 'beta - research prototype',

  mode: {
    mock: 'MOCK - not a real model answer',
    live: 'Live - Meta Model API',
    checking: 'Checking backend…',
  },

  phrase: {
    hazard: {
      step_down: 'Step down',
      step_up: 'Step up',
      curb: 'Curb',
      obstacle: 'Obstacle',
      clear: 'Clear',
      unsure: 'Not sure',
    } satisfies Record<Hazard, string>,
    ahead: 'ahead',
    side: {
      left: 'left',
      ahead: '',
      right: 'right',
    } satisfies Record<Side, string>,
    distance: {
      near: 'close',
      far: '',
    } satisfies Record<Distance, string>,
  },

  button: {
    start: 'Start',
    stop: 'Stop',
    capture: 'Capture',
    tryAgain: 'Try again',
  },

  state: {
    cameraOff: {
      title: 'Camera is off',
      body: 'Tap Start to open the rear camera.',
    },
    cameraStarting: {
      title: 'Opening camera…',
      body: 'Allow camera access if asked.',
    },
    permissionDenied: {
      title: 'Camera permission denied',
      body: 'Allow camera access for this site in Safari settings, then tap Try again.',
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
    waiting: 'Waiting for answer…',
    backendUnreachable: {
      title: 'Backend unreachable',
      body: 'Is the FastAPI server running on the Mac? Tap Capture to retry.',
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
  },
} as const
