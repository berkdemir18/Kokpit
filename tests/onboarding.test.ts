/**
 * İlk açılış öğreticisinin ne zaman görüneceğini sabitleyen testler.
 *
 * Kritik davranış: mevcut bir veri dosyası güncellemeden sonra turu TEKRAR
 * GÖRMEMELİ. Bu yüzden `onboarded` varsayılanı `true`, turu açan tek yer
 * `seedDB()` (temiz kurulum).
 */

import { describe, it, expect } from 'vitest';
import { migrate, DEFAULT_SETTINGS } from '../src/core/model';
import { seedDB } from '../src/core/seed';

describe('öğretici görünürlüğü', () => {
  it('temiz kurulumda açılır (seed onboarded=false yazar)', () => {
    expect(seedDB().settings.onboarded).toBe(false);
  });

  it('varsayılan ayarda kapalıdır', () => {
    expect(DEFAULT_SETTINGS.onboarded).toBe(true);
  });

  it('alanı olmayan eski veri dosyası turu görmez', () => {
    const eski = { schema: 4, settings: { accent: '#57b6ff', tmdbApiKey: 'x' } };
    const d = migrate(eski);
    expect(d.settings.onboarded).toBe(true);
    // Eski ayarlar korunmuş olmalı — migrasyon üzerine yazmıyor.
    expect(d.settings.tmdbApiKey).toBe('x');
  });

  it('kullanıcı turu bitirdiyse kayıtlı değer korunur', () => {
    const d = migrate({ schema: 5, settings: { onboarded: false } });
    expect(d.settings.onboarded).toBe(false);
  });
});
