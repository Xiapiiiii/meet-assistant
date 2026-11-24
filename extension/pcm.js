// Web Audio mixes the input to mono. Average device samples into 16 kHz bins.
class PCM extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSize = options?.processorOptions?.frameSize || 3200;
    this.frame = new Int16Array(this.frameSize);
    this.used = this.phase = this.sum = this.count = 0;
    this.port.onmessage = () => {
      if (this.used) this.port.postMessage(this.frame.slice(0,this.used).buffer);
      this.port.postMessage('flushed');
      this.done = true;
    };
  }
  process(inputs) {
    if (this.done) return false;
    for (const value of inputs[0]?.[0] || []) {
      this.sum += value;
      this.count++;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const v = Math.max(-1,Math.min(1,this.sum / this.count));
      this.frame[this.used++] = Math.round(v * (v < 0 ? 32768 : 32767));
      this.sum = this.count = 0;
      if (this.used === this.frame.length) {
        this.port.postMessage(this.frame.buffer,[this.frame.buffer]);
        this.frame = new Int16Array(this.frameSize);
        this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm16', PCM);
