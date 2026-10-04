class MicrofishCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = true
    this.buffer = new Float32Array(4096)
    this.offset = 0
    this.port.onmessage = ({ data }) => {
      const command = typeof data === 'string' ? data : data?.command
      if (command === 'pause' || command === 'stop') {
        this.recording = false
        this.flush()
        this.port.postMessage({ flushed: data.requestId })
      }
      if (command === 'resume') this.recording = true
    }
  }
  flush() {
    if (!this.offset) return
    const samples = this.buffer.slice(0, this.offset)
    this.port.postMessage({ samples }, [samples.buffer])
    this.offset = 0
  }
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (this.recording && channel) {
      for (const sample of channel) {
        this.buffer[this.offset++] = sample
        if (this.offset === this.buffer.length) this.flush()
      }
    }
    return true
  }
}
registerProcessor('microfish-capture', MicrofishCapture)
