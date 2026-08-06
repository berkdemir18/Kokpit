/**
 * KOKPİT — modül ikonları (v0.8)
 * Unicode gliflerin yerine gömülü SVG. Font'a bağlı değil, hizası sabit,
 * rengi currentColor'dan gelir → .nav-item__icon rengi ne olursa onu alır.
 *
 * Kullanım:  navItem.append(icon('cyber'))
 * 16px ızgara · 1.4px kontur · yuvarlak uç
 */

export type IconName =
  | 'dashboard' | 'notes' | 'agenda' | 'watch'
  | 'cyber' | 'goals' | 'stats' | 'settings'
  | 'brand';

const P: Record<IconName, string> = {
  // gösterge: daire + ibre
  dashboard: '<circle cx="8" cy="8" r="6"/><line x1="8" y1="8" x2="11" y2="5"/>',
  // sayfa + iki satır
  notes: '<rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.5" y1="6" x2="10.5" y2="6"/><line x1="5.5" y1="9.5" x2="9" y2="9.5"/>',
  // takvim: kutu + başlık çizgisi + iki tırnak
  agenda: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/><line x1="5.5" y1="2" x2="5.5" y2="4"/><line x1="10.5" y1="2" x2="10.5" y2="4"/>',
  // ekran + oynat üçgeni (üçgen dolu)
  watch: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M7 6.4 L10 8 L7 9.6 Z" fill="currentColor" stroke="none"/>',
  // kalkan
  cyber: '<path d="M8 2 L13 4 V8 C13 11 8 14 8 14 C8 14 3 11 3 8 V4 Z"/>',
  // hedef: iç içe daire
  goals: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.4"/>',
  // sütun grafik
  stats: '<line x1="3.5" y1="13" x2="3.5" y2="9"/><line x1="8" y1="13" x2="8" y2="5"/><line x1="12.5" y1="13" x2="12.5" y2="7"/>',
  // kaydırıcılar
  settings: '<line x1="2.5" y1="5.5" x2="13.5" y2="5.5"/><line x1="2.5" y1="10.5" x2="13.5" y2="10.5"/><circle cx="6" cy="5.5" r="1.6" fill="var(--bg-sidebar)"/><circle cx="10.5" cy="10.5" r="1.6" fill="var(--bg-sidebar)"/>',
  // marka: oyulmuş K — dolu kare, K negatif alanda (kontur yok)
  brand: '<rect x="0" y="0" width="16" height="16" rx="2.5" fill="currentColor" stroke="none"/>'
    + '<g fill="var(--bg-sidebar)" stroke="none">'
    + '<rect x="3" y="3" width="2.5" height="10"/>'
    + '<rect x="10.5" y="3" width="2.5" height="2"/><rect x="8" y="5" width="2.5" height="2"/>'
    + '<rect x="5.5" y="7" width="2.5" height="2"/>'
    + '<rect x="8" y="9" width="2.5" height="2"/><rect x="10.5" y="11" width="2.5" height="2"/>'
    + '</g>',
};

/** Bir <svg> öğesi döndürür. size: px (varsayılan 16). */
export function icon(name: IconName, size = 16): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('viewBox', '0 0 16 16');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.4');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  el.style.flex = 'none';
  el.innerHTML = P[name];
  return el;
}

/**
 * shell.ts içindeki değişiklik:
 *   h('div', { class: 'nav-item__icon', text: v.icon })
 * yerine
 *   h('div', { class: 'nav-item__icon' }, icon(v.id))
 * ve router.ts'teki ViewDef.icon alanı kaldırılabilir.
 */
