// Brief 26: one camera shape for every phone, the main lens instead of an ultra-wide, and the fallback.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAMERA_ASPECT, CAMERA_IDEAL_HEIGHT, CAMERA_IDEAL_WIDTH } from '../config'
import { cameraConstraints, isSixteenNine, isUltraWide, mainCameraId } from './camera'

const IPHONE_DEVICES = [
  { kind: 'videoinput', deviceId: 'front', label: 'Front Camera' },
  { kind: 'videoinput', deviceId: 'main', label: 'Back Camera' },
  { kind: 'videoinput', deviceId: 'uw', label: 'Back Ultra Wide Camera' },
  { kind: 'videoinput', deviceId: 'tele', label: 'Back Telephoto Camera' },
  { kind: 'videoinput', deviceId: 'triple', label: 'Back Triple Camera' },
  { kind: 'audioinput', deviceId: 'mic', label: 'iPhone Microphone' },
]

describe('the camera request', () => {
  it('16:9 at 1280 x 720, rear camera, all "ideal" (never "exact", which some phones refuse)', () => {
    const c = cameraConstraints()
    expect(c).toEqual({
      facingMode: { ideal: 'environment' },
      width: { ideal: CAMERA_IDEAL_WIDTH },
      height: { ideal: CAMERA_IDEAL_HEIGHT },
      aspectRatio: { ideal: CAMERA_ASPECT },
    })
    expect(CAMERA_IDEAL_WIDTH / CAMERA_IDEAL_HEIGHT).toBeCloseTo(CAMERA_ASPECT, 6)
    expect(JSON.stringify(c)).not.toContain('exact')
  })
  it('a chosen camera is asked for by id, with the same shape', () => {
    expect(cameraConstraints('main')).toMatchObject({ deviceId: { exact: 'main' }, aspectRatio: { ideal: CAMERA_ASPECT } })
    expect(cameraConstraints('main')).not.toHaveProperty('facingMode')
  })
})

describe('main camera, not the ultra-wide', () => {
  it('iPhone: the browser chose the ultra-wide -> switch to "Back Camera"', () => {
    expect(mainCameraId('Back Ultra Wide Camera', IPHONE_DEVICES)).toBe('main')
  })
  it('keeps the camera the browser chose when it is not an ultra-wide', () => {
    expect(mainCameraId('Back Camera', IPHONE_DEVICES)).toBeNull()
    expect(mainCameraId('Back Triple Camera', IPHONE_DEVICES)).toBeNull()
  })
  it('Android labels never match: Android keeps its camera (unchanged)', () => {
    expect(isUltraWide('camera2 0, facing back')).toBe(false)
    expect(mainCameraId('camera2 0, facing back', [{ kind: 'videoinput', deviceId: 'a', label: 'camera2 2, facing back' }])).toBeNull()
  })
  it('no other rear camera named: keep the ultra-wide (null)', () => {
    expect(mainCameraId('Back Ultra Wide Camera', [{ kind: 'videoinput', deviceId: 'uw', label: 'Back Ultra Wide Camera' }])).toBeNull()
  })
})

describe('what the phone gave', () => {
  it('16:9 either way up counts; 4:3 does not (the app keeps working and uses the real aspect)', () => {
    expect(isSixteenNine(1280, 720)).toBe(true)
    expect(isSixteenNine(720, 1280)).toBe(true)
    expect(isSixteenNine(1920, 1080)).toBe(true)
    expect(isSixteenNine(640, 480)).toBe(false)
    expect(isSixteenNine(1440, 1920)).toBe(false)
  })
})

describe('openRearCamera fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function fakeStream(label: string, settings: Record<string, unknown>) {
    const track = { label, stop: vi.fn(), getSettings: () => settings }
    return { getVideoTracks: () => [track], getTracks: () => [track], track }
  }

  async function setup(gum: (c: MediaStreamConstraints) => Promise<unknown>) {
    vi.resetModules()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.stubGlobal('window', { isSecureContext: true, location: { search: '' } })
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(gum), enumerateDevices: vi.fn(async () => IPHONE_DEVICES) },
    })
    return import('./camera')
  }

  it('a phone that gives 4:3 is kept as it is, and what it gave is read back', async () => {
    const stream = fakeStream('camera2 0, facing back', { width: 640, height: 480, facingMode: 'environment' })
    const cam = await setup(async () => stream)
    expect(await cam.openRearCamera()).toBe(stream)
    expect(cam.cameraInfo()).toMatchObject({ width: 640, height: 480, aspectRatio: 640 / 480, switched: false })
    expect(console.info).toHaveBeenCalled() // logged: asked for 16:9, got 4:3
  })

  it('ultra-wide first: reopens the main camera by id', async () => {
    const uw = fakeStream('Back Ultra Wide Camera', { width: 1280, height: 720 })
    const main = fakeStream('Back Camera', { width: 1280, height: 720, zoom: 1 })
    const cam = await setup(async (c) => ((c.video as MediaTrackConstraints).deviceId ? main : uw))
    expect(await cam.openRearCamera()).toBe(main)
    expect(uw.track.stop).toHaveBeenCalled()
    expect(cam.cameraInfo()).toMatchObject({ label: 'Back Camera', zoom: 1, switched: true })
  })

  it('the main camera will not open: back to the first request', async () => {
    const uw = fakeStream('Back Ultra Wide Camera', { width: 1280, height: 720 })
    const cam = await setup(async (c) => {
      if ((c.video as MediaTrackConstraints).deviceId) throw new Error('OverconstrainedError')
      return uw
    })
    expect(await cam.openRearCamera()).toBe(uw)
    expect(cam.cameraInfo()?.switched).toBe(false)
  })
})
