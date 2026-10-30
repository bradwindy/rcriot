import { DEFAULT_VOICE, type Voice } from './voices';

const MASTER = 0.45;
/** Level of every sound but the motors, kept well under them so nothing jumps out. */
const FX_LEVEL = 0.35;
const MAX_VOICES = 24;
/** Bot motors you can hear at once, and how far away they fade out. */
const TRAFFIC = 2;
const HEARING = 45;

/** Spark crackle per drift level: loudness, filter centre and loop speed (which also raises the pitch). */
const SPARKS = [
  { gain: 0, freq: 2600, rate: 1 },
  { gain: 0.15, freq: 2600, rate: 1 },
  { gain: 0.24, freq: 4800, rate: 1.7 },
];

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  /** Everything but the motors: skids, sparks and one-shots. */
  fx: GainNode;
  noise: AudioBuffer;
  motor: Motor;
  traffic: Motor[];
  skidFilter: BiquadFilterNode;
  skidGain: GainNode;
  sparkSrc: AudioBufferSourceNode;
  sparkFilter: BiquadFilterNode;
  sparkGain: GainNode;
  heatGain: GainNode;
  chargeGain: GainNode;
}

const clamp = (v: number, lo: number, hi: number): number => (v >= lo ? Math.min(v, hi) : lo);

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A loop of short random pops, like static sparks. */
function crackleBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < 24; i++) {
    const start = Math.floor(Math.random() * (len - 400));
    const size = 60 + Math.floor(Math.random() * 240);
    const amp = 0.4 + Math.random() * 0.6;
    for (let k = 0; k < size; k++) data[start + k] += (Math.random() * 2 - 1) * amp * Math.exp((-4 * k) / size);
  }
  return buf;
}

/** Firings per second when a voice's loop plays at normal speed. */
const BASE_FIRING = 80;
/** Exhaust ring at normal speed, in Hz. It rises with the revs, like a two-stroke climbing its pipe. */
const BASE_RING = 420;

/**
 * One second of two-stroke engine: a quick train of sharp cracks, each a click of noise and a short metallic ring,
 * with a little wander in timing and strength. Looped and sped up with the revs, it buzzes like a go-kart.
 */
function firingLoop(ctx: AudioContext, v: Voice): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = sr;
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const step = sr / BASE_FIRING;
  const pulse = Math.floor(step * 1.5);
  const ring = (2 * Math.PI * BASE_RING * v.ring) / sr;
  const crack = 0.0008 * sr;
  const decay = 0.0025 * sr;
  let t = 0;
  while (t < len) {
    const amp = 1 - Math.random() * v.jitter * 2.5;
    for (let k = 0; k < pulse; k++) {
      const click = (Math.random() * 2 - 1) * Math.exp(-k / crack);
      const ping = Math.sin(k * ring) * Math.exp(-k / decay);
      data[(Math.floor(t) + k) % len] += amp * (v.grit * click + (1 - v.grit * 0.5) * ping);
    }
    t += step * (1 + (Math.random() - 0.5) * 2 * v.jitter);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < len; i++) data[i] = (data[i] / peak) * 0.9;
  return buf;
}

function clipCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * drive) / Math.tanh(drive);
  return curve;
}

/** One car's motor: the voice's firing loop, muffled by two lowpasses, with the boom cut and a soft clip for grit. */
class Motor {
  private src: AudioBufferSourceNode | null = null;
  private readonly filter: BiquadFilterNode;
  private readonly shaper: WaveShaperNode;
  private readonly gain: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly input: AudioNode;
  private voice = DEFAULT_VOICE;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly loops: (v: Voice) => AudioBuffer,
  ) {
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 90;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.7;
    const fizzCut = ctx.createBiquadFilter();
    fizzCut.type = 'lowpass';
    fizzCut.frequency.value = 1400;
    this.shaper = ctx.createWaveShaper();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    lowCut.connect(this.filter).connect(fizzCut).connect(this.shaper).connect(this.gain).connect(this.pan).connect(out);
    this.input = lowCut;
    this.setVoice(DEFAULT_VOICE);
  }

  setVoice(v: Voice): void {
    this.voice = v;
    this.shaper.curve = clipCurve(1.2 + v.grit * 2.5);
    const src = this.ctx.createBufferSource();
    src.buffer = this.loops(v);
    src.loop = true;
    src.playbackRate.value = this.src?.playbackRate.value ?? v.idle / BASE_FIRING;
    src.connect(this.input);
    src.start(0, Math.random());
    this.src?.stop();
    this.src = src;
  }

  /** level: overall loudness, 0 silent. pan: -1 left to 1 right. */
  set(speed: number, throttle: number, boost: boolean, airborne: boolean, level: number, pan = 0): void {
    const v = this.voice;
    const s = clamp(speed, 0, 1);
    const t = Math.abs(clamp(throttle, -1, 1));
    const rev = Math.min(1.25, airborne ? s + 0.35 * t : s);
    const firing = (v.idle + rev * (v.top - v.idle)) * (boost ? 1.1 : 1);
    const loud = (0.07 + 0.06 * t + 0.03 * s + (boost ? 0.015 : 0)) * level;
    const now = this.ctx.currentTime;
    this.src?.playbackRate.setTargetAtTime(firing / BASE_FIRING, now, airborne ? 0.2 : 0.12);
    this.filter.frequency.setTargetAtTime((380 + rev * 420 + t * 80) * v.tone, now, 0.08);
    this.gain.gain.setTargetAtTime(loud, now, 0.05);
    this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), now, 0.05);
  }

  silence(): void {
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}

/** A bot car near the listener, for its motor sound. */
export interface Nearby {
  voice: Voice;
  speed: number;
  throttle: number;
  /** Distance from the camera. */
  distance: number;
  /** -1 left to 1 right, as the camera sees it. */
  pan: number;
}

/** Synthesised RC car sound. Every method is safe to call before unlock, while muted, or without Web Audio. */
export class Sound {
  private rig: Rig | null = null;
  private mutedFlag = false;
  private voices = 0;
  private readonly last = new Map<string, number>();
  private playerVoice = DEFAULT_VOICE;
  private readonly trafficVoices: (Voice | null)[] = new Array<Voice | null>(TRAFFIC).fill(null);

  get muted(): boolean {
    return this.mutedFlag;
  }

  set muted(value: boolean) {
    this.mutedFlag = value;
    const rig = this.rig;
    if (!rig) return;
    try {
      rig.master.gain.setTargetAtTime(value ? 0 : MASTER, rig.ctx.currentTime, 0.03);
    } catch {
      // Audio is optional.
    }
  }

  unlock(): void {
    try {
      const rig = this.rig ?? this.build();
      if (!rig || rig.ctx.state === 'running') return;
      const ctx = rig.ctx;
      ctx.resume().catch(() => undefined);
      // iOS only starts output once a buffer plays inside the gesture.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start();
    } catch {
      // A failed unlock leaves the game silent.
    }
  }

  /** Loudness of all motors, 0 off to 1 normal. Skids, bumps and boosts are not affected. */
  engineVolume = 0.5;

  /** The motor voice for the player's car. */
  voice(v: Voice): void {
    this.playerVoice = v;
    this.rig?.motor.setVoice(v);
  }

  engine(speed: number, throttle: number, boost: boolean, airborne: boolean): void {
    this.live()?.motor.set(speed, throttle, boost, airborne, this.engineVolume);
  }

  /** The nearest bot motors, quieter with distance. Extra cars are ignored. */
  traffic(cars: Nearby[]): void {
    const rig = this.live();
    if (!rig) return;
    rig.traffic.forEach((motor, i) => {
      const c = cars[i];
      if (!c || c.distance > HEARING) {
        motor.silence();
        return;
      }
      if (this.trafficVoices[i] !== c.voice) {
        this.trafficVoices[i] = c.voice;
        motor.setVoice(c.voice);
      }
      const near = 1 - c.distance / HEARING;
      motor.set(c.speed, c.throttle, false, false, 0.35 * near * near * this.engineVolume, c.pan);
    });
  }

  skid(amount: number): void {
    const rig = this.live();
    if (!rig) return;
    const a = clamp(amount, 0, 1);
    const now = rig.ctx.currentTime;
    rig.skidFilter.frequency.setTargetAtTime(1700 + a * 1300, now, 0.05);
    rig.skidGain.gain.setTargetAtTime(a ** 1.2 * 0.3, now, 0.03);
  }

  sparks(level: 0 | 1 | 2): void {
    const rig = this.live();
    if (!rig) return;
    const spec = SPARKS[level] ?? SPARKS[0];
    const now = rig.ctx.currentTime;
    rig.sparkGain.gain.setTargetAtTime(spec.gain, now, 0.02);
    rig.sparkFilter.frequency.setTargetAtTime(spec.freq, now, 0.04);
    rig.sparkSrc.playbackRate.setTargetAtTime(spec.rate, now, 0.04);
  }

  idle(): void {
    const rig = this.live();
    if (!rig) return;
    const now = rig.ctx.currentTime;
    rig.motor.silence();
    for (const m of rig.traffic) m.silence();
    rig.skidGain.gain.setTargetAtTime(0, now, 0.05);
    rig.sparkGain.gain.setTargetAtTime(0, now, 0.05);
    rig.heatGain.gain.setTargetAtTime(0, now, 0.05);
    rig.chargeGain.gain.setTargetAtTime(0, now, 0.05);
  }

  /** A soft flame hiss for as long as it is called with true. */
  heat(on: boolean): void {
    const rig = this.live();
    if (!rig) return;
    rig.heatGain.gain.setTargetAtTime(on ? 0.065 : 0, rig.ctx.currentTime, on ? 0.05 : 0.08);
  }

  /** A quiet electric fizz for as long as it is called with true. */
  charge(on: boolean): void {
    const rig = this.live();
    if (!rig) return;
    rig.chargeGain.gain.setTargetAtTime(on ? 0.4 : 0, rig.ctx.currentTime, on ? 0.08 : 0.06);
  }

  hop(): void {
    this.play('hop', 60, () => {
      this.tone('triangle', 240, 600, 0.07, 0.16);
      this.tone('sine', 600, 380, 0.1, 0.07, 0.06);
    });
  }

  boost(power: 1 | 2): void {
    const big = power === 2;
    this.play('boost', 150, () => {
      const dur = big ? 0.9 : 0.5;
      this.hiss('bandpass', 400, big ? 3600 : 2600, dur, big ? 0.34 : 0.22, 0, 1.1, dur * 0.3);
      this.tone('sawtooth', big ? 170 : 150, big ? 800 : 480, dur * 0.8, big ? 0.1 : 0.07);
      if (big) this.hiss('highpass', 3000, 6000, 0.5, 0.1, 0.05, 0.8, 0.15);
    });
  }

  bump(strength: number): void {
    const s = clamp(strength, 0, 1);
    this.play('bump', 70, () => {
      const p = 0.92 + Math.random() * 0.16;
      this.hiss('bandpass', 2400, 900, 0.05, 0.1 + 0.25 * s, 0, 1.2);
      this.tone('triangle', 210 * p, 80 * p, 0.1, 0.14 + 0.3 * s);
      this.tone('square', 640 * p, 380 * p, 0.035, 0.03 + 0.07 * s);
    });
  }

  land(strength: number): void {
    const s = clamp(strength, 0, 1);
    this.play('land', 100, () => {
      this.tone('sine', 150, 48, 0.16 + 0.12 * s, 0.18 + 0.3 * s);
      this.hiss('lowpass', 1800, 250, 0.1 + 0.08 * s, 0.08 + 0.2 * s, 0, 0.7);
      this.tone('triangle', 330, 220, 0.07, 0.03 + 0.07 * s, 0.05);
    });
  }

  beep(go: boolean): void {
    this.play(go ? 'go' : 'count', 100, () => {
      if (go) {
        this.tone('square', 880, 880, 0.45, 0.12, 0, 0.7);
        this.tone('triangle', 1320, 1320, 0.45, 0.06, 0, 0.7);
      } else {
        this.tone('square', 440, 440, 0.14, 0.11, 0, 0.6);
      }
    });
  }

  select(): void {
    this.play('select', 40, () => {
      this.tone('square', 880, 1180, 0.05, 0.08);
      this.tone('triangle', 1760, 1760, 0.06, 0.04, 0.02);
    });
  }

  /** The item slot landing on a pick-up: a soft two-note ding. */
  pickup(): void {
    this.play('pickup', 60, () => {
      this.tone('triangle', 523, 523, 0.08, 0.12);
      this.tone('triangle', 784, 784, 0.16, 0.12, 0.07);
      this.tone('sine', 1046, 1046, 0.12, 0.035, 0.07);
    });
  }

  /** One click of the item slot spinning through pick-ups. */
  rollTick(): void {
    this.play('roll', 40, () => this.tone('triangle', 660, 600, 0.03, 0.05));
  }

  /** Breaking open a pick-up box. */
  boxBreak(): void {
    this.play('box', 60, () => {
      this.hiss('bandpass', 1800, 900, 0.09, 0.08, 0, 1.4);
      this.tone('triangle', 440, 700, 0.07, 0.06);
    });
  }

  lockOn(): void {
    this.play('lock', 250, () => {
      for (let i = 0; i < 3; i++) this.tone('sine', 740, 740, 0.05, 0.05, i * 0.09);
    });
  }

  /** A rocket leaving or a water bomb being lobbed. */
  launch(): void {
    this.play('launch', 80, () => {
      this.tone('sine', 220, 110, 0.1, 0.05);
      this.hiss('bandpass', 300, 800, 0.3, 0.2, 0, 1.2, 0.12);
    });
  }

  /** A mine, oil spill or fake box set down. */
  drop(): void {
    this.play('drop', 80, () => {
      this.tone('triangle', 320, 150, 0.08, 0.15);
      this.tone('sine', 480, 300, 0.05, 0.06, 0.012);
      this.hiss('bandpass', 1400, 800, 0.03, 0.12, 0, 1.2);
    });
  }

  explode(strength: number): void {
    const s = clamp(strength, 0, 1);
    this.play('explode', 60, () => {
      this.tone('sine', 150, 55, 0.14 + 0.1 * s, 0.07 + 0.09 * s);
      this.hiss('lowpass', 1100, 150, 0.1 + 0.1 * s, 0.14 + 0.14 * s, 0, 0.7);
    });
  }

  zap(): void {
    this.play('zap', 80, () => {
      for (let i = 0; i < 3; i++) this.tone('triangle', 350 + Math.random() * 500, 200, 0.03, 0.07, i * 0.035);
      this.hiss('bandpass', 900, 600, 0.12, 0.26, 0, 2, 0.01);
    });
  }

  /** A water bomb landing or a bubble popping. */
  splash(): void {
    this.play('splash', 80, () => {
      this.tone('sine', 300, 700, 0.09, 0.11);
      this.tone('sine', 450, 950, 0.07, 0.06, 0.07);
      this.hiss('lowpass', 900, 300, 0.12, 0.15, 0, 0.7);
    });
  }

  shockwave(): void {
    this.play('shockwave', 150, () => {
      this.tone('sine', 160, 70, 0.35, 0.1);
      this.hiss('lowpass', 600, 150, 0.3, 0.26, 0, 0.7, 0.1);
    });
  }

  thunder(): void {
    this.play('thunder', 300, () => {
      this.hiss('bandpass', 1200, 500, 0.07, 0.3, 0, 0.8, 0.002);
      this.tone('triangle', 400, 120, 0.07, 0.09);
      this.hiss('lowpass', 400, 100, 0.8, 0.4, 0.04, 0.7, 0.15);
      this.tone('sine', 110, 55, 0.7, 0.09, 0.04);
    });
  }

  shieldUp(): void {
    this.play('shield', 150, () => {
      this.tone('sine', 440, 880, 0.22, 0.04, 0, 0.5);
      this.tone('triangle', 660, 1100, 0.22, 0.02, 0.05, 0.5);
      this.tone('sine', 880, 1180, 0.16, 0.015, 0.1, 0.5);
    });
  }

  private build(): Rig | null {
    const prefixed = globalThis as unknown as { webkitAudioContext?: typeof AudioContext };
    const Ctor = globalThis.AudioContext ?? prefixed.webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: 'interactive' });

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.mutedFlag ? 0 : MASTER;
    master.connect(comp);
    const bus = ctx.createGain();
    bus.connect(master);
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 4500;
    soften.connect(bus);
    const fx = ctx.createGain();
    fx.gain.value = FX_LEVEL;
    fx.connect(soften);
    const noise = noiseBuffer(ctx);

    const cache = new Map<Voice, AudioBuffer>();
    const loops = (v: Voice) => {
      let buf = cache.get(v);
      if (!buf) {
        buf = firingLoop(ctx, v);
        cache.set(v, buf);
      }
      return buf;
    };
    const motor = new Motor(ctx, bus, loops);
    motor.setVoice(this.playerVoice);
    const traffic = Array.from({ length: TRAFFIC }, () => new Motor(ctx, bus, loops));

    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = noise;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1700;
    skidFilter.Q.value = 3;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    const squeal = ctx.createOscillator();
    squeal.frequency.value = 11;
    const squealDepth = ctx.createGain();
    squealDepth.gain.value = 160;
    squeal.connect(squealDepth);
    squealDepth.connect(skidFilter.frequency);
    skidSrc.connect(skidFilter).connect(skidGain).connect(fx);
    skidSrc.start();
    squeal.start();

    const sparkSrc = ctx.createBufferSource();
    sparkSrc.buffer = crackleBuffer(ctx);
    sparkSrc.loop = true;
    const sparkFilter = ctx.createBiquadFilter();
    sparkFilter.type = 'bandpass';
    sparkFilter.frequency.value = SPARKS[1].freq;
    sparkFilter.Q.value = 0.9;
    const sparkGain = ctx.createGain();
    sparkGain.gain.value = 0;
    sparkSrc.connect(sparkFilter).connect(sparkGain).connect(fx);
    sparkSrc.start();

    const heatSrc = ctx.createBufferSource();
    heatSrc.buffer = noise;
    heatSrc.loop = true;
    const heatFilter = ctx.createBiquadFilter();
    heatFilter.type = 'lowpass';
    heatFilter.frequency.value = 900;
    heatFilter.Q.value = 0.5;
    const heatGain = ctx.createGain();
    heatGain.gain.value = 0;
    heatSrc.connect(heatFilter).connect(heatGain).connect(fx);
    heatSrc.start(0, Math.random() * 1.5);

    const chargeSrc = ctx.createBufferSource();
    chargeSrc.buffer = crackleBuffer(ctx);
    chargeSrc.loop = true;
    chargeSrc.playbackRate.value = 3;
    const chargeBand = ctx.createBiquadFilter();
    chargeBand.type = 'bandpass';
    chargeBand.frequency.value = 900;
    chargeBand.Q.value = 2;
    const chargeCut = ctx.createBiquadFilter();
    chargeCut.type = 'lowpass';
    chargeCut.frequency.value = 1400;
    const chargeGain = ctx.createGain();
    chargeGain.gain.value = 0;
    chargeSrc.connect(chargeBand).connect(chargeCut).connect(chargeGain).connect(fx);
    chargeSrc.start();

    this.rig = {
      ctx,
      master,
      bus,
      fx,
      noise,
      motor,
      traffic,
      skidFilter,
      skidGain,
      sparkSrc,
      sparkFilter,
      sparkGain,
      heatGain,
      chargeGain,
    };
    return this.rig;
  }

  /** The rig, only while the context is running. */
  private live(): Rig | null {
    const rig = this.rig;
    return rig && rig.ctx.state === 'running' ? rig : null;
  }

  private play(key: string, gap: number, build: () => void): void {
    const rig = this.live();
    if (!rig || this.mutedFlag || this.voices >= MAX_VOICES) return;
    const now = rig.ctx.currentTime * 1000;
    if (now - (this.last.get(key) ?? -1e9) < gap) return;
    this.last.set(key, now);
    try {
      build();
    } catch {
      // A failed sound is never worth an exception in the game loop.
    }
  }

  private track(src: AudioScheduledSourceNode, chain: AudioNode[]): void {
    this.voices++;
    src.onended = () => {
      this.voices--;
      for (const n of chain) n.disconnect();
    };
  }

  /** hold is the share of the duration kept at full volume before the fade. */
  private tone(wave: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0, hold = 0): void {
    const rig = this.rig;
    if (!rig) return;
    const t = rig.ctx.currentTime + at;
    const osc = rig.ctx.createOscillator();
    const env = rig.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    if (hold > 0) env.gain.setValueAtTime(vol, t + dur * hold);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(rig.fx);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    this.track(osc, [osc, env]);
  }

  private hiss(
    type: BiquadFilterType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    at = 0,
    q = 1,
    attack = 0.005,
  ): void {
    const rig = this.rig;
    if (!rig) return;
    const t = rig.ctx.currentTime + at;
    const src = rig.ctx.createBufferSource();
    src.buffer = rig.noise;
    src.loop = true;
    const filter = rig.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = rig.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + Math.min(attack, dur / 2));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(rig.fx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
    this.track(src, [src, filter, env]);
  }
}
