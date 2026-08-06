/**
 * Hızlı yakalama PENCERESİ (Alt+Q).
 *
 * Ayrı, çerçevesiz, küçük bir Tauri penceresidir; ana uygulama açılmaz.
 * Kendisi veri yazmaz — yazdığını Rust üzerinden ana pencereye iletir, kayıt
 * orada tek elden yapılır (iki yazıcı data.json'u bozar).
 *
 * Formun kendisi `capture-form.ts` içindedir; uygulama içi kutu da aynı formu
 * kullanır, böylece ikisi birebir aynı görünür ve aynı çalışır.
 */

import { buildCaptureForm, CaptureResult } from './capture-form';
import { clear } from './dom';

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function submit(res: CaptureResult): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('submit_capture', {
    kind: res.kind, text: res.text, at: res.at, repeat: res.repeat,
  });
}

async function hide(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_capture');
}

/** Seçici açılınca pencere uzasın, kapanınca eski boyuna dönsün. */
async function resize(height: number): Promise<void> {
  if (!isTauri()) return;
  const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
    import('@tauri-apps/api/window'),
    import('@tauri-apps/api/dpi'),
  ]);
  await getCurrentWindow().setSize(new LogicalSize(560, height));
}

export function mountCaptureWindow(root: HTMLElement): void {
  clear(root);
  document.body.classList.add('is-capture-window');

  const form = buildCaptureForm({
    variant: 'window',
    onSubmit: (res) => void submit(res),
    onClose: () => void hide(),
    onPicking: (open) => void resize(open ? 660 : 420),
  });

  root.append(form.el);
  form.focus();

  // Pencere her açıldığında temiz ve odaklı gelsin.
  if (isTauri()) {
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen('kokpit://capture-open', () => {
        form.reset();
        void resize(420);
        window.setTimeout(() => form.focus(), 30);
      });
    });
  }
}
