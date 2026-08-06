/**
 * Duman testi: sunucuyu gercek stdio uzerinden baslatir, tum araclari cagirir,
 * cikti bos ya da hatali mi bakar. `npm test` ile calisir.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..', 'server.js');

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const { tools } = await client.listTools();
console.log(`${tools.length} araç bulundu: ${tools.map((t) => t.name).join(', ')}\n`);

const calls = [
  ['kokpit_ozet', {}],
  ['izleme_ara', { sorgu: 'mr robot' }],
  ['izleme_ara', { durum: 'planned', tur: 'film', limit: 5 }],
  ['izleme_detay', { ad: 'Mr. Robot', bolumler: 'ozet' }],
  ['izleme_istatistik', {}],
  ['izleme_istatistik', { yil: '2026' }],
  ['notlar_ara', {}],
  ['notlar_ara', { sorgu: 'kokpit' }],
  ['siber_ilerleme', { sadece_bekleyen: true }],
  ['komut_defteri', {}],
  ['hedefler_aliskanliklar', {}],
  ['ajanda', { gun: 30, geriye: 7 }],
  ['son_hareketler', { gun: 7 }],
];

let fails = 0;
for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const out = res.content.map((c) => c.text).join('\n');
  const bad = res.isError || !out.trim();
  if (bad) fails++;
  const etiket = bad ? 'HATA' : ' OK ';
  console.log(`[${etiket}] ${name} ${JSON.stringify(args)} → ${out.length} karakter`);
  if (bad) console.log(out.slice(0, 400));
}

// not_oku, notlar_ara'dan gelen gercek bir id ile denenir.
const notlar = await client.callTool({ name: 'notlar_ara', arguments: { limit: 1 } });
const id = (notlar.content[0]?.text ?? '').match(/\[id: ([^\]]+)\]/)?.[1];
if (id) {
  const res = await client.callTool({ name: 'not_oku', arguments: { id, alt_sayfalar: true } });
  const out = res.content.map((c) => c.text).join('\n');
  const bad = res.isError || !out.trim();
  if (bad) fails++;
  console.log(`[${bad ? 'HATA' : ' OK '}] not_oku {id:${id}} → ${out.length} karakter`);
} else {
  console.log('[ATLA] not_oku — okunacak not bulunamadı');
}

// Bilinmeyen kayit duzgun hata vermeli (istisna firlatmamali).
const yok = await client.callTool({ name: 'izleme_detay', arguments: { ad: 'olmayan film xyz' } });
console.log(`[${yok.isError ? ' OK ' : 'HATA'}] izleme_detay bilinmeyen kayıt → hata döndü`);
if (!yok.isError) fails++;

await client.close();
console.log(fails ? `\n${fails} test başarısız.` : '\nHepsi geçti.');
process.exit(fails ? 1 : 0);
