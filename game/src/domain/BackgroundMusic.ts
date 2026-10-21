/** 本地背景音乐；只在开始/重开等用户点击后请求播放。 */
export class BackgroundMusic {
  private readonly audio: HTMLAudioElement;

  constructor() {
    const path = window.location.protocol === 'file:'
      ? './assets/audio/a-day-in-mondstadt.mp3'
      : './audio/a-day-in-mondstadt.mp3';
    this.audio = document.createElement('audio');
    this.audio.preload = 'none';
    this.audio.loop = true;
    this.audio.volume = 0.18;
    this.audio.src = path;
  }

  play(): void {
    void this.audio.play().catch(() => {
      // 自动播放限制或音频设备不可用时，游戏仍照常运行。
    });
  }

  pause(): void {
    this.audio.pause();
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
  }

  close(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
