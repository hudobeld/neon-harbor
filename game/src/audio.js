// Synthesized sound only — WebAudio oscillators and filtered noise, no audio files.
// Engine hum follows speed, the siren is a two-tone wail, gunshots are noise bursts.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  // Browsers only let audio start after a user gesture; call this from one.
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a square wave that alternates between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (err) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || this.muted) return;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 160, this.ctx.currentTime, 0.08);
  }

  setSiren(on, dt) {
    if (!this.ctx) return;
    if (!on) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 950 : 700;
    }
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.035, this.ctx.currentTime, 0.1);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  noise(dur, vol, lowFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noise(0.14, 0.5, 2600); }
  crash() { this.noise(0.25, 0.5, 300); this.blip(70, 0.2, 'sine', 0.4); }
  pickup() { this.blip(880, 0.12, 'sine', 0.25); this.blip(1320, 0.14, 'sine', 0.2); }
  click() { this.blip(600, 0.06, 'square', 0.12); }
  missionDone() { this.blip(523, 0.15, 'sine', 0.25); this.blip(659, 0.15, 'sine', 0.25); this.blip(784, 0.3, 'sine', 0.25); }
  missionFail() { this.blip(330, 0.2, 'sawtooth', 0.2); this.blip(220, 0.35, 'sawtooth', 0.2); }
}
