/**
 * Hatırlatıcı alarmı.
 *
 * Windows toast bildirimi PORTABLE exe'de sessizce düşer (toast için Başlat
 * menüsünde AppUserModelID taşıyan bir kısayol gerekir — kurulumla gelir).
 * Bu yüzden bildirim tek başına yeterli değil: her durumda çalan yumuşak bir
 * ses + ekranda kalan bir alarm kartı da gösteriyoruz.
 */

let ctx: AudioContext | null = null;

/** Yumuşak, kısa çan sesi — Web Audio ile üretiliyor, dosya yok. */
export function chime(): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;

    // İki nota (mi–la), her biri hızlı yükselip yumuşak sönen sinüs.
    const notes: [number, number][] = [[659.25, 0], [880, 0.18]];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const t = now + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1);
    }
  } catch {
    // Ses açılamıyorsa sessizce geç; görsel alarm zaten var.
  }
}

/**
 * Tarayıcı ses politikası: ilk kullanıcı etkileşiminde AudioContext'i açar,
 * böylece alarm zamanı geldiğinde ses kesin çıkar.
 */
export function primeAudio(): void {
  const unlock = () => {
    try {
      ctx = ctx ?? new AudioContext();
      void ctx.resume();
    } catch { /* yok say */ }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
