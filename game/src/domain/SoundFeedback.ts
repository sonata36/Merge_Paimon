/** 本项目原创的短促合成音；音频上下文只在用户手势之后创建。 */
export class SoundFeedback {
  private context: AudioContext | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) this.unlock();
  }

  unlock(): void {
    if (this.muted || this.context) {
      if (!this.muted && this.context?.state === 'suspended') {
        void this.context.resume().catch(() => undefined);
      }
      return;
    }
    try {
      const AudioContextClass = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      // 无音频设备或浏览器禁止播放时，游戏仍可正常运行。
      this.context = null;
    }
  }

  playDrop(): void {
    this.tone(360, 185, 0.11, 0.055, 'sine');
  }

  playMerge(level: number): void {
    const base = 390 + level * 34;
    this.tone(base, base * 1.12, 0.14, 0.045, 'triangle');
    this.tone(base * 1.3, base * 1.7, 0.18, 0.038, 'sine', 0.065);
  }

  playFail(): void {
    this.tone(290, 105, 0.45, 0.06, 'triangle');
  }

  close(): void {
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }

  private tone(start: number, end: number, duration: number, volume: number,
    type: OscillatorType, delay = 0): void {
    const context = this.context;
    if (this.muted || !context || context.state !== 'running') return;
    try {
      const now = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.01);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      // 浏览器音频异常不应中断投放、合成或结束判定。
    }
  }
}
