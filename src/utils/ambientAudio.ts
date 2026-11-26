/**
 * LuDraw — Música ambiente e alarme do cronômetro (Chat 04), 100 % procedurais (Web Audio API).
 *
 * Sala limpa: nenhum arquivo de áudio, sample ou trilha de terceiros. Todo som é sintetizado aqui,
 * em tempo real, com osciladores, ruído gerado por código e uma reverberação cuja resposta ao
 * impulso também é gerada por código. As progressões e padrões são escolhas próprias do projeto.
 *
 *  - "Lo-Fi"       — 76 BPM com swing: acordes de piano elétrico suave, baixo, bumbo/caixa/chimbal
 *                    de ruído filtrado e chiado de vinil.
 *  - "Ambient Pad" — camadas lentas de osciladores dente-de-serra desafinados, filtro que respira e
 *                    reverberação longa, com notas agudas esparsas.
 *  - "Focus Pulse" — drone grave + ruído marrom + pulso pentatônico suave a 60 BPM.
 *  - Alarme        — três sinos (parciais inarmônicos com decaimento exponencial), repetidos 2×.
 *
 * O navegador só libera áudio depois de um gesto do usuário: `ensure()` cria/retoma o contexto e
 * `needsGesture()` avisa quando a interface deve mostrar "Ativar som".
 */

import type { MusicTrack } from '../types/canvas';
import { t } from '../i18n';

type Ctx = AudioContext;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface TrackRuntime {
  bus: GainNode;
  /** Agenda os eventos entre `from` e `to` (segundos do AudioContext) */
  schedule: (from: number, to: number) => void;
  dispose: () => void;
}

class AmbientEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private runtime: TrackRuntime | null = null;
  private current: MusicTrack = 'none';
  private timer: number | null = null;
  private scheduledUntil = 0;
  private volume = 0.55;

  /** Cria (uma vez) e retoma o contexto de áudio. Chame a partir de um gesto do usuário. */
  ensure(): Ctx | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      const music = ctx.createGain();
      music.gain.value = this.volume;
      music.connect(master);
      const reverb = ctx.createConvolver();
      reverb.buffer = this.makeImpulse(ctx, 3.8, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      reverb.connect(wet).connect(music);
      this.ctx = ctx;
      this.master = master;
      this.musicGain = music;
      this.reverb = reverb;
      this.noise = this.makeNoise(ctx, 2);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** O áudio está bloqueado esperando um clique? */
  needsGesture(): boolean {
    return !this.ctx || this.ctx.state !== 'running';
  }

  get track(): MusicTrack {
    return this.current;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
  }

  /** Toca a trilha (troca com transição suave). `'none'` para tudo. */
  play(track: MusicTrack): void {
    if (track === this.current && (track === 'none' || this.runtime)) return;
    this.stop();
    if (track === 'none') return;
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.musicGain);
    bus.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.6);
    this.runtime = track === 'lofi' ? this.lofi(ctx, bus) : track === 'ambient' ? this.pad(ctx, bus) : this.focus(ctx, bus);
    this.current = track;
    this.scheduledUntil = ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.ctx || !this.runtime) return;
      // em abas em segundo plano os timers ficam lentos: agenda com folga maior
      const ahead = typeof document !== 'undefined' && document.hidden ? 1.8 : 0.25;
      const to = this.ctx.currentTime + ahead;
      if (to > this.scheduledUntil) {
        this.runtime.schedule(this.scheduledUntil, to);
        this.scheduledUntil = to;
      }
    };
    tick();
    this.timer = window.setInterval(tick, 40);
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    const rt = this.runtime;
    this.runtime = null;
    this.current = 'none';
    if (rt && this.ctx) {
      const now = this.ctx.currentTime;
      rt.bus.gain.cancelScheduledValues(now);
      rt.bus.gain.setTargetAtTime(0, now, 0.25);
      window.setTimeout(() => {
        rt.dispose();
        try {
          rt.bus.disconnect();
        } catch {
          /* já desconectado */
        }
      }, 1600);
    }
  }

  /** Alarme de fim do cronômetro (independe do volume da música). */
  alarm(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const out = ctx.createGain();
    out.gain.value = 0.42;
    out.connect(this.master);
    const t0 = ctx.currentTime + 0.05;
    const notes = [76, 72, 79]; // E5, C5, G5
    for (let rep = 0; rep < 2; rep++) {
      notes.forEach((n, i) => this.bell(ctx, out, midi(n), t0 + rep * 1.5 + i * 0.32));
    }
    window.setTimeout(() => out.disconnect(), 5000);
  }

  /** Tom curto de confirmação (testar o som). */
  chime(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const out = ctx.createGain();
    out.gain.value = 0.3;
    out.connect(this.master);
    this.bell(ctx, out, midi(79), ctx.currentTime + 0.03);
    window.setTimeout(() => out.disconnect(), 3000);
  }

  /* ------------------------------- Primitivas ------------------------------- */

  private makeNoise(ctx: Ctx, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeImpulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private bell(ctx: Ctx, out: AudioNode, freq: number, t: number): void {
    const partials: [number, number, number][] = [
      [1, 0.6, 1.6],
      [2.76, 0.22, 0.9],
      [5.4, 0.1, 0.5],
      [8.93, 0.05, 0.3],
    ];
    for (const [mult, amp, dur] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private noiseHit(ctx: Ctx, out: AudioNode, t: number, opts: { type: BiquadFilterType; freq: number; q?: number; gain: number; dur: number }): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + opts.dur + 0.02);
  }

  /** Nota de "piano elétrico" suave (seno + triângulo uma oitava acima, filtro passa-baixa). */
  private keys(ctx: Ctx, out: AudioNode, freq: number, t: number, dur: number, vel: number): void {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.035 * vel, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(out);
    const detune = (Math.random() - 0.5) * 8;
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = freq;
    a.detune.value = detune;
    const b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.value = freq * 2;
    b.detune.value = -detune;
    const bg = ctx.createGain();
    bg.gain.value = 0.18;
    a.connect(f);
    b.connect(bg).connect(f);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  }

  /* --------------------------------- Lo-Fi ---------------------------------- */

  private lofi(ctx: Ctx, bus: GainNode): TrackRuntime {
    const bpm = 76;
    const step = 60 / bpm / 4; // semicolcheia
    const swing = 0.16 * step;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 3600;
    warm.connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    warm.connect(send);
    if (this.reverb) send.connect(this.reverb);
    // chiado de vinil: ruído contínuo bem baixo + estalos esparsos
    const hiss = ctx.createBufferSource();
    if (this.noise) hiss.buffer = this.noise;
    hiss.loop = true;
    const hissF = ctx.createBiquadFilter();
    hissF.type = 'bandpass';
    hissF.frequency.value = 3200;
    hissF.Q.value = 0.6;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.012;
    hiss.connect(hissF).connect(hissG).connect(bus);
    hiss.start();
    // Fmaj7 · Em7 · Dm7 · Cmaj7(9) — voicings próprios
    const chords = [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59, 62],
    ];
    const roots = [41, 40, 38, 36];
    const start = ctx.currentTime + 0.05;
    let n = 0;
    const timeOf = (i: number) => start + i * step + (i % 2 === 1 ? swing : 0);
    return {
      bus,
      schedule: (from, to) => {
        while (timeOf(n) < to) {
          const t = timeOf(n);
          if (t >= from - 0.01) {
            const s = n % 16;
            const bar = Math.floor(n / 16) % 4;
            if (s === 0) chords[bar].forEach((m, i) => this.keys(ctx, warm, midi(m), t + i * 0.012, 2.4, 0.9));
            if (s === 10) chords[bar].slice(1).forEach((m, i) => this.keys(ctx, warm, midi(m + 12), t + i * 0.01, 1.2, 0.35));
            if (s === 0 || s === 7) {
              const o = ctx.createOscillator();
              o.type = 'sine';
              o.frequency.value = midi(roots[bar]);
              const g = ctx.createGain();
              g.gain.setValueAtTime(0.0001, t);
              g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
              g.gain.exponentialRampToValueAtTime(0.0001, t + (s === 0 ? 1.1 : 0.6));
              o.connect(g).connect(warm);
              o.start(t);
              o.stop(t + 1.2);
            }
            if (s === 0 || s === 8 || (s === 11 && bar % 2 === 1)) {
              const o = ctx.createOscillator();
              o.type = 'sine';
              o.frequency.setValueAtTime(130, t);
              o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
              const g = ctx.createGain();
              g.gain.setValueAtTime(0.55, t);
              g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
              o.connect(g).connect(bus);
              o.start(t);
              o.stop(t + 0.4);
            }
            if (s === 4 || s === 12) this.noiseHit(ctx, warm, t, { type: 'bandpass', freq: 1900, q: 0.7, gain: 0.16, dur: 0.2 });
            if (s % 2 === 0) this.noiseHit(ctx, bus, t, { type: 'highpass', freq: 7200, gain: s % 4 === 0 ? 0.045 : 0.03 + Math.random() * 0.02, dur: 0.045 });
            if (Math.random() < 0.08) this.noiseHit(ctx, bus, t + Math.random() * step, { type: 'highpass', freq: 2500, gain: 0.02, dur: 0.01 });
          }
          n++;
        }
      },
      dispose: () => {
        try {
          hiss.stop();
        } catch {
          /* já parado */
        }
      },
    };
  }

  /* ------------------------------ Ambient Pad ------------------------------- */

  private pad(ctx: Ctx, bus: GainNode): TrackRuntime {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 420;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    filter.connect(dry).connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    filter.connect(send);
    if (this.reverb) send.connect(this.reverb);
    // Am(add9) · F(maj7) · C(add9) · G(6) — acordes longos que se sobrepõem
    const chords = [
      [45, 52, 57, 59, 60],
      [41, 48, 53, 57, 64],
      [36, 43, 48, 50, 55],
      [43, 50, 55, 59, 64],
    ];
    const sparkle = [69, 72, 74, 76, 79, 81];
    const chordLen = 8;
    const start = ctx.currentTime + 0.05;
    let n = 0;
    let nextSparkle = start + 3;
    return {
      bus,
      schedule: (from, to) => {
        while (start + n * chordLen < to) {
          const t = start + n * chordLen;
          if (t >= from - 0.01) {
            for (const m of chords[n % chords.length]) {
              for (const cents of [-7, 0, 7]) {
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = midi(m);
                o.detune.value = cents + (Math.random() - 0.5) * 4;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.016, t + 3);
                g.gain.setValueAtTime(0.016, t + chordLen - 1);
                g.gain.exponentialRampToValueAtTime(0.0001, t + chordLen + 3.5);
                o.connect(g).connect(filter);
                o.start(t);
                o.stop(t + chordLen + 3.6);
              }
            }
          }
          n++;
        }
        while (nextSparkle < to) {
          if (nextSparkle >= from - 0.01) {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = midi(sparkle[Math.floor(Math.random() * sparkle.length)]);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, nextSparkle);
            g.gain.exponentialRampToValueAtTime(0.04, nextSparkle + 0.4);
            g.gain.exponentialRampToValueAtTime(0.0001, nextSparkle + 4);
            o.connect(g);
            g.connect(send);
            o.start(nextSparkle);
            o.stop(nextSparkle + 4.1);
          }
          nextSparkle += 2.5 + Math.random() * 4;
        }
      },
      dispose: () => {
        try {
          lfo.stop();
        } catch {
          /* já parado */
        }
      },
    };
  }

  /* ------------------------------ Focus Pulse ------------------------------- */

  private focus(ctx: Ctx, bus: GainNode): TrackRuntime {
    const nodes: AudioScheduledSourceNode[] = [];
    // drone grave (Lá + Mi) com leve batimento
    for (const [m, det] of [
      [45, -3],
      [52, 3],
      [57, 0],
    ] as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(m);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = m === 57 ? 0.018 : 0.045;
      o.connect(g).connect(bus);
      o.start();
      nodes.push(o);
    }
    // ruído marrom (integração simples do branco) bem filtrado
    const brown = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 520;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    src.connect(nf).connect(ng).connect(bus);
    src.start();
    nodes.push(src);
    // pulso pentatônico a 60 BPM (padrão próprio de 8 passos)
    const send = ctx.createGain();
    send.gain.value = 0.35;
    if (this.reverb) send.connect(this.reverb);
    const pattern = [69, 72, 76, 74, 69, 79, 76, 72];
    const beat = 1;
    const start = ctx.currentTime + 0.1;
    let n = 0;
    return {
      bus,
      schedule: (from, to) => {
        while (start + n * beat < to) {
          const t = start + n * beat;
          if (t >= from - 0.01) {
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = midi(pattern[n % pattern.length] - (Math.floor(n / 16) % 2 ? 12 : 0));
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 1400;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
            o.connect(f).connect(g);
            g.connect(bus);
            g.connect(send);
            o.start(t);
            o.stop(t + 1);
          }
          n++;
        }
      },
      dispose: () => {
        for (const node of nodes) {
          try {
            node.stop();
          } catch {
            /* já parado */
          }
        }
      },
    };
  }
}

/** Motor único do app (um AudioContext por aba). */
export const ambient = new AmbientEngine();

export const MUSIC_TRACKS: { id: MusicTrack; label: string; description: string }[] = [
  { id: 'none', get label() { return t('widgets.ambientAudio.noMusic'); }, get description() { return t('widgets.ambientAudio.justAlarmEnd'); } },
  { id: 'lofi', label: 'Lo-Fi', get description() { return t('widgets.ambientAudio.calmBeatSoftChords'); } },
  { id: 'ambient', label: 'Ambient Pad', get description() { return t('widgets.ambientAudio.slowSpaciousLayers'); } },
  { id: 'focus', label: 'Focus Pulse', get description() { return t('widgets.ambientAudio.subtlePulseLowDrone'); } },
];
