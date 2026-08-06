/**
 * Sayfa işlemleri — ağaç, ilişkiler, geri bağlantılar, arama.
 *
 * Sayfalar düz bir dizide durur; iç içe yapı `parentId` ile kurulur. Böylece
 * derinlik sınırsızdır ve bir sayfayı taşımak tek alan değiştirmek demektir.
 */

import { store, db } from './store';
import { Page, PageProp, emptyPage } from './model';
import { Block, blocksPlain, plainText, walk, newBlock } from './blocks';
import { uid, nowISO } from './util';

export const UNTITLED = 'Başlıksız';

export function pageById(id: string): Page | undefined {
  return db().pages.find((p) => p.id === id);
}

export function pageTitle(p: Page | undefined): string {
  return p?.title.trim() || UNTITLED;
}

/** Bir sayfanın doğrudan alt sayfaları (oluşturma sırasına göre). */
export function childrenOf(parentId: string, includeArchived = false): Page[] {
  return db().pages
    .filter((p) => p.parentId === parentId && (includeArchived || !p.archived))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Kökten sayfaya kadar olan yol (ekmek kırıntısı). */
export function breadcrumb(id: string): Page[] {
  const out: Page[] = [];
  const seen = new Set<string>();
  let cur = pageById(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? pageById(cur.parentId) : undefined;
  }
  return out;
}

/** Sayfa ve tüm torunlarının id'leri. */
export function descendantIds(id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of db().pages) {
      if (p.parentId === cur) { out.push(p.id); stack.push(p.id); }
    }
  }
  return out;
}

/* --------------------------------------------------------------- yazma */

export function createPage(parentId = '', title = '', blocks?: Block[]): string {
  const now = nowISO();
  const id = uid('page');
  store.update((d) => {
    const p = emptyPage(id, now, parentId);
    p.title = title;
    p.blocks = blocks ?? [newBlock('text')];
    d.pages.push(p);
  });
  return id;
}

export function updatePage(id: string, fn: (p: Page) => void, quiet = false): void {
  const apply = (d: ReturnType<typeof db>) => {
    const p = d.pages.find((x) => x.id === id);
    if (!p) return;
    fn(p);
    p.updatedAt = nowISO();
  };
  if (quiet) store.updateQuiet(apply);
  else store.update(apply);
}

/** Sayfayı ve tüm alt sayfalarını siler; geri alınabilsin diye kopyasını döner. */
export function deletePage(id: string): Page[] {
  const ids = new Set([id, ...descendantIds(id)]);
  const removed = db().pages.filter((p) => ids.has(p.id)).map((p) => JSON.parse(JSON.stringify(p)) as Page);
  store.update((d) => {
    d.pages = d.pages.filter((p) => !ids.has(p.id));
    // Kopan ilişkileri temizle.
    for (const p of d.pages) p.relations = p.relations.filter((r) => !ids.has(r));
  });
  return removed;
}

export function restorePages(pages: Page[]): void {
  store.update((d) => { d.pages.push(...pages); });
}

/** Arşive at / arşivden çıkar (alt sayfalar da birlikte gider). */
export function setArchived(id: string, archived: boolean): void {
  const ids = new Set([id, ...descendantIds(id)]);
  store.update((d) => {
    for (const p of d.pages) if (ids.has(p.id)) { p.archived = archived; p.updatedAt = nowISO(); }
  });
}

/** Sayfayı başka bir sayfanın altına taşır. Kendi torununun altına taşımaz. */
export function movePage(id: string, newParent: string): boolean {
  if (id === newParent) return false;
  if (newParent && descendantIds(id).includes(newParent)) return false;
  updatePage(id, (p) => { p.parentId = newParent; });
  return true;
}

/* ------------------------------------------------------------ ilişkiler */

/** İlişki çift yönlü tutulur: iki sayfa da diğerini görür. */
export function toggleRelation(a: string, b: string): void {
  if (a === b) return;
  store.update((d) => {
    const pa = d.pages.find((p) => p.id === a);
    const pb = d.pages.find((p) => p.id === b);
    if (!pa || !pb) return;
    const on = pa.relations.includes(b);
    pa.relations = on ? pa.relations.filter((x) => x !== b) : [...pa.relations, b];
    pb.relations = on ? pb.relations.filter((x) => x !== a) : [...pb.relations, a];
    pa.updatedAt = nowISO();
    pb.updatedAt = nowISO();
  });
}

export function relatedPages(id: string): Page[] {
  const p = pageById(id);
  if (!p) return [];
  return p.relations.map(pageById).filter((x): x is Page => !!x && !x.archived);
}

/* --------------------------------------------------------- geri bağlantı */

export interface Backlink {
  page: Page;
  /** Bağlantının geçtiği blok metni (bağlam). */
  context: string;
}

/**
 * Bu sayfaya bağlantı veren sayfalar. İki kaynak sayılır:
 *  - gövdedeki `[[Sayfa Adı]]` bağlantıları
 *  - alt sayfa blokları (`subpage`)
 */
export function backlinks(id: string): Backlink[] {
  const target = pageById(id);
  if (!target) return [];
  const name = pageTitle(target).toLowerCase();
  const out: Backlink[] = [];

  for (const p of db().pages) {
    if (p.id === id || p.archived) continue;
    let hit = '';
    walk(p.blocks, (b) => {
      if (hit) return;
      if (b.type === 'subpage' && b.meta === id) { hit = pageTitle(target); return; }
      for (const m of b.text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (m[1].trim().toLowerCase() === name) { hit = plainText(b.text); return; }
      }
    });
    if (hit) out.push({ page: p, context: hit });
  }
  return out;
}

/** `[[Ad]]` yazılan sayfayı bulur; yoksa oluşturur (Notion'daki gibi). */
export function resolveWikilink(name: string, parentId = ''): string {
  const target = name.trim().toLowerCase();
  const hit = db().pages.find((p) => pageTitle(p).toLowerCase() === target);
  if (hit) return hit.id;
  return createPage(parentId, name.trim());
}

/* -------------------------------------------------------------- arama */

export interface PageHit {
  page: Page;
  /** Eşleşmenin nerede olduğu: başlık / içerik / etiket. */
  where: 'başlık' | 'içerik' | 'etiket';
  excerpt: string;
}

export function searchPages(query: string, includeArchived = false): PageHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: PageHit[] = [];
  for (const p of db().pages) {
    if (!includeArchived && p.archived) continue;
    if (pageTitle(p).toLowerCase().includes(q)) {
      out.push({ page: p, where: 'başlık', excerpt: excerptOf(p) });
      continue;
    }
    if (p.tags.some((t) => t.toLowerCase().includes(q)) || p.category.toLowerCase().includes(q)) {
      out.push({ page: p, where: 'etiket', excerpt: p.tags.join(' · ') });
      continue;
    }
    const body = blocksPlain(p.blocks);
    const at = body.toLowerCase().indexOf(q);
    if (at >= 0) {
      out.push({ page: p, where: 'içerik', excerpt: body.slice(Math.max(0, at - 30), at + 70).replace(/\n/g, ' ') });
    }
  }
  return out;
}

/** Sayfanın ilk dolu bloğundan kısa özet. */
export function excerptOf(p: Page): string {
  for (const b of p.blocks) {
    const t = plainText(b.text);
    if (t) return t.slice(0, 90);
  }
  return '';
}

/** Sayfadaki yapılacakların durumu (liste rozeti ve ilerleme çubuğu için). */
export function todoProgress(p: Page): { done: number; total: number } {
  let done = 0;
  let total = 0;
  walk(p.blocks, (b) => {
    if (b.type !== 'todo') return;
    total++;
    if (b.checked) done++;
  });
  return { done, total };
}

/* ------------------------------------------------------------ özellikler */

export function propValue(p: Page, key: string): string {
  return p.props.find((x) => x.key.toLowerCase() === key.toLowerCase())?.value ?? '';
}

export function newProp(key = 'Özellik'): PageProp {
  return { id: uid('prop'), key, type: 'metin', value: '' };
}

/** Bir veritabanının sütunları: alt sayfalarda geçen tüm özellik adları. */
export function dbColumns(parentId: string): string[] {
  const seen: string[] = [];
  for (const child of childrenOf(parentId)) {
    for (const prop of child.props) if (!seen.includes(prop.key)) seen.push(prop.key);
  }
  return seen;
}
