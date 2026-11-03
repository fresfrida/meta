// AudioWorklet: copies microphone samples (mono, Float32 at the device rate) to the main thread.
class MicCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) this.port.postMessage(channel.slice(0))
    return true
  }
}
registerProcessor('mic-capture', MicCapture)
