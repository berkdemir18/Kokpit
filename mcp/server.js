#!/usr/bin/env node
/**
 * Kokpit MCP sunucusu — SALT OKUNUR.
 *
 * Kokpit'in veri dosyasini (data.json) okuyup Berk'in film/dizi takibini,
 * notlarini, siber guvenlik yol haritasini, hedeflerini ve ajandasini
 * yapay zeka asistanlarina arac olarak acar. Hicbir arac veriyi degistirmez.
 *
 * Calistirma:  node server.js           (stdio)
 * Veri yolu:   KOKPIT_DATA ortam degiskeniyle degistirilebilir.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadDB, DEFAULT_DATA_PATH } from './lib/data.js';
import {
  statusLabel, resStatusLabel, toDate, todayISO, matches, fold,
  blocksToMarkdown, pageText, titleLine, seriesProgress, nextEpisode,
  epCode, capped, section, joinSections,
} from './lib/format.js';

const server = new McpServer(
  { name: 'kokpit', version: '1.0.0' },
  {
    instructions:
      'Kokpit, Berk\'in masaustu takip uygulamasidir. Bu sunucu onun verisini ' +
      'salt-okunur sunar: izledigi/izleyecegi film ve diziler (bolum bazinda), ' +
      'Notion tarzi notlari/sayfalari, siber guvenlik yol haritasi ve calisma ' +
      'kayitlari, hedef/aliskanliklari, hatirlaticilari ve takvimi. ' +
      'Berk hakkinda "ne izliyor", "nerede kalmis", "ne yazmis", "hangi gorev ' +
      'sirada" gibi sorularda once kokpit_ozet cagir, sonra ilgili detay aracina in. ' +
      'Veriyi degistiren arac yoktur; degisiklik gerekiyorsa Berk uygulamadan yapar.',
  }
);

const dataPath = () => process.env.KOKPIT_DATA || DEFAULT_DATA_PATH;
const text = (s) => ({ content: [{ type: 'text', text: s || '(kayıt yok)' }] });
const fail = (s) => ({ content: [{ type: 'text', text: s }], isError: true });

/** Her aracta ayni hata sarmalayicisi: veri okunamazsa aciklayici mesaj. */
function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      const db = await loadDB(dataPath());
      return await handler(args ?? {}, db);
    } catch (err) {
      return fail(`Kokpit verisi okunamadı: ${err.message}`);
    }
  });
}

/* ------------------------------------------------------------------- ozet */

tool(
  'kokpit_ozet',
  {
    title: 'Kokpit özeti',
    description:
      'Kokpit\'in genel durumu: izlenen/izlenecek sayıları, şu an izlenen diziler ve ' +
      'kalınan bölüm, siber yol haritası ilerlemesi, açık hedefler, yaklaşan ' +
      'hatırlatıcılar ve son güncellenen notlar. Kokpit ile ilgili her soruda ilk buraya bak.',
    inputSchema: {},
  },
  async (_a, db) => {
    const t = db.titles;
    const izleniyor = t.filter((x) => x.status === 'active');
    const done = t.filter((x) => x.status === 'done');
    const planned = t.filter((x) => x.status === 'planned');
    const yil = todayISO().slice(0, 4);
    const buYil = done.filter((x) => (x.watchedAt || '').startsWith(yil));

    const izlemeSat = izleniyor
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map((x) => {
        const p = seriesProgress(x);
        const nx = nextEpisode(x);
        const kald = nx ? `sırada ${epCode(nx)}${nx.name ? ` — ${nx.name}` : ''}`
          : p.total ? 'tüm bölümler izlendi' : `S${x.season}B${x.episode}`;
        return `- ${x.name}${x.year ? ` (${x.year})` : ''} · ${p.total ? `${p.watched}/${p.total} (%${p.pct})` : '—'} · ${kald}`;
      });

    const doneTask = db.tasks.filter((x) => x.done).length;
    const faz = [...db.phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const fazSat = faz.map((f) => {
      const gs = db.tasks.filter((x) => x.phaseId === f.id);
      const d = gs.filter((x) => x.done).length;
      return `- ${f.code} ${f.title} — ${d}/${gs.length}${f.when ? ` · ${f.when}` : ''}`;
    });

    const bugun = todayISO();
    const yaklasan = db.reminders
      .filter((r) => !r.done && (r.at || '') >= bugun)
      .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
      .slice(0, 5)
      .map((r) => `- ${r.at.replace('T', ' ')} · ${r.title}`);

    const sonNotlar = [...db.pages]
      .filter((p) => !p.archived)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 6)
      .map((p) => `- ${p.title || '(başlıksız)'}${p.category ? ` · ${p.category}` : ''}${p.tags.length ? ` · #${p.tags.join(' #')}` : ''} · ${(p.updatedAt || '').slice(0, 10)}`);

    const hedef = db.goals.filter((g) => g.status !== 'done' && g.status !== 'dropped')
      .map((g) => {
        const m = g.milestones ?? [];
        return `- ${g.title} (${resStatusLabel(g.status)}${m.length ? `, ${m.filter((x) => x.done).length}/${m.length} kilometre taşı` : ''}${g.targetDate ? `, hedef ${g.targetDate}` : ''})`;
      });

    return text(joinSections(
      `# Kokpit özeti (${db._meta.updatedAt.slice(0, 16).replace('T', ' ')} itibarıyla)`,
      section('İzleme',
        `Toplam ${t.length} kayıt · ${t.filter((x) => x.kind === 'film').length} film, ${t.filter((x) => x.kind === 'dizi').length} dizi\n` +
        `İzlendi ${done.length} (bu yıl ${buYil.length}) · İzleniyor ${izleniyor.length} · İzlenecek ${planned.length} · Bıraktım ${t.filter((x) => x.status === 'dropped').length}` +
        (izlemeSat.length ? `\n\n**Şu an izlenenler:**\n${capped(izlemeSat, 12)}` : '')),
      section('Siber yol haritası', `${doneTask}/${db.tasks.length} görev tamam\n${fazSat.join('\n')}`),
      section('Hedefler', hedef.join('\n')),
      section('Alışkanlıklar', db.habits.filter((h) => !h.archived)
        .map((h) => `- ${h.name} (${h.cadence}, hafta hedefi ${h.targetPerWeek}, toplam ${(db.habitLogs[h.id] ?? []).length} gün)`).join('\n')),
      section('Yaklaşan hatırlatıcılar', yaklasan.join('\n')),
      section('Son güncellenen notlar', sonNotlar.join('\n')),
      section('Kaynak', `${db._meta.path} · şema v${db._meta.schema} · ${db._meta.sizeKb} KB`)
    ));
  }
);

/* ----------------------------------------------------------------- izleme */

tool(
  'izleme_ara',
  {
    title: 'Film/dizi ara',
    description:
      'Kokpit\'teki film ve dizileri filtreleyerek listeler. İsim/tür/etiket araması, ' +
      'durum (izlenecek/izleniyor/izlendi/bıraktım), tür (film/dizi), puan ve yıl ' +
      'filtreleri; sıralama seçilebilir. "Ne izlemişim", "izlenecekler listesi", ' +
      '"en beğendiklerim" gibi sorular için.',
    inputSchema: {
      sorgu: z.string().optional().describe('İsim, tür veya etiket içinde geçen metin'),
      tur: z.enum(['film', 'dizi']).optional().describe('Sadece film ya da sadece dizi'),
      durum: z.enum(['planned', 'active', 'done', 'dropped']).optional()
        .describe('planned=izlenecek, active=izleniyor, done=izlendi, dropped=bıraktım'),
      etiket: z.string().optional().describe('Belirli bir etiket (tam eşleşme)'),
      min_puan: z.number().min(1).max(10).optional().describe('Bu puandan düşükleri ele'),
      yil: z.number().optional().describe('Yapım yılı'),
      izlenme_yili: z.string().optional().describe('İzlenme yılı, örn "2026"'),
      sirala: z.enum(['guncel', 'puan', 'ad', 'yil', 'izlenme']).default('guncel')
        .describe('guncel=son değişen, puan=yüksekten, ad=A-Z, yil=yeniden, izlenme=son izlenen'),
      limit: z.number().min(1).max(200).default(40),
    },
  },
  async (a, db) => {
    let list = db.titles.filter((t) => {
      if (a.tur && t.kind !== a.tur) return false;
      if (a.durum && t.status !== a.durum) return false;
      if (a.etiket && !(t.tags ?? []).some((x) => fold(x) === fold(a.etiket))) return false;
      if (a.min_puan && !(t.rating >= a.min_puan)) return false;
      if (a.yil && t.year !== a.yil) return false;
      if (a.izlenme_yili && !(t.watchedAt || '').startsWith(a.izlenme_yili)) return false;
      return matches(a.sorgu, t.name, (t.genres ?? []).join(' '), (t.tags ?? []).join(' '), t.review);
    });

    const cmp = {
      guncel: (x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''),
      puan: (x, y) => (y.rating ?? 0) - (x.rating ?? 0),
      ad: (x, y) => x.name.localeCompare(y.name, 'tr'),
      yil: (x, y) => (y.year ?? 0) - (x.year ?? 0),
      izlenme: (x, y) => (y.watchedAt || '').localeCompare(x.watchedAt || ''),
    }[a.sirala ?? 'guncel'];
    list = list.sort(cmp);

    const head = `${list.length} kayıt bulundu` +
      (list.length > (a.limit ?? 40) ? ` (ilk ${a.limit ?? 40} gösteriliyor)` : '');
    return text(`${head}\n\n${capped(list.map((t) => `- ${titleLine(t)}`), a.limit ?? 40)}`);
  }
);

tool(
  'izleme_detay',
  {
    title: 'Film/dizi detayı',
    description:
      'Tek bir film/dizinin tüm bilgisi: puan, durum, tür, yorum, kiminle izlendi, ' +
      'etiketler ve dizilerde sezon sezon bölüm listesi (izlendi mi, ne zaman, puanı). ' +
      '"X dizisinde nerede kaldım", "Y filmine kaç vermiş" gibi sorular için.',
    inputSchema: {
      id: z.string().optional().describe('Kayıt id\'si (izleme_ara çıktısındaki [id: ...])'),
      ad: z.string().optional().describe('id yoksa isimden bulunur (kısmi eşleşme)'),
      bolumler: z.enum(['ozet', 'hepsi', 'izlenmeyen']).default('ozet')
        .describe('ozet=sezon başına sayı, hepsi=tüm bölümler, izlenmeyen=sadece izlenmemişler'),
    },
  },
  async (a, db) => {
    const t = a.id
      ? db.titles.find((x) => x.id === a.id)
      : db.titles.find((x) => fold(x.name) === fold(a.ad ?? '')) ??
        db.titles.find((x) => matches(a.ad, x.name));
    if (!t) return fail(`Kayıt bulunamadı: ${a.id || a.ad || '(ölçüt verilmedi)'}`);

    const bilgi = [
      `**${t.name}**${t.year ? ` (${t.year})` : ''} — ${t.kind === 'dizi' ? 'dizi' : 'film'}`,
      `Durum: ${statusLabel(t.status)}`,
      `Puan: ${t.rating ? `${t.rating}/10` : '—'}`,
      t.genres?.length ? `Tür: ${t.genres.join(', ')}` : '',
      t.watchedAt ? `İzlenme: ${t.watchedAt}` : '',
      t.withWho?.length ? `Kiminle: ${t.withWho.join(', ')}` : '',
      t.tags?.length ? `Etiket: ${t.tags.join(', ')}` : '',
      t.review ? `Yorum: ${t.review}` : '',
      `id: ${t.id}${t.tmdbId ? ` · tmdb: ${t.tmdbId}` : ''}`,
    ].filter(Boolean).join('\n');

    if (t.kind !== 'dizi' || !(t.episodes ?? []).length) {
      const el = t.kind === 'dizi' ? `\n\nBölüm listesi çekilmemiş (elle takip: S${t.season}B${t.episode}).` : '';
      return text(bilgi + el);
    }

    const p = seriesProgress(t);
    const nx = nextEpisode(t);
    const eps = [...t.episodes].sort((x, y) => x.season - y.season || x.number - y.number);

    let body;
    if ((a.bolumler ?? 'ozet') === 'ozet') {
      const bySeason = new Map();
      for (const e of eps) {
        const s = bySeason.get(e.season) ?? { t: 0, w: 0 };
        s.t++; if (e.watched) s.w++;
        bySeason.set(e.season, s);
      }
      body = [...bySeason.entries()].sort((x, y) => x[0] - y[0])
        .map(([s, v]) => `- Sezon ${s}: ${v.w}/${v.t}${v.w === v.t ? ' ✓' : ''}`).join('\n');
    } else {
      const src = a.bolumler === 'izlenmeyen' ? eps.filter((e) => !e.watched) : eps;
      body = capped(src.map((e) =>
        `- ${epCode(e)} ${e.name || ''}${e.watched ? ` ✓${e.watchedAt ? ` ${e.watchedAt}` : ''}` : ' ·'}` +
        `${e.rating ? ` ${e.rating}/10` : ''}${e.comment ? ` — ${e.comment}` : ''}`.trimEnd()), 400);
    }

    return text(joinSections(
      bilgi,
      `İlerleme: ${p.watched}/${p.total} bölüm (%${p.pct})` +
      (nx ? `\nSırada: ${epCode(nx)}${nx.name ? ` — ${nx.name}` : ''}${nx.airDate ? ` (${nx.airDate})` : ''}` : '\nTüm bölümler izlendi.'),
      section('Bölümler', body)
    ));
  }
);

tool(
  'izleme_istatistik',
  {
    title: 'İzleme istatistiği',
    description:
      'İzleme alışkanlığının sayısal özeti: yıl/ay dağılımı, en çok izlenen türler, ' +
      'puan dağılımı ve ortalaması, en yüksek puan verilenler, izlenen toplam bölüm sayısı.',
    inputSchema: {
      yil: z.string().optional().describe('Sadece bu izlenme yılı, örn "2026". Boşsa tüm zamanlar.'),
    },
  },
  async (a, db) => {
    const all = db.titles;
    const inYear = (t) => !a.yil || (t.watchedAt || '').startsWith(a.yil);
    const done = all.filter((t) => t.status === 'done' && inYear(t));

    const byMonth = new Map();
    for (const t of done) {
      const m = (t.watchedAt || '').slice(0, 7);
      if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    }
    const byGenre = new Map();
    for (const t of done) for (const g of t.genres ?? []) byGenre.set(g, (byGenre.get(g) ?? 0) + 1);

    const rated = all.filter((t) => t.rating && inYear(t));
    const avg = rated.length ? (rated.reduce((s, t) => s + t.rating, 0) / rated.length).toFixed(2) : '—';
    const dist = new Map();
    for (const t of rated) dist.set(t.rating, (dist.get(t.rating) ?? 0) + 1);

    let epWatched = 0, epTotal = 0;
    for (const t of all) for (const e of t.episodes ?? []) { epTotal++; if (e.watched) epWatched++; }

    const top = [...rated].sort((x, y) => y.rating - x.rating || (y.watchedAt || '').localeCompare(x.watchedAt || ''))
      .slice(0, 12).map((t) => `- ${t.rating}/10 · ${t.name}${t.year ? ` (${t.year})` : ''}`);

    return text(joinSections(
      `# İzleme istatistiği${a.yil ? ` — ${a.yil}` : ' — tüm zamanlar'}`,
      section('Sayılar',
        `İzlendi: ${done.length} (${done.filter((t) => t.kind === 'film').length} film, ${done.filter((t) => t.kind === 'dizi').length} dizi)\n` +
        `İzlenecek: ${all.filter((t) => t.status === 'planned').length} · İzleniyor: ${all.filter((t) => t.status === 'active').length} · Bıraktım: ${all.filter((t) => t.status === 'dropped').length}\n` +
        `Bölüm: ${epWatched}/${epTotal} izlendi\n` +
        `Yıllık hedef: ${db.settings.yearlyWatchTarget ?? '—'}`),
      section('Aylara göre', [...byMonth.entries()].sort((x, y) => y[0].localeCompare(x[0])).slice(0, 18)
        .map(([m, n]) => `- ${m}: ${n}`).join('\n')),
      section('Türler', [...byGenre.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15)
        .map(([g, n]) => `- ${g}: ${n}`).join('\n')),
      section('Puanlar', `Ortalama: ${avg} (${rated.length} puanlı kayıt)\n` +
        [...dist.entries()].sort((x, y) => y[0] - x[0]).map(([r, n]) => `- ${r}/10: ${n}`).join('\n')),
      section('En yüksek puanlılar', top.join('\n'))
    ));
  }
);

/* ------------------------------------------------------------------ notlar */

tool(
  'notlar_ara',
  {
    title: 'Not/sayfa ara',
    description:
      'Kokpit\'teki notları (v0.8\'den sonra "sayfa") başlık, gövde, etiket ve ' +
      'kategoriye göre arar; eşleşen satırdan kısa alıntı gösterir. Not içeriğinin ' +
      'tamamı için not_oku kullan.',
    inputSchema: {
      sorgu: z.string().optional().describe('Başlık ve gövdede aranacak metin'),
      etiket: z.string().optional(),
      kategori: z.string().optional().describe('Örn "Gelen Kutusu"'),
      sadece_favori: z.boolean().default(false),
      arsivi_dahil_et: z.boolean().default(false),
      limit: z.number().min(1).max(100).default(25),
    },
  },
  async (a, db) => {
    const byId = new Map(db.pages.map((p) => [p.id, p]));
    let list = db.pages.filter((p) => {
      if (!a.arsivi_dahil_et && p.archived) return false;
      if (a.sadece_favori && !p.favorite) return false;
      if (a.etiket && !p.tags.some((x) => fold(x) === fold(a.etiket))) return false;
      if (a.kategori && fold(p.category) !== fold(a.kategori)) return false;
      return matches(a.sorgu, p.title, pageText(p, byId), p.tags.join(' '), p.category);
    }).sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''));

    const lines = list.map((p) => {
      const meta = [p.category, p.tags.length ? `#${p.tags.join(' #')}` : '', (p.updatedAt || '').slice(0, 10)]
        .filter(Boolean).join(' · ');
      const parent = p.parentId ? ` ↳ üst: ${byId.get(p.parentId)?.title || p.parentId}` : '';
      let out = `- ${p.icon ? p.icon + ' ' : ''}${p.title || '(başlıksız)'}${p.favorite ? ' ★' : ''}${meta ? ` — ${meta}` : ''}${parent}  [id: ${p.id}]`;
      if (a.sorgu) {
        const hit = pageText(p, byId).split('\n').find((l) => matches(a.sorgu, l));
        if (hit) out += `\n    › ${hit.trim().slice(0, 160)}`;
      }
      return out;
    });

    return text(`${list.length} not bulundu\n\n${capped(lines, a.limit ?? 25)}`);
  }
);

tool(
  'not_oku',
  {
    title: 'Notu oku',
    description:
      'Bir notun/sayfanın tam içeriğini markdown olarak döner: bloklar, yapılacaklar ' +
      '(işaretli/işaretsiz), tablolar, kod blokları, özellikler, ilişkiler ve alt sayfalar.',
    inputSchema: {
      id: z.string().optional().describe('Sayfa id\'si (notlar_ara çıktısındaki [id: ...])'),
      baslik: z.string().optional().describe('id yoksa başlıktan bulunur'),
      alt_sayfalar: z.boolean().default(false).describe('Alt sayfaların içeriğini de ekle'),
    },
  },
  async (a, db) => {
    const byId = new Map(db.pages.map((p) => [p.id, p]));
    const p = a.id
      ? byId.get(a.id)
      : db.pages.find((x) => fold(x.title) === fold(a.baslik ?? '')) ??
        db.pages.find((x) => matches(a.baslik, x.title));
    if (!p) return fail(`Not bulunamadı: ${a.id || a.baslik || '(ölçüt verilmedi)'}`);

    const render = (page, depth = 0) => {
      const head = `${'#'.repeat(Math.min(depth + 1, 6))} ${page.icon ? page.icon + ' ' : ''}${page.title || '(başlıksız)'}`;
      const meta = [
        page.category ? `kategori: ${page.category}` : '',
        page.tags.length ? `etiket: ${page.tags.join(', ')}` : '',
        page.favorite ? 'favori' : '',
        page.archived ? 'arşiv' : '',
        page.updatedAt ? `güncelleme: ${page.updatedAt.slice(0, 16).replace('T', ' ')}` : '',
        `id: ${page.id}`,
      ].filter(Boolean).join(' · ');
      const props = page.props.length
        ? page.props.map((pr) => `- **${pr.key}** (${pr.type}): ${pr.value || '—'}`).join('\n') : '';
      const rel = page.relations.length
        ? page.relations.map((id) => `- ${byId.get(id)?.title || id}`).join('\n') : '';
      const db_ = page.database?.on ? `Bu sayfa bir veritabanı (görünüm: ${page.database.view}).` : '';
      const kids = db.pages.filter((c) => c.parentId === page.id);
      const kidList = kids.length
        ? kids.map((c) => `- ${c.title || '(başlıksız)'}  [id: ${c.id}]`).join('\n') : '';

      const body = joinSections(
        head, `_${meta}_`,
        pageText(page, byId),
        section('Özellikler', props),
        section('İlişkiler', rel),
        db_,
        section('Alt sayfalar', kidList)
      );
      if (!a.alt_sayfalar || !kids.length) return body;
      return [body, ...kids.map((c) => render(c, depth + 1))].join('\n\n---\n\n');
    };

    return text(render(p));
  }
);

/* ------------------------------------------------------------------- siber */

tool(
  'siber_ilerleme',
  {
    title: 'Siber yol haritası ve ilerleme',
    description:
      'Siber güvenlik (SOC) yol haritası: fazlar, görevler ve tamamlanma durumu; ' +
      'ayrıca kaynaklar (kurs/kitap/lab), çözülen lab kayıtları ve çalışma süresi ' +
      'özeti. "Nerede kalmış", "sırada ne var" sorularının cevabı burada.',
    inputSchema: {
      faz: z.string().optional().describe('Sadece bu faz, örn "FAZ 1"'),
      sadece_bekleyen: z.boolean().default(false).describe('Tamamlanan görevleri gizle'),
      detay: z.boolean().default(false).describe('Görev notlarını da göster'),
    },
  },
  async (a, db) => {
    const phases = [...db.phases].sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .filter((f) => !a.faz || fold(f.code).includes(fold(a.faz)) || matches(a.faz, f.title));

    const blocks = phases.map((f) => {
      const gs = db.tasks.filter((t) => t.phaseId === f.id)
        .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
        .filter((t) => !a.sadece_bekleyen || !t.done);
      const all = db.tasks.filter((t) => t.phaseId === f.id);
      const d = all.filter((t) => t.done).length;
      const head = `### ${f.code} — ${f.title}\n${f.when ? `${f.when} · ` : ''}${d}/${all.length} tamam${f.goal ? `\nHedef: ${f.goal}` : ''}`;
      const lines = gs.map((t) => {
        const tag = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
        const note = a.detay && t.note ? `\n    ${t.note}` : '';
        return `- [${t.done ? 'x' : ' '}] ${t.when ? `(${t.when}) ` : ''}${t.title}${tag}${t.done && t.doneAt ? ` · ${t.doneAt}` : ''}${note}`;
      });
      return `${head}\n${lines.join('\n')}`;
    });

    const kaynak = db.resources.map((r) =>
      `- [${r.kind}] ${r.title} — ${resStatusLabel(r.status)}, %${r.progress ?? 0}${r.rating ? ` · ${r.rating}/10` : ''}${r.link ? `\n    ${r.link}` : ''}`);

    const lab = [...db.labs].sort((x, y) => (y.solvedAt || '').localeCompare(x.solvedAt || ''))
      .map((l) => `- ${l.platform} · ${l.name} (${l.difficulty})${l.solvedAt ? ` · ${l.solvedAt}` : ''}${l.durationMin ? ` · ${l.durationMin} dk` : ''}${l.tags?.length ? ` · ${l.tags.join(', ')}` : ''}`);

    const dk = db.sessions.reduce((s, x) => s + (x.minutes ?? 0), 0);
    const son7 = todayISO(new Date(Date.now() - 7 * 864e5));
    const dk7 = db.sessions.filter((s) => (s.date || '') >= son7).reduce((s, x) => s + (x.minutes ?? 0), 0);
    const alan = new Map();
    for (const s of db.sessions) alan.set(s.area, (alan.get(s.area) ?? 0) + (s.minutes ?? 0));

    return text(joinSections(
      `# Siber ilerleme — ${db.tasks.filter((t) => t.done).length}/${db.tasks.length} görev`,
      blocks.join('\n\n'),
      section('Kaynaklar', capped(kaynak, 30)),
      section('Lab kayıtları', lab.length ? capped(lab, 40) : 'henüz kayıt yok'),
      section('Çalışma',
        `Toplam ${Math.round(dk / 60)} saat (${db.sessions.length} oturum) · son 7 gün ${dk7} dk · haftalık hedef ${db.settings.weeklyStudyTarget ?? '—'} dk` +
        (alan.size ? `\n${[...alan.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `- ${k}: ${v} dk`).join('\n')}` : ''))
    ));
  }
);

tool(
  'komut_defteri',
  {
    title: 'Komut defteri',
    description:
      'Kokpit\'in komut/kod defterindeki kayıtlar: başlık, dil, kod ve açıklama. ' +
      'Berk\'in daha önce kaydettiği bir komutu ararken kullan.',
    inputSchema: {
      sorgu: z.string().optional().describe('Başlık, kod, açıklama veya etikette aranacak metin'),
      dil: z.string().optional().describe('Örn "bash", "python"'),
      limit: z.number().min(1).max(50).default(20),
    },
  },
  async (a, db) => {
    const list = db.snippets.filter((s) => {
      if (a.dil && fold(s.language) !== fold(a.dil)) return false;
      return matches(a.sorgu, s.title, s.code, s.explanation, (s.tags ?? []).join(' '));
    }).sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''));

    const lines = list.slice(0, a.limit ?? 20).map((s) =>
      `### ${s.title}${s.tags?.length ? ` · ${s.tags.join(', ')}` : ''}\n` +
      `\`\`\`${s.language || ''}\n${s.code}\n\`\`\`` +
      (s.explanation ? `\n${s.explanation}` : ''));

    return text(`${list.length} kayıt\n\n${lines.join('\n\n')}`);
  }
);

/* ------------------------------------------------- hedefler & aliskanliklar */

tool(
  'hedefler_aliskanliklar',
  {
    title: 'Hedefler ve alışkanlıklar',
    description:
      'Hedefler (kilometre taşlarıyla) ve alışkanlıklar: güncel seri (streak), ' +
      'bu haftaki tamamlama sayısı ve haftalık hedefe göre durum.',
    inputSchema: {
      bitenleri_dahil_et: z.boolean().default(false).describe('Tamamlanmış/bırakılmış hedefleri de göster'),
    },
  },
  async (a, db) => {
    const goals = db.goals.filter((g) => a.bitenleri_dahil_et || (g.status !== 'done' && g.status !== 'dropped'));
    const gLines = goals.map((g) => {
      const m = g.milestones ?? [];
      const ms = m.map((x) => `    - [${x.done ? 'x' : ' '}] ${x.text}`).join('\n');
      return `- **${g.title}** — ${resStatusLabel(g.status)}${g.area ? ` · ${g.area}` : ''}` +
        `${g.targetDate ? ` · hedef ${g.targetDate}` : ''}${m.length ? ` · ${m.filter((x) => x.done).length}/${m.length}` : ''}` +
        `${g.note ? `\n    ${g.note}` : ''}${ms ? `\n${ms}` : ''}`;
    });

    const bugun = todayISO();
    const hLines = db.habits.filter((h) => !h.archived).map((h) => {
      const logs = [...(db.habitLogs[h.id] ?? [])].sort();
      const set = new Set(logs);
      // Guncel seri: bugunden (ya da dunden) geriye kesintisiz gunler.
      let streak = 0;
      const d = new Date(`${bugun}T00:00:00`);
      if (!set.has(bugun)) d.setDate(d.getDate() - 1);
      while (set.has(todayISO(d))) { streak++; d.setDate(d.getDate() - 1); }
      const hafta = todayISO(new Date(Date.now() - 6 * 864e5));
      const buHafta = logs.filter((x) => x >= hafta).length;
      return `- **${h.name}** (${h.cadence}) — seri ${streak} gün · son 7 günde ${buHafta}/${h.targetPerWeek} · toplam ${logs.length}` +
        `${logs.length ? ` · son ${logs[logs.length - 1]}` : ''}`;
    });

    return text(joinSections(
      '# Hedefler ve alışkanlıklar',
      section('Hedefler', gLines.join('\n')),
      section('Alışkanlıklar', hLines.join('\n'))
    ));
  }
);

/* ------------------------------------------------------------------ ajanda */

tool(
  'ajanda',
  {
    title: 'Ajanda (hatırlatıcı + takvim)',
    description:
      'Belirtilen gün aralığındaki hatırlatıcılar ve Google Takvim\'den çekilen ' +
      '(salt-okunur) etkinlikler. "Bugün ne var", "bu hafta programım" sorularında kullan.',
    inputSchema: {
      gun: z.number().min(1).max(365).default(7).describe('Bugünden itibaren kaç gün'),
      geriye: z.number().min(0).max(365).default(0).describe('Kaç gün geriye de bakılsın'),
      gecikenleri_goster: z.boolean().default(true).describe('Tarihi geçmiş, tamamlanmamış hatırlatıcıları da listele'),
    },
  },
  async (a, db) => {
    const bas = todayISO(new Date(Date.now() - (a.geriye ?? 0) * 864e5));
    const son = todayISO(new Date(Date.now() + (a.gun ?? 7) * 864e5));
    const bugun = todayISO();
    const inRange = (s) => { const d = (s || '').slice(0, 10); return d >= bas && d <= son; };

    const rem = db.reminders.filter((r) => inRange(r.at))
      .sort((x, y) => (x.at || '').localeCompare(y.at || ''))
      .map((r) => `- ${(r.at || '').replace('T', ' ')} · ${r.done ? '✓ ' : ''}${r.title}` +
        `${r.repeat && r.repeat !== 'none' ? ` (${r.repeat})` : ''}${r.note ? ` — ${r.note}` : ''}`);

    const geciken = (a.gecikenleri_goster ?? true)
      ? db.reminders.filter((r) => !r.done && (r.at || '').slice(0, 10) < bugun)
        .sort((x, y) => (x.at || '').localeCompare(y.at || ''))
        .map((r) => `- ${(r.at || '').replace('T', ' ')} · ${r.title}`)
      : [];

    const ev = db.events.filter((e) => inRange(e.start))
      .sort((x, y) => (x.start || '').localeCompare(y.start || ''))
      .map((e) => `- ${e.allDay ? `${(e.start || '').slice(0, 10)} (tüm gün)` : (e.start || '').replace('T', ' ')} · ${e.title}` +
        `${e.location ? ` @ ${e.location}` : ''}${e.calendar ? ` · ${e.calendar}` : ''}`);

    return text(joinSections(
      `# Ajanda ${bas} → ${son}`,
      section('Hatırlatıcılar', capped(rem, 60)),
      section('Geciken hatırlatıcılar', capped(geciken, 30)),
      section('Takvim etkinlikleri', capped(ev, 60)),
      db.settings.icsSyncedAt ? `_Takvim son eşitleme: ${db.settings.icsSyncedAt}_` : ''
    ));
  }
);

/* ----------------------------------------------------------- son hareketler */

tool(
  'son_hareketler',
  {
    title: 'Son hareketler',
    description:
      'Tüm modüllerde son değişiklikleri tek akışta gösterir: izlenen film/diziler ve ' +
      'bölümler, düzenlenen notlar, tamamlanan görev/lab/alışkanlıklar. ' +
      '"Berk son günlerde ne yapmış" sorusunun cevabı.',
    inputSchema: {
      gun: z.number().min(1).max(365).default(14).describe('Kaç gün geriye bakılsın'),
      limit: z.number().min(1).max(200).default(60),
    },
  },
  async (a, db) => {
    const esik = todayISO(new Date(Date.now() - (a.gun ?? 14) * 864e5));
    const ev = [];
    const push = (date, line) => { if (date && date.slice(0, 10) >= esik) ev.push([date.slice(0, 10), line]); };

    for (const t of db.titles) {
      if (t.status === 'done') push(t.watchedAt, `🎬 izlendi: ${t.name}${t.rating ? ` (${t.rating}/10)` : ''}`);
      for (const e of t.episodes ?? []) {
        if (e.watched) push(e.watchedAt, `📺 ${t.name} ${epCode(e)}${e.name ? ` — ${e.name}` : ''}${e.rating ? ` (${e.rating}/10)` : ''}`);
      }
    }
    for (const p of db.pages) push(p.updatedAt, `📝 not: ${p.title || '(başlıksız)'}`);
    for (const t of db.tasks) if (t.done) push(t.doneAt, `✅ görev: ${t.title}`);
    for (const l of db.labs) push(l.solvedAt, `🧪 lab: ${l.platform} · ${l.name}`);
    for (const s of db.sessions) push(s.date, `⏱ çalışma: ${s.minutes} dk · ${s.area}${s.note ? ` — ${s.note}` : ''}`);
    for (const h of db.habits) {
      for (const d of db.habitLogs[h.id] ?? []) push(d, `🔁 alışkanlık: ${h.name}`);
    }

    ev.sort((x, y) => y[0].localeCompare(x[0]));
    const lines = [];
    let gun = '';
    for (const [d, line] of ev) {
      if (d !== gun) { gun = d; lines.push(`\n**${d}**`); }
      lines.push(`- ${line}`);
    }

    return text(`# Son ${a.gun ?? 14} gün — ${ev.length} hareket\n${capped(lines, (a.limit ?? 60) * 2)}`);
  }
);

/* ------------------------------------------------------------------ baslat */

const transport = new StdioServerTransport();
await server.connect(transport);
