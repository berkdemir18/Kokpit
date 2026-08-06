import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/v07.css';
import './styles/v071.css';
import './styles/v072.css';
import './styles/v073.css';
import './styles/v074.css';
import './styles/v075.css';
import './styles/v076.css';
import './styles/v08.css';
import './styles/onboarding.css';

import { store, db } from './core/store';
import { seedDB, buildRoadmap } from './core/seed';
import { currentView, onRouteChange, navigate, applyViewColor, VIEWS } from './core/router';
import * as api from './core/api';
import { buildShell, renderNav, renderFoot, renderTopbar, ShellRefs, Counts } from './ui/shell';
import { capturePrompt, toast, anyOverlayOpen, closeOverlay, alarmCard, CaptureResult } from './ui/overlay';
import { mountCaptureWindow } from './ui/capture-window';
import { chime, primeAudio } from './core/alarm';
import { openPalette } from './ui/palette';
import { openOnboarding } from './ui/onboarding';
import { addNoteToInbox } from './views/notes';
import { addRoadmapTask, revealCapturedTasks } from './views/cyber';
import { addReminder, startScheduler, completeReminder, updateReminder, syncNative } from './core/reminders';
import { dtKey } from './core/util';
import { Repeat } from './core/model';
import { runExport } from './core/export';
import { uid, nowISO, dayKey, fmtDT } from './core/util';

import { renderDashboard } from './views/dashboard';
import { renderWatch } from './views/watch';
import { renderCyber } from './views/cyber';
import { renderGoals } from './views/goals';
import { renderNotes } from './views/notes';
import { renderAgenda } from './views/agenda';
import { renderStats } from './views/stats';
import { renderSettings } from './views/settings';

let refs: ShellRefs;
let cachedInfo: api.DataInfo | null = null;

function counts(): Counts {
  const d = db();
  const today = dayKey();
  return {
    dashboard: d.reminders.filter((r) => !r.done && r.at.slice(0, 10) <= today).length,
    watch: d.titles.length,
    cyber: d.tasks.filter((t) => !t.done).length,
    goals: d.goals.filter((g) => g.status === 'active').length,
    notes: d.pages.filter((p) => !p.archived).length,
    agenda: d.reminders.filter((r) => !r.done).length,
  };
}

/** İçerik alanını aktif modüle göre çizer. */
function renderContent(): void {
  const view = currentView();
  const el = refs.content;
  el.replaceChildren();
  el.scrollTop = 0;
  switch (view) {
    case 'dashboard': renderDashboard(el); break;
    case 'watch': renderWatch(el); break;
    case 'cyber': renderCyber(el); break;
    case 'goals': renderGoals(el); break;
    case 'notes': renderNotes(el); break;
    case 'agenda': renderAgenda(el); break;
    case 'stats': renderStats(el); break;
    case 'settings': renderSettings(el, cachedInfo); break;
  }
}

/**
 * Kenar çubuğu + üst bar. Veri her değiştiğinde bu çalışır — içerik alanına
 * DOKUNMAZ. (Eskiden burada renderContent da vardı: yazı yazarken her otomatik
 * kayıtta textarea yeniden oluşuyor, imleç kaçıyordu. 2026-08-04'te ayrıldı.)
 */
function renderChrome(): void {
  renderNav(refs, counts());
  renderTopbar(refs);
  renderFoot(refs, cachedInfo, doExport);
}

/** Kabuk + içerik birlikte (ilk çizim ve ekran değişimi). */
function renderAll(): void {
  applyViewColor();
  renderChrome();
  renderContent();
}

async function refreshInfo(): Promise<void> {
  try {
    cachedInfo = await api.dataInfo();
  } catch {
    cachedInfo = null;
  }
  renderFoot(refs, cachedInfo, doExport);
}

/**
 * Hızlı yakalama: sekmesine göre not / hatırlatıcı / görev oluşturur.
 * Her birinde "GÖSTER" düğmesi kaydın düştüğü ekrana götürür — Berk
 * yakaladığı görevleri bulamıyordu (2026-08-05).
 */
function applyCapture(res: CaptureResult): void {
  // navigate() aynı ekrandayken hiçbir şey yapmaz; içeriği kendimiz tazeliyoruz.
  const goto = (view: Parameters<typeof navigate>[0]) => () => {
    navigate(view);
    renderContent();
  };

  if (res.kind === 'hatırlatıcı') {
    addReminder(res.text, res.at, res.repeat);
    toast(`Hatırlatıcı kuruldu · ${fmtDT(res.at)}`, goto('agenda'), 'GÖSTER');
  } else if (res.kind === 'görev') {
    const ok = addRoadmapTask(res.text);
    if (ok) {
      toast('Görev eklendi · Siber → Yol Haritası → Yakalananlar', () => {
        revealCapturedTasks();
        goto('cyber')();
      }, 'GÖSTER');
    } else {
      toast('Önce Siber ekranında bir faz gerekli');
    }
  } else {
    addNoteToInbox(res.text);
    toast('Gelen Kutusu\'na eklendi', goto('notes'), 'GÖSTER');
  }
  renderContent();
  renderChrome();
}

async function doCapture(): Promise<void> {
  const res = await capturePrompt();
  if (!res) return;
  applyCapture(res);
}

async function doExport(): Promise<void> {
  await runExport();
  await refreshInfo();
}

/** Beklenmeyen hataları ekranda göster (WebView'de konsol görünmediği için). */
function showFatal(msg: string): void {
  const el = document.getElementById('app');
  if (!el) return;
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#2a1215;color:#ff8a80;' +
    'border:1px solid #5c2b2e;border-radius:8px;padding:10px 14px;font:12px/1.5 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto';
  banner.textContent = '[Kokpit hata] ' + msg;
  document.body.append(banner);
}

async function main(): Promise<void> {
  // Ayri hizli yakalama penceresi: ana uygulamayi hic kurma, sadece kutuyu ciz.
  if (location.hash.replace(/^#\/?/, '') === 'capture') {
    mountCaptureWindow(document.getElementById('app')!);
    return;
  }

  window.addEventListener('error', (e) => showFatal(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => showFatal('promise: ' + String(e.reason)));

  refs = buildShell(document.getElementById('app')!, doCapture, () => openPalette());

  await store.load();

  // İlk açılış: diskte veri dosyası yoksa örnek veriyle doldur ve HEMEN yaz
  // (debounce'u bekleme; ilk çalıştırma verisi kesin diske insin).
  if (store.ready && !store.hadFile) {
    store.update((d) => {
      Object.assign(d, seedDB());
    });
    await store.flush();
  } else if (store.ready && db().phases.length === 0) {
    // Yol haritasından önce oluşmuş bir veri dosyası: mevcut verilere
    // dokunmadan sadece SOC yol haritasını ekle.
    store.update((d) => {
      const rm = buildRoadmap();
      d.phases = rm.phases;
      d.tasks = rm.tasks;
    });
    await store.flush();
  }

  store.applyColorMode();

  // Veri değişince yalnız kabuk tazelenir; ekranlar kendi çizimini yönetir.
  store.subscribe(renderChrome);
  // Hatırlatıcı listesi her değişimde Rust zamanlayıcısına da geçer.
  store.subscribe(syncNative);
  onRouteChange(renderAll);

  if (!location.hash) navigate('dashboard');

  renderAll();
  await refreshInfo();

  // İlk açılış öğreticisi: yalnız temiz kurulumda açılır (seedDB `onboarded`ı
  // false yazar). Mevcut veri dosyası olanlar varsayılan `true`yu alır ve turu
  // görmez; isteyen Ayarlar'dan tekrar açar.
  if (store.ready && !db().settings.onboarded) {
    openOnboarding(() => {
      store.update((d) => { d.settings.onboarded = true; });
      void store.flush();
    });
  }

  // Global kısayol (Tauri): ayrı pencere yoksa eski modal davranışı.
  await api.onQuickCapture(() => void doCapture());

  // Ayrı hızlı yakalama penceresinden gelen kayıt burada işlenir.
  await api.onCaptureSubmit((p) => {
    applyCapture({
      kind: p.kind as CaptureResult['kind'],
      text: p.text,
      at: p.at,
      repeat: (p.repeat as Repeat) ?? 'none',
    });
  });

  primeAudio();

  window.addEventListener('keydown', onKey);

  // Hatırlatıcı zamanlayıcısı: zamanı gelince Windows bildirimi.
  startScheduler((r) => {
    chime();
    alarmCard(
      r.title,
      r.note,
      () => { completeReminder(r.id); renderContent(); renderChrome(); },
      (min) => {
        updateReminder(r.id, { at: dtKey(new Date(Date.now() + min * 60000)), notified: false });
        toast(`${min} dk ertelendi`);
        renderContent();
      },
    );
    if (currentView() === 'agenda' || currentView() === 'dashboard') renderContent();
  });

  // Her 30 sn'de bir veri bilgisini tazele (yedek sayısı vs).
  window.setInterval(() => void refreshInfo(), 30000);

  // Kapanmadan önce bekleyen yazımı kaydet.
  window.addEventListener('beforeunload', () => void store.flush());
}

function onKey(e: KeyboardEvent): void {
  const k = e.key.toLowerCase();
  const typing =
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement ||
    document.activeElement instanceof HTMLSelectElement ||
    (document.activeElement as HTMLElement | null)?.isContentEditable === true;

  if ((e.ctrlKey || e.metaKey) && k === 'k') {
    e.preventDefault();
    openPalette();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'n') {
    e.preventDefault();
    void doCapture();
    return;
  }
  if (k === 'escape' && anyOverlayOpen()) {
    closeOverlay();
    return;
  }
  if (typing || anyOverlayOpen()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (k >= '1' && k <= '8') {
    const v = VIEWS[Number(k) - 1];
    if (v) navigate(v.id);
    return;
  }
}

// Yeni not/kayıt oluştururken paylaşılan yardımcı (view'ler kullanır).
export const helpers = { uid, nowISO, dayKey };

void main();
