/* Descarga fotografías reales de Wikimedia Commons para las fichas de BIOSMART QR.
   Guarda public/img/<clave>.<ext> + public/img/credits.json (autor + licencia). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');

const ITEMS = [
  { key: 'molle',          q: 'Schinus molle' },
  { key: 'chilijchi',       q: 'Erythrina falcata' },
  { key: 'tamar',          q: 'Tamarix flower' },
  { key: 'picaflor',       q: 'Colibri coruscans' },
  { key: 'tortola',        q: 'Zenaida auriculata' },
  { key: 'paloma',         q: 'Columba livia pigeon' },
  { key: 'mariposa',       q: 'Polyommatus butterfly' },
  { key: 'abeja-nativa',   q: 'stingless bee' },
  { key: 'mosca-colibri',  q: 'Syrphidae hoverfly flower' },
  { key: 'lagartija',      q: 'Tropidurus lizard' },
  { key: 'zorro',          q: 'Lycalopex culpaeus' },
  { key: 'comadreja',      q: 'Didelphis albiventris' },
  { key: 'abeja-melifera', q: 'Apis mellifera flower' },
  { key: 'hero',           q: 'Tiquipaya' },
];

const BAD = /map|diagram|logo|icon|distribution|range|drawing|sketch|stamp|coat of arms|chart|moth|hawk|sphing/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html = '') => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function search(q) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1400',
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'BioSmartQR/1.0 (educational project)' } });
    if (res.status === 429 && attempt < 5) { await sleep(7000 * attempt); continue; }
    if (!res.ok) throw new Error(`API ${res.status}`);
    const j = await res.json();
    return (j.query?.pages ?? [])
      .map((p) => ({ title: p.title, info: p.imageinfo?.[0] }))
      .filter((p) => p.info && ['image/jpeg', 'image/png'].includes(p.info.mime))
      .filter((p) => p.info.thumbwidth >= 800 && !BAD.test(p.title))
      .sort((a, b) => (b.info.thumbwidth || 0) - (a.info.thumbwidth || 0));
  }
}

async function download(key) {
  const candidates = await search(ITEMS.find((i) => i.key === key).q);
  for (const c of candidates) {
    try {
      const url = c.info.thumburl || c.info.url;
      const res = await fetch(url, { headers: { 'User-Agent': 'BioSmartQR/1.0 (educational project)' } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 25_000) continue;
      const ext = c.info.mime === 'image/png' ? 'png' : 'jpg';
      fs.writeFileSync(path.join(IMG_DIR, `${key}.${ext}`), buf);
      const em = c.info.extmetadata || {};
      return {
        key, file: `${key}.${ext}`, title: c.title.replace(/^File:/, ''),
        author: strip(em.Artist?.value) || 'Wikimedia Commons',
        license: strip(em.LicenseShortName?.value) || 'ver en Commons',
        source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(c.title)}`,
        bytes: buf.length,
      };
    } catch { /* siguiente candidato */ }
  }
  return { key, file: null, title: null, author: null, license: null, source: null };
}

// Títulos exactos de las descargas de la primera ejecución (para recuperar sus créditos)
const KNOWN_TITLES = {
  molle: 'Schinus molle.jpg',
  tamar: 'Tamarix-pentandra-flowers.JPG',
  tortola: 'Zenaida auriculata -Sao Lourenco do Sul, Rio Grande do Sul, Brazil-8.jpg',
  paloma: 'Rock Pigeon Columba livia 3264px.jpg',
  'abeja-nativa': 'Stingless bee.jpg',
  'mosca-colibri': 'Hoverflies mating midair.jpg',
  lagartija: 'Tropidurus catalanensis-basking.jpg',
};

async function creditForTitle(title) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    titles: `File:${title}`, prop: 'imageinfo', iiprop: 'url|extmetadata',
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'BioSmartQR/1.0 (educational project)' } });
    if (res.status === 429 && attempt < 5) { await sleep(7000 * attempt); continue; }
    if (!res.ok) return null;
    const j = await res.json();
    const page = (j.query?.pages ?? [])[0];
    const em = page?.imageinfo?.[0]?.extmetadata || {};
    if (!page || page.missing) return null;
    return {
      title,
      author: strip(em.Artist?.value) || 'Wikimedia Commons',
      license: strip(em.LicenseShortName?.value) || 'ver en Commons',
      source: `https://commons.wikimedia.org/wiki/${encodeURIComponent('File:' + title)}`,
    };
  }
}

fs.mkdirSync(IMG_DIR, { recursive: true });
const credits = [];
const existingFile = (key) => fs.readdirSync(IMG_DIR).find((f) => f.startsWith(`${key}.`) && f !== 'credits.json') || null;
const hasFile = (key) => !!existingFile(key);
for (const item of ITEMS) {
  if (hasFile(item.key)) {
    console.log(`SKIP ${item.key} (ya descargada)`);
    if (KNOWN_TITLES[item.key]) {
      const meta = await creditForTitle(KNOWN_TITLES[item.key]);
      if (meta) credits.push({ key: item.key, file: existingFile(item.key), ...meta, bytes: null });
      await sleep(1500);
    }
    continue;
  }
  const credit = await download(item.key);
  credits.push(credit);
  console.log(credit.file ? `OK   ${item.key} -> ${credit.file} (${credit.title})` : `MISS ${item.key}`);
  await sleep(1500);
}
const prevPath = path.join(IMG_DIR, 'credits.json');
const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : [];
const merged = prev.filter((c) => credits.every((n) => n.key !== c.key)).concat(credits);
fs.writeFileSync(prevPath, JSON.stringify(merged, null, 2));
const missing = ITEMS.filter((i) => !hasFile(i.key)).map((i) => i.key);
console.log(`\nListo. En disco: ${ITEMS.length - missing.length}/${ITEMS.length}. Faltan: ${missing.join(', ') || 'ninguna'}`);
