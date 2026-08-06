/** Hash tabanli minik yonlendirici + modul tanimlari. */

export type ViewId =
  | 'dashboard'
  | 'notes'
  | 'agenda'
  | 'watch'
  | 'goals'
  | 'stats'
  | 'settings';

export interface ViewDef {
  id: ViewId;
  label: string;
  num: string;
  /** Modül rengi — tokens.css'teki değişken adı. */
  color: string;
}

/** Sıra ekrandaki sıradır; not ve takvim öne alındı (2026-08-04). */
export const VIEWS: ViewDef[] = [
  { id: 'dashboard', label: 'Bugün', num: '01', color: 'var(--c-dashboard)' },
  { id: 'notes', label: 'Notlar', num: '02', color: 'var(--c-notes)' },
  { id: 'agenda', label: 'Takvim', num: '03', color: 'var(--c-agenda)' },
  { id: 'watch', label: 'İzleme', num: '04', color: 'var(--c-watch)' },
  { id: 'goals', label: 'Hedefler', num: '05', color: 'var(--c-goals)' },
  { id: 'stats', label: 'İstatistik', num: '06', color: 'var(--c-stats)' },
  { id: 'settings', label: 'Ayarlar', num: '07', color: 'var(--c-settings)' },
];

const IDS = VIEWS.map((v) => v.id);

export function currentView(): ViewId {
  const hash = location.hash.replace(/^#\/?/, '') as ViewId;
  return IDS.includes(hash) ? hash : 'dashboard';
}

export function viewDef(id: ViewId = currentView()): ViewDef {
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}

/** Aktif modülün rengini `--view` değişkenine yazar; bileşenler bunu okur. */
export function applyViewColor(): void {
  document.documentElement.style.setProperty('--view', viewDef().color);
}

export function navigate(view: ViewId): void {
  if (currentView() === view) return;
  location.hash = `#/${view}`;
}

export function onRouteChange(cb: () => void): void {
  window.addEventListener('hashchange', cb);
}
