/** Ayarlar — veri, yedek, vault, tema, kısayollar, dışa aktarma. */

import { store, db } from '../core/store';
import { h, clear } from '../ui/dom';
import { toast, formModal, confirmDialog } from '../ui/overlay';
import * as api from '../core/api';
import { fmtBytes, dtKey } from '../core/util';
import { runExport, exportCsv, exportJson } from '../core/export';
import { seedDB } from '../core/seed';
import { emptyDB } from '../core/model';
import { importTraktExport } from '../core/trakt-import';
import { syncGoogleCalendar, addReminder } from '../core/reminders';
import { navigate, VIEWS } from '../core/router';
import { chime } from '../core/alarm';

const ACCENTS: [string, string][] = [
  ['#57b6ff', 'mavi'],
  ['#6ee7a8', 'yeşil'],
  ['#efc770', 'sarı'],
  ['#c79bf0', 'mor'],
  ['#e0a3c8', 'pembe'],
  ['#f0a58a', 'mercan'],
  ['#7fd8d0', 'turkuaz'],
];

const HOTKEYS: [string, string][] = [
  ['Ctrl K', 'komut paleti · her modülde arama'],
  ['Alt Q', 'hızlı yakalama penceresi — tek elle, her yerden'],
  ['Ctrl ⇧ N', 'aynı pencere (eski kısayol)'],
  ['1 – 8', 'modüller arası geçiş'],
  ['Tab / Ctrl 1-3', 'hızlı yakalamada sekme değiştir'],
  ['Ctrl+Enter', 'formu kaydet · notu Gelen Kutusu’na at'],
  ['Esc', 'modal / palet / onay kutusu kapat'],
];

export function renderSettings(root: HTMLElement, info: api.DataInfo | null): void {
  clear(root);
  root.append(
    h('div', { class: 'grid-2-start' },
      h('div', { class: 'stack-sm' }, dataCard(root, info), backupsCard(root), themeCard(root)),
      h('div', { class: 'stack-sm' }, notifyCard(root), calendarCard(root), tmdbCard(root), traktCard(root), hotkeysCard(), exportCard(root)),
    ),
  );
}

/* ---------------------------------------------------------- bildirimler */

function notifyCard(root: HTMLElement): HTMLElement {
  const d = db();
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'Hatırlatıcı bildirimleri' })),
  );

  const statusEl = h('div', { class: 'sub-text', text: 'izin durumu kontrol ediliyor…' });
  void api.notificationAllowed().then((ok) => {
    statusEl.textContent = ok
      ? 'Windows bildirim izni verilmiş · bildirimleri Rust tarafı gönderiyor'
      : 'Windows bildirim izni görünmüyor — "izin iste"ye bas (bildirim yine de denenir)';
  });

  const toggle = h('button', {
    class: `chip${d.settings.notifyEnabled ? ' is-on' : ''}`,
    text: d.settings.notifyEnabled ? 'Bildirimler açık' : 'Bildirimler kapalı',
    onclick: () => {
      store.update((db2) => { db2.settings.notifyEnabled = !db2.settings.notifyEnabled; });
      renderSettings(root, null);
    },
  });

  const leadSel = h('select', {
    class: 'field__select',
    style: { width: '160px' },
    onchange: (e) => {
      store.update((db2) => { db2.settings.notifyLeadMin = Number((e.target as HTMLSelectElement).value) || 0; });
      toast('Bildirim zamanı güncellendi');
    },
  });
  for (const [v, label] of [[0, 'tam saatinde'], [5, '5 dk önce'], [15, '15 dk önce'], [30, '30 dk önce'], [60, '1 saat önce']] as [number, string][]) {
    const o = h('option', { value: String(v), text: label });
    if (d.settings.notifyLeadMin === v) o.selected = true;
    leadSel.append(o);
  }

  card.append(
    h('div', { style: { padding: '13px 16px' } },
      statusEl,
      h('div', { class: 'row', style: { gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
        toggle,
        leadSel,
        h('button', {
          class: 'btn', text: 'İzin iste',
          onclick: async () => {
            const ok = await api.requestNotificationPermission();
            toast(ok ? 'Bildirim izni verildi' : 'Bildirim izni reddedildi');
            renderSettings(root, null);
          },
        }),
        h('button', {
          class: 'btn', text: 'Test bildirimi',
          onclick: async () => {
            await api.notify('Kokpit çalışıyor', 'Hatırlatıcı bildirimleri bu şekilde görünecek.');
            toast('Test bildirimi gönderildi');
          },
        }),
        h('button', {
          class: 'btn', text: 'Test alarmı (5 sn)',
          onclick: () => {
            addReminder('Test alarmı', dtKey(new Date(Date.now() + 5000)));
            toast('5 saniye içinde bildirim gelecek — pencereyi kapatıp deneyebilirsin');
          },
        }),
      ),
      h('button', {
        class: 'btn', style: { marginTop: '10px' }, text: 'Alarm sesini dinle',
        onclick: () => { chime(); toast('Alarm sesi çaldı'); },
      }),
      h('div', { class: 'gcal-help', style: { marginTop: '10px' } },
        'Zamanı gelince ', h('b', { text: 'Windows bildirimi + bildirim sesi' }),
        ' gelir; pencereyi açtığında ekranda alarm kartı da bekler. Bildirimi artık ',
        h('b', { text: 'uygulamanın Rust tarafı' }),
        ' gönderiyor: pencere tepsiye inince Windows, gizli pencerenin zamanlayıcılarını dondurduğu için eskiden bildirim kaçıyordu. Taşınabilir (portable) exe’de de çalışır — uygulama kimliği ilk açılışta kayıt defterine tanıtılıyor.',
      ),
      h('div', { class: 'sub-text', style: { marginTop: '8px' }, text: 'Uygulama tepsideyken de hatırlatıcılar çalışır; pencereyi kapatmak uygulamayı kapatmaz. Bildirim gelmiyorsa: Windows Ayarlar → Sistem → Bildirimler → "Rahatsız etmeyin" kapalı olmalı (tam ekran video/oyun sırasında Windows balonları kendiliğinden gizler).' }),
      h('div', { class: 'sub-text', style: { marginTop: '6px' }, text: 'Tanı: veri klasöründeki bildirim.log dosyası ne zaman ne gönderildiğini yazar. Uygulamayı "Kokpit.exe --bildirim-testi" ile açarsan 30 sn içinde deneme bildirimi gelir.' }),
    ),
  );
  return card;
}

/* -------------------------------------------------------- Google Takvim */

function calendarCard(root: HTMLElement): HTMLElement {
  const d = db();
  const has = !!d.settings.icsUrl.trim();

  const input = h('input', {
    class: 'field__input',
    value: d.settings.icsUrl,
    placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics',
  });

  return h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: 'Google Takvim' }),
      h('div', { class: 'sub-text push', text: has ? `${d.events.length} etkinlik` : 'bağlı değil' }),
    ),
    h('div', { style: { padding: '13px 16px' } },
      h('div', { class: 'gcal-help' },
        'Google Takvim → takvim ayarları → ',
        h('b', { text: 'Gizli adres (iCal biçiminde)' }),
        '. Etkinlikler Kokpit\'e tek yönlü gelir (salt-okunur); Kokpit Google\'a hiçbir şey yazmaz.',
      ),
      h('div', { style: { marginTop: '10px' } }, input),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
        h('button', {
          class: 'btn btn--primary', text: 'Kaydet ve eşitle',
          onclick: async () => {
            store.update((db2) => { db2.settings.icsUrl = input.value.trim(); });
            if (!input.value.trim()) { toast('Takvim adresi temizlendi'); renderSettings(root, null); return; }
            toast('Takvim eşitleniyor…');
            try {
              const sum = await syncGoogleCalendar();
              toast(`${sum.kept} etkinlik alındı · ${sum.calendar}`);
            } catch (err) {
              toast(`Takvim hatası: ${err instanceof Error ? err.message : String(err)}`);
            }
            renderSettings(root, null);
          },
        }),
        h('button', { class: 'btn push', text: 'Takvimi aç', onclick: () => navigate('agenda') }),
      ),
    ),
  );
}

function traktCard(root: HTMLElement): HTMLElement {
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'Trakt içe aktarma' })),
    h('div', { style: { padding: '13px 16px 4px', fontSize: '12px', color: 'var(--dim)', lineHeight: '1.6' } },
      'Trakt.tv → Settings → Data → "Export All" ile indirdiğin klasörü seç. Bölüm izleme geçmişi, puanlar ve filmler İzleme\'ye işlenir. Tekrar çalıştırmak güvenli — mevcut kayıtlar güncellenir, tekrarlanmaz.'),
    h('button', {
      class: 'btn btn--primary', style: { margin: '12px 16px 16px' }, text: 'Klasör seç ve aktar',
      onclick: async () => {
        const dir = await api.pickFolder('Trakt export klasörünü seç');
        if (!dir) return;
        toast('İçe aktarılıyor…');
        try {
          const summary = await importTraktExport(dir);
          await store.flush();
          toast(`Aktarıldı: ${summary.showsAdded} yeni dizi + ${summary.showsUpdated} güncellendi · ${summary.moviesAdded} yeni film + ${summary.moviesUpdated} güncellendi · ${summary.episodesMarked} bölüm`);
        } catch (err) {
          toast(`Hata: ${err instanceof Error ? err.message : String(err)}`);
        }
        renderSettings(root, null);
      },
    }),
  );
  return card;
}

function tmdbCard(root: HTMLElement): HTMLElement {
  const d = db();
  const has = !!d.settings.tmdbApiKey.trim();
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'TMDB · film & dizi arama' })),
  );
  card.append(
    h('div', { class: 'row', style: { gap: '12px', padding: '13px 16px' } },
      h('div', { style: { minWidth: '0' } },
        h('div', { style: { fontSize: '12.5px', fontWeight: '500' }, text: 'API key' }),
        h('div', {
          class: 'mono ellipsis', style: { fontSize: '10px', color: 'var(--dim-3)', marginTop: '3px' },
          text: has ? `bağlı · ****${d.settings.tmdbApiKey.trim().slice(-4)}` : 'ayarlanmadı — themoviedb.org üzerinden ücretsiz alınır',
        }),
      ),
      h('button', {
        class: 'btn btn--mono push', style: { flex: 'none' }, text: has ? 'DEĞİŞTİR' : 'EKLE',
        onclick: async () => {
          const res = await formModal({
            title: 'TMDB API key',
            meta: 'themoviedb.org → ücretsiz hesap aç → Settings → API → "API Key (v3 auth)"',
            fields: [{ kind: 'text', key: 'key', label: 'API key', value: d.settings.tmdbApiKey, span: 2 }],
            saveLabel: 'Kaydet',
          });
          if (!res) return;
          const key = res.key.trim();
          store.update((db2) => { db2.settings.tmdbApiKey = key; });
          toast(key ? 'TMDB key kaydedildi' : 'TMDB key temizlendi');
          renderSettings(root, null);
        },
      }),
    ),
  );
  return card;
}

function dataCard(root: HTMLElement, info: api.DataInfo | null): HTMLElement {
  const d = db();
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'Veri & yedek' })),
  );

  const rows: [string, string, string, () => void][] = [
    ['Veri dosyası', info ? `${info.path} · ${fmtBytes(info.size)}` : 'yükleniyor…', 'KLASÖRÜ AÇ', async () => {
      if (info?.dir) { await api.openPath(info.dir); } else { toast('Klasör bulunamadı'); }
    }],
    ['Obsidian vault', d.settings.vaultPath ? `${d.settings.vaultPath} · ${d.settings.vaultSubdir}` : 'seçilmedi', 'DEĞİŞTİR', async () => {
      const p = await api.pickFolder('Obsidian vault seç');
      if (p) { store.update((db2) => { db2.settings.vaultPath = p; }); toast('Vault yolu güncellendi'); renderSettings(root, info); }
    }],
    ['Otomatik yedek', 'her açılış + her 20 yazım · son 10 tutulur', 'ŞİMDİ AL', async () => {
      await store.flush();
      const f = await api.createBackup();
      toast(f ? `Yedek alındı · ${f}` : 'Yedek alınamadı (Tauri gerekli)');
      renderSettings(root, info);
    }],
    ['Film & dizi verilerini sil', `${d.titles.length} kayıt · Trakt'ı yeniden aktarmak için`, 'SİL', async () => {
      if (!d.titles.length) { toast('Zaten kayıt yok'); return; }
      const ok = await confirmDialog(
        `${d.titles.length} film/dizi kaydının hepsi silinsin mi?`,
        'İzleme verisini sil',
        { detail: 'Puanların, bölüm işaretlerin ve yorumların da gider. Notlar, siber ve hedefler etkilenmez. Önce otomatik yedek alınır.' },
      );
      if (!ok) return;
      await store.flush();
      await api.createBackup();
      const snapshot = d.titles.slice();
      store.update((db2) => { db2.titles = []; });
      toast(`${snapshot.length} kayıt silindi`, () => {
        store.update((db2) => { db2.titles = snapshot; });
        renderSettings(root, info);
      });
      renderSettings(root, info);
    }],
    ['Tüm veriyi sıfırla', 'örnek veriyi geri yükler', 'SIFIRLA', async () => {
      if (!(await confirmDialog('Tüm veriler örnek veriyle değiştirilsin mi?', 'Veriyi sıfırla', { detail: 'İşlemden önce otomatik yedek alınır.' }))) return;
      await store.flush();
      await api.createBackup();
      store.update((db2) => { Object.assign(db2, seedDB()); });
      toast('Örnek veri geri yüklendi');
      renderSettings(root, info);
    }],
    ['Tüm veriyi temizle', 'her şeyi siler (boş başla)', 'TEMİZLE', async () => {
      if (!(await confirmDialog('TÜM veriler silinsin mi?', 'Veriyi temizle', { detail: 'Önce yedek alınır; geri dönüş yalnız yedekten mümkün.' }))) return;
      await store.flush();
      await api.createBackup();
      store.update((db2) => { Object.assign(db2, emptyDB()); });
      toast('Veri temizlendi');
      renderSettings(root, info);
    }],
  ];

  for (const [label, value, btn, action] of rows) {
    card.append(
      h('div', { class: 'row', style: { gap: '12px', padding: '13px 16px', borderBottom: '1px solid var(--line-soft)' } },
        h('div', { style: { minWidth: '0' } },
          h('div', { style: { fontSize: '12.5px', fontWeight: '500' }, text: label }),
          h('div', { class: 'mono ellipsis', style: { fontSize: '10px', color: 'var(--dim-3)', marginTop: '3px' }, text: value }),
        ),
        h('button', { class: 'btn btn--mono push', style: { flex: 'none' }, text: btn, onclick: action }),
      ),
    );
  }
  return card;
}

function backupsCard(root: HTMLElement): HTMLElement {
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'Son yedekler' })),
  );
  const listWrap = h('div');
  card.append(listWrap);

  void api.listBackups().then((backups) => {
    clear(listWrap);
    if (!backups.length) { listWrap.append(h('div', { class: 'empty-state', text: 'Henüz yedek yok (Tauri modunda oluşur).' })); return; }
    for (const b of backups) {
      listWrap.append(
        h('div', { class: 'row', style: { gap: '12px', padding: '11px 16px', borderBottom: '1px solid var(--line-soft)' } },
          h('div', { class: 'mono', style: { fontSize: '11px', color: 'var(--text-2)' }, text: b.file }),
          h('div', { class: 'mono', style: { fontSize: '10px', color: 'var(--dim-3)' }, text: fmtBytes(b.size) }),
          h('button', {
            class: 'mono push', style: { fontSize: '10px', color: 'var(--dim)', background: 'none', cursor: 'pointer' },
            text: 'geri yükle',
            onclick: async () => {
              if (!(await confirmDialog(`${b.file} geri yüklensin mi?`, 'Yedeği geri yükle', { detail: 'Mevcut veri önce yedeklenir.', danger: false, confirmLabel: 'Geri yükle' }))) return;
              try {
                const raw = await api.restoreBackup(b.file);
                store.replace(raw);
                toast('Yedek geri yüklendi');
                renderSettings(root, null);
              } catch (err) { toast(`Hata: ${String(err)}`); }
            },
          }),
        ),
      );
    }
  });
  return card;
}

function themeCard(root: HTMLElement): HTMLElement {
  const d = db();
  const swatches = h('div', { class: 'row', style: { gap: '10px' } });
  for (const [color, name] of ACCENTS) {
    const on = d.settings.accent === color;
    swatches.append(
      h('button', {
        title: name,
        style: {
          width: '34px', height: '34px', borderRadius: 'var(--r-8)', background: color,
          border: on ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer',
        },
        onclick: () => { store.update((db2) => { db2.settings.accent = color; }); store.applyAccent(); toast(`Vurgu rengi: ${name}`); renderSettings(root, null); },
      }),
    );
  }
  const statToggle = h('button', {
    class: `chip${d.settings.showStatStrip ? ' is-on' : ''}`,
    text: d.settings.showStatStrip ? 'İzleme istatistik şeridi: açık' : 'İzleme istatistik şeridi: kapalı',
    onclick: () => { store.update((db2) => { db2.settings.showStatStrip = !db2.settings.showStatStrip; }); renderSettings(root, null); },
  });

  // Her modülün kendi rengi olsun mu — kapatınca her şey vurgu rengine döner.
  const colorToggle = h('button', {
    class: `chip${d.settings.colorfulModules ? ' is-on' : ''}`,
    text: d.settings.colorfulModules ? 'Renkli modüller: açık' : 'Renkli modüller: kapalı (tek renk)',
    onclick: () => {
      store.update((db2) => { db2.settings.colorfulModules = !db2.settings.colorfulModules; });
      store.applyColorMode();
      renderSettings(root, null);
    },
  });

  const moduleColors = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: '10px' } });
  for (const v of VIEWS) {
    moduleColors.append(
      h('div', { class: 'color-pill' },
        h('span', { class: 'color-pill__dot', style: { background: v.color } }),
        h('span', { text: v.label }),
      ),
    );
  }

  return h('div', { class: 'card card--pad' },
    h('div', { class: 'card__title', style: { marginBottom: '12px' }, text: 'Görünüm' }),
    h('div', { class: 'field__label', style: { marginBottom: '8px' }, text: 'Vurgu rengi' }),
    swatches,
    h('div', { class: 'row', style: { marginTop: '14px', gap: '8px', flexWrap: 'wrap' } }, colorToggle, statToggle),
    d.settings.colorfulModules ? moduleColors : null,
    h('div', { class: 'sub-text', style: { marginTop: '12px' }, text: 'Renk/tipografi değişiklikleri styles/tokens.css üzerinden de yapılabilir.' }),
  );
}

function hotkeysCard(): HTMLElement {
  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', { class: 'card__title', text: 'Kısayollar' })),
  );
  for (const [key, desc] of HOTKEYS) {
    card.append(
      h('div', { class: 'row', style: { gap: '12px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)' } },
        h('div', { class: 'mono', style: { fontSize: '11px', color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--r-5)', padding: '3px 8px', minWidth: '84px', textAlign: 'center' }, text: key }),
        h('div', { style: { fontSize: '12.5px', color: 'var(--dim)' }, text: desc }),
      ),
    );
  }
  return card;
}

function exportCard(root: HTMLElement): HTMLElement {
  const d = db();
  const files = [
    ['Izlediklerim.md', `${d.titles.length} kayıt`],
    ['Siber Ilerleme.md', `${d.tasks.length} görev · ${d.labs.length} lab`],
    ['Aliskanliklar.md', `${d.habits.filter((x) => !x.archived).length} alışkanlık · ${d.goals.length} hedef`],
    ['Sayfalar.md', `${d.pages.filter((x) => !x.archived).length} sayfa · iç içe yapı korunur`],
  ];
  const fileList = h('div', { class: 'col', style: { gap: '8px' } });
  for (const [name, meta] of files) {
    fileList.append(
      h('div', { class: 'row', style: { gap: '10px', padding: '9px 12px', background: 'var(--input-bg)', border: '1px solid var(--line)', borderRadius: 'var(--r-6)' } },
        h('div', { class: 'mono', style: { fontSize: '11.5px', color: 'var(--accent-soft)' }, text: name }),
        h('div', { class: 'mono push', style: { fontSize: '10px', color: 'var(--dim-3)' }, text: meta }),
      ),
    );
  }

  return h('div', { class: 'card card--pad' },
    h('div', { class: 'card__title', style: { marginBottom: '6px' }, text: 'Obsidian export' }),
    h('div', { style: { fontSize: '12px', color: 'var(--dim)', lineHeight: '1.7', marginBottom: '14px' } },
      'Vault içindeki ', h('span', { class: 'mono', style: { color: 'var(--text-2)' }, text: d.settings.vaultSubdir }),
      ' klasörüne yazılır. Elle yazdığın notlara dokunulmaz.'),
    fileList,
    h('div', { class: 'row', style: { gap: '8px', marginTop: '14px' } },
      h('button', { class: 'btn btn--primary', style: { flex: '1', justifyContent: 'center' }, text: "Obsidian'a yaz", onclick: () => void runExport().then(() => renderSettings(root, null)) }),
      h('button', { class: 'btn', text: 'CSV', onclick: () => void exportCsv() }),
      h('button', { class: 'btn', text: 'JSON', onclick: () => void exportJson() }),
    ),
    d.settings.lastExportAt
      ? h('div', { class: 'mono', style: { fontSize: '10px', color: 'var(--dim-4)', marginTop: '10px' }, text: `son export: ${new Date(d.settings.lastExportAt).toLocaleString('tr-TR')}` })
      : null,
  );
}
