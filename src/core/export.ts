/** Obsidian vault'a markdown export + CSV dışa aktarma. */

import { store, db } from './store';
import * as api from './api';
import { toast } from '../ui/overlay';
import { STATUS_LABEL, Page } from './model';
import { blocksToMarkdown } from './blocks';
import { nowISO, dayKey, shortDate, longDate, streak, bestStreak, habitDays } from './util';

function frontmatter(title: string): string {
  return `---\ntur: kokpit-export\nbaslik: ${title}\nkaynak: Kokpit\nguncelleme: ${dayKey()}\n---\n\n`;
}

export function buildWatchMd(): string {
  const d = db();
  let md = frontmatter('İzlediklerim') + `# İzlediklerim\n\n`;
  const order: (keyof typeof STATUS_LABEL)[] = ['active', 'planned', 'done', 'dropped'];
  for (const st of order) {
    const items = d.titles.filter((t) => t.status === st);
    if (!items.length) continue;
    md += `## ${STATUS_LABEL[st]} (${items.length})\n\n`;
    md += `| Ad | Tür | Yıl | Puan | Kiminle | Tarih |\n|---|---|---|---|---|---|\n`;
    for (const t of items) {
      md += `| ${t.name} | ${t.kind} | ${t.year || '—'} | ${t.rating ?? '—'} | ${t.withWho.join(', ') || 'tek'} | ${shortDate(t.watchedAt)} |\n`;
    }
    md += `\n`;
  }
  return md;
}

export function buildHabitsMd(): string {
  const d = db();
  let md = frontmatter('Alışkanlıklar') + `# Alışkanlıklar & Hedefler\n\n`;
  md += `_${longDate()}_\n\n## Alışkanlıklar\n\n| Alışkanlık | Sıklık | Mevcut seri | En uzun |\n|---|---|---|---|\n`;
  for (const hb of d.habits.filter((x) => !x.archived)) {
    const days = habitDays(d.habitLogs, hb.id);
    md += `| ${hb.name} | ${hb.cadence} | ${streak(days)}g | ${bestStreak(days)}g |\n`;
  }
  md += `\n## Hedefler\n\n`;
  for (const g of d.goals.filter((x) => x.status !== 'dropped')) {
    const done = g.milestones.filter((m) => m.done).length;
    md += `### ${g.title}${g.targetDate ? ` (${shortDate(g.targetDate)})` : ''}\n\n`;
    for (const m of g.milestones) md += `- [${m.done ? 'x' : ' '}] ${m.text}\n`;
    md += `\n_${done}/${g.milestones.length} tamam_\n\n`;
  }
  return md;
}

/** Ana export akışı — Obsidian'a yaz. */
/**
 * Sayfalar → tek markdown dosyası. Blok yapısı markdown'a çevrilebildiği için
 * Obsidian'da düz not olarak okunur; iç içe sayfalar başlık girintisiyle,
 * bağlantılar `[[…]]` olarak korunur.
 */
export function buildPagesMd(): string {
  const d = db();
  let md = frontmatter('Kokpit Sayfaları') + `# Kokpit Sayfaları

`;

  const write = (p: Page, depth: number): void => {
    const hashes = '#'.repeat(Math.min(6, depth + 2));
    md += `${hashes} ${p.icon ? p.icon + ' ' : ''}${p.title || 'Başlıksız'}

`;
    const meta: string[] = [];
    if (p.favorite) meta.push('⭐ favori');
    if (p.category) meta.push(p.category);
    if (p.tags.length) meta.push(p.tags.map((t) => `#${t}`).join(' '));
    for (const prop of p.props) if (prop.value) meta.push(`${prop.key}: ${prop.value}`);
    if (meta.length) md += `_${meta.join(' · ')}_

`;
    const body = blocksToMarkdown(p.blocks).trim();
    if (body) md += `${body}

`;
    for (const child of d.pages.filter((x) => x.parentId === p.id && !x.archived)) write(child, depth + 1);
  };

  for (const p of d.pages.filter((x) => !x.parentId && !x.archived)) write(p, 0);

  const archived = d.pages.filter((x) => x.archived);
  if (archived.length) {
    md += `## Arşiv (${archived.length})

`;
    for (const p of archived) md += `- ${p.title || 'Başlıksız'}
`;
  }
  return md;
}

export async function runExport(): Promise<void> {
  const d = db();
  await store.flush();

  if (!api.isTauri()) {
    // Tarayıcı modunda dosya yazamayız; markdown'ı panoya kopyala.
    const text = [buildWatchMd(), buildHabitsMd(), buildPagesMd()].join('\n\n---\n\n');
    await navigator.clipboard.writeText(text).catch(() => {});
    toast('Tarayıcı modu: markdown panoya kopyalandı');
    return;
  }

  let vault = d.settings.vaultPath;
  if (!vault) {
    vault = (await api.pickFolder('Obsidian vault klasörünü seç')) ?? '';
    if (!vault) { toast('Vault seçilmedi'); return; }
    store.update((db2) => { db2.settings.vaultPath = vault; });
  }

  try {
    const files = [
      { name: 'Izlediklerim.md', content: buildWatchMd() },
      { name: 'Aliskanliklar.md', content: buildHabitsMd() },
      { name: 'Sayfalar.md', content: buildPagesMd() },
    ];
    const written = await api.exportVault(vault, d.settings.vaultSubdir, files);
    store.update((db2) => { db2.settings.lastExportAt = nowISO(); });
    toast(`Obsidian export tamam · ${written.length} dosya yazıldı`);
  } catch (err) {
    toast(`Export hatası: ${String(err)}`);
  }
}

function csvCell(s: string | number): string {
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildTitlesCsv(): string {
  const rows = [['ad', 'tur', 'yil', 'durum', 'puan', 'etiketler', 'kiminle', 'tarih', 'yorum']];
  for (const t of db().titles) {
    rows.push([t.name, t.kind, String(t.year ?? ''), STATUS_LABEL[t.status], String(t.rating ?? ''), t.genres.join('; '), t.withWho.join('; '), t.watchedAt, t.review]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Ayarlar'dan CSV dışa aktar. */
export async function exportCsv(): Promise<void> {
  await store.flush();
  if (!api.isTauri()) {
    await navigator.clipboard.writeText(buildTitlesCsv()).catch(() => {});
    toast('Tarayıcı modu: izleme CSV panoya kopyalandı');
    return;
  }
  const dir = await api.pickFolder('CSV klasörünü seç');
  if (!dir) return;
  const written = await api.writeFiles(dir, [
    { name: 'kokpit-izleme.csv', content: buildTitlesCsv() },
  ]);
  toast(`${written.length} CSV dosyası yazıldı`);
}

/** Tam JSON yedeği dışa aktar. */
export async function exportJson(): Promise<void> {
  await store.flush();
  const content = JSON.stringify(db(), null, 2);
  if (!api.isTauri()) {
    await navigator.clipboard.writeText(content).catch(() => {});
    toast('Tarayıcı modu: JSON panoya kopyalandı');
    return;
  }
  const dir = await api.pickFolder('Yedek klasörü seç');
  if (!dir) return;
  await api.writeFiles(dir, [{ name: `kokpit-yedek-${dayKey()}.json`, content }]);
  toast('JSON yedek yazıldı');
}
