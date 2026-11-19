// Urgent-alert tone generated with the Web Audio API (no audio file needed).
let ctx: AudioContext | null = null;

export function playAlertTone() {
  try {
    ctx ??= new AudioContext();
    // Browsers keep the context suspended until the user has interacted with the page.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // Two short beeps, 880 Hz then 660 Hz, with quick fades to avoid clicks.
    [
      { at: 0, freq: 880 },
      { at: 0.22, freq: 660 },
    ].forEach(({ at, freq }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    });
  } catch {
    // Same as the previous audio.play().catch(): an alert without sound is acceptable.
  }
}
