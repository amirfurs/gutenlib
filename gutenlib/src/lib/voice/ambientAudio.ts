"use client";

export type AmbientPreset =
  | "none"
  | "library"
  | "rain"
  | "fireplace"
  | "quill"
  | "breeze"
  | "fountain";

/**
 * Procedural Web Audio Ambient Soundscape Generator
 * Synthesizes background textures directly in the browser with zero external MP3/audio files.
 * Provides smooth auto-ducking during speech.
 */
class ProceduralAmbientSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentPreset: AmbientPreset = "none";
  private activeNodes: (AudioNode | number)[] = [];
  private baseVolume: number = 0.35;
  private isDucked: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      const resume = () => {
        void this.ctx?.resume();
        window.removeEventListener("click", resume);
        window.removeEventListener("keydown", resume);
        window.removeEventListener("touchstart", resume);
      };
      window.addEventListener("click", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      window.addEventListener("touchstart", resume, { once: true });
    }
    return this.ctx;
  }

  public getPreset(): AmbientPreset {
    return this.currentPreset;
  }

  public getVolume(): number {
    return this.baseVolume;
  }

  public setVolume(volume: number) {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }

  public setDucked(ducked: boolean) {
    if (this.isDucked === ducked) return;
    this.isDucked = ducked;
    this.updateGain();
  }

  private updateGain() {
    if (!this.ctx || !this.masterGain) return;
    const target = this.isDucked ? this.baseVolume * 0.22 : this.baseVolume;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + (this.isDucked ? 0.2 : 0.8));
  }

  public play(preset: AmbientPreset) {
    this.stop();
    this.currentPreset = preset;
    if (preset === "none") return;

    const ctx = this.getContext();
    if (!ctx) return;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.baseVolume, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    if (preset === "library") {
      this.buildLibrarySound(ctx, this.masterGain);
    } else if (preset === "rain") {
      this.buildRainSound(ctx, this.masterGain);
    } else if (preset === "fireplace") {
      this.buildFireplaceSound(ctx, this.masterGain);
    } else if (preset === "quill") {
      this.buildQuillSound(ctx, this.masterGain);
    } else if (preset === "breeze") {
      this.buildBreezeSound(ctx, this.masterGain);
    } else if (preset === "fountain") {
      this.buildFountainSound(ctx, this.masterGain);
    }
  }

  public stop() {
    this.currentPreset = "none";
    for (const node of this.activeNodes) {
      if (typeof node === "number") {
        clearInterval(node);
      } else {
        try {
          if ("stop" in node && typeof (node as AudioScheduledSourceNode).stop === "function") {
            (node as AudioScheduledSourceNode).stop();
          }
          node.disconnect();
        } catch {
          // Ignore disconnection errors on stale nodes
        }
      }
    }
    this.activeNodes = [];
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // ignore
      }
      this.masterGain = null;
    }
  }

  /**
   * Library: Very gentle, warm, low-frequency atmospheric hum
   */
  private buildLibrarySound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.035;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 450;
    filter.Q.value = 1.0;

    whiteNoise.connect(filter);
    filter.connect(destination);
    whiteNoise.start();

    this.activeNodes.push(whiteNoise, filter);
  }

  /**
   * Rain: Filtered pink noise with soft high-frequency patter
   */
  private buildRainSound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 0.12;
    }

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 950;
    bandpass.Q.value = 0.7;

    source.connect(bandpass);
    bandpass.connect(destination);
    source.start();

    this.activeNodes.push(source, bandpass);
  }

  /**
   * Fireplace: Low rumble + subtle procedural crackles
   */
  private buildFireplaceSound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.015 * white) / 1.015;
      lastOut = output[i];
      output[i] *= 0.15;
    }

    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer;
    rumble.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 280;

    rumble.connect(lowpass);
    lowpass.connect(destination);
    rumble.start();
    this.activeNodes.push(rumble, lowpass);

    // Occasional crackles (Poisson burst clicks)
    const crackleInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || Math.random() > 0.45) return;
      try {
        const click = this.ctx.createBuffer(1, 400, this.ctx.sampleRate);
        const data = click.getChannelData(0);
        for (let j = 0; j < 400; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / 60) * 0.08;
        }
        const clickNode = this.ctx.createBufferSource();
        clickNode.buffer = click;
        clickNode.connect(this.masterGain);
        clickNode.start();
      } catch {
        // ignore
      }
    }, 280);

    this.activeNodes.push(crackleInterval);
  }

  /**
   * Quill & Parchment: Gentle background warmth with soft acoustic paper turning and pen scratch textures
   */
  private buildQuillSound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.015 * white) / 1.015;
      lastOut = output[i];
      output[i] *= 0.06;
    }

    const roomSource = ctx.createBufferSource();
    roomSource.buffer = noiseBuffer;
    roomSource.loop = true;

    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 350;

    roomSource.connect(roomFilter);
    roomFilter.connect(destination);
    roomSource.start();
    this.activeNodes.push(roomSource, roomFilter);

    // Subtle rhythmic quill strokes
    const quillInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || Math.random() > 0.6) return;
      try {
        const strokeLength = Math.floor(ctx.sampleRate * (0.05 + Math.random() * 0.09));
        const strokeBuffer = ctx.createBuffer(1, strokeLength, ctx.sampleRate);
        const strokeData = strokeBuffer.getChannelData(0);
        for (let j = 0; j < strokeLength; j++) {
          const progress = j / strokeLength;
          const envelope = Math.sin(progress * Math.PI) * (1 - progress * 0.3);
          strokeData[j] = (Math.random() * 2 - 1) * envelope * 0.04;
        }

        const strokeSource = ctx.createBufferSource();
        strokeSource.buffer = strokeBuffer;

        const strokeFilter = ctx.createBiquadFilter();
        strokeFilter.type = "bandpass";
        strokeFilter.frequency.value = 2800 + Math.random() * 800;
        strokeFilter.Q.value = 3.0;

        strokeSource.connect(strokeFilter);
        strokeFilter.connect(this.masterGain);
        strokeSource.start();
      } catch {
        // ignore
      }
    }, 320);

    this.activeNodes.push(quillInterval);
  }

  /**
   * Night Breeze: Slow breathing bandpass filter with low-frequency oscillator
   */
  private buildBreezeSound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.06;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 320;
    filter.Q.value = 2.2;

    // Slow LFO to modulate filter frequency (breathing wind cycle)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07; // ~14 second breathing period

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140; // modulate between 180Hz and 460Hz

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    noiseSource.connect(filter);
    filter.connect(destination);

    noiseSource.start();
    lfo.start();

    this.activeNodes.push(noiseSource, filter, lfo, lfoGain);
  }

  /**
   * Andalusian Fountain: Gentle layered trickling water and courtyard air
   */
  private buildFountainSound(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = output[i];
      output[i] *= 0.09;
    }

    const waterSource = ctx.createBufferSource();
    waterSource.buffer = noiseBuffer;
    waterSource.loop = true;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 850;
    waterFilter.Q.value = 0.9;

    waterSource.connect(waterFilter);
    waterFilter.connect(destination);
    waterSource.start();
    this.activeNodes.push(waterSource, waterFilter);

    // Droplet pings
    const dropletInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || Math.random() > 0.5) return;
      try {
        const dropOsc = ctx.createOscillator();
        const dropGain = ctx.createGain();
        const freq = 1200 + Math.random() * 900;
        const now = ctx.currentTime;

        dropOsc.type = "sine";
        dropOsc.frequency.setValueAtTime(freq, now);
        dropOsc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.06);

        dropGain.gain.setValueAtTime(0.015, now);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

        dropOsc.connect(dropGain);
        dropGain.connect(this.masterGain);

        dropOsc.start(now);
        dropOsc.stop(now + 0.06);
      } catch {
        // ignore
      }
    }, 240);

    this.activeNodes.push(dropletInterval);
  }
}

export const ambientSound = new ProceduralAmbientSoundscape();
