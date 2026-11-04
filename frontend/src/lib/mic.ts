// Microphone -> PCM16 mono 16 kHz frames (AudioWorklet in public/mic-worklet.js, encoder in pcm.ts).
import { MIC_FRAME_MS, MIC_SAMPLE_RATE } from '../config'
import { audioContext, holdAudio, micClosed, micOpened, releaseAudio, unlockAudio } from './audio'
import { selfSound } from './micGate'
import { Pcm16Encoder } from './pcm'

export interface MicHandle {
  stop: () => void
  /** The device's actual capture rate before resampling. */
  inputRate: number
}

/** Opens the mic. Frames are dropped (not sent) while the phone itself is making sound. */
export async function startMic(onFrame: (pcm: Int16Array<ArrayBuffer>) => void): Promise<MicHandle> {
  const ctx = audioContext() ?? unlockAudio()
  if (!ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('microphone not available')
  micOpened() // iOS: 'play-and-record' while the mic is open (Brief 26)
  holdAudio() // the worklet needs a running context (Brief 27: WebKit suspends it when idle)
  const close = () => {
    micClosed()
    releaseAudio()
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    })
  } catch (err) {
    close()
    throw err
  }
  try {
    await ctx.audioWorklet.addModule('/mic-worklet.js')
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop())
    close()
    throw err
  }
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'mic-capture')
  const mute = ctx.createGain()
  mute.gain.value = 0 // keeps the worklet pulled by the graph without playing the mic back
  source.connect(node).connect(mute).connect(ctx.destination)
  const encoder = new Pcm16Encoder(ctx.sampleRate, MIC_SAMPLE_RATE, (MIC_SAMPLE_RATE * MIC_FRAME_MS) / 1000)
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    for (const frame of encoder.push(e.data)) if (selfSound.canSend(performance.now())) onFrame(frame)
  }
  return {
    inputRate: ctx.sampleRate,
    stop: () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      mute.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      close()
    },
  }
}
