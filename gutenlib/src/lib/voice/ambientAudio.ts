"use client";

export type AmbientPreset = "none" | "library" | "rain" | "fireplace";

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
}

export const ambientSound = new ProceduralAmbientSoundscape();
