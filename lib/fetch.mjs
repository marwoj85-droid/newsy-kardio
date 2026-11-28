// Pobiera publikacje z PubMed (E-utilities) i kanałów RSS Elsevier (ScienceDirect),
// klasyfikuje je (typ, tematy) i dopisuje do data/articles.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAll, compileProfile } from './score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'articles.json');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
// profil osobisty (opis: profil-zawodowy.md); bez pliku ranking działa bez profilu
const PROFILE_FILE = path.join(ROOT, 'profile.json');
export const profile = fs.existsSync(PROFILE_FILE) ? compileProfile(JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'))) : null;
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'tool=newsy-kardio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- helpers ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
      : ENT[e.toLowerCase()] ?? m);
}
const stripTags = s => decode(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const all = (re, s) => [...s.matchAll(re)];
const one = (re, s) => (s.match(re) || [])[1];
const normTitle = t => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 120);

async function get(url, opts = {}, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429 && i < tries) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 100)}`);
      return await r.text();
    } catch (e) { if (i >= tries) throw e; await sleep(1500 * (i + 1)); }
  }
}

// ---------- classification ----------
const TOPICS = [
  ['Niewydolność serca', /heart failure|hfref|hfpef|hfmref|cardiomyopath|lvad|ventricular assist|cardiac amyloid/i],
  ['Arytmie / EP', /atrial fibrillation|atrial flutter|arrhythm|ablation|tachycardi|bradycardi|pacemaker|pacing|defibrillat|\bicd\b|long qt|brugada|sudden cardiac/i],
  ['Choroba wieńcowa / OZW', /coronary|myocardial infarction|acute coronary|angina|stemi|ischemic heart|ischaemic heart|minoca|inoca/i],
  ['Interwencje / PCI / TAVI', /\bpci\b|percutaneous coronary|stent|tavi|tavr|transcatheter|catheteri[sz]ation|angioplasty|left atrial appendage/i],
  ['Wady zastawkowe', /valv|aortic stenosis|mitral|tricuspid|endocarditis/i],
  ['Nadciśnienie', /hypertensi|blood pressure|renal denervation/i],
  ['Lipidy / prewencja', /lipid|ldl|cholesterol|statin|pcsk9|lipoprotein|triglycerid|prevention|risk factor|obesity|glp-1|semaglutide|tirzepatide/i],
  ['Cukrzyca / kardiometabolizm', /diabet|sglt2|empagliflozin|dapagliflozin|cardiometabolic|cardio-kidney|chronic kidney/i],
  ['Zakrzepica / antykoagulacja', /anticoagul|thromb|embolism|doac|warfarin|apixaban|rivaroxaban|edoxaban|antiplatelet|aspirin|clopidogrel|ticagrelor/i],
  ['Obrazowanie', /echocardiogra|magnetic resonance|\bcmr\b|computed tomography|\bccta\b|cardiac ct|imaging|global longitudinal strain|\bpet\b|spect|scintigraph/i],
  ['Udar', /stroke|cerebrovascular|transient ischemic/i],
  ['Kardioonkologia', /cancer|oncolog|cardiotoxic|anthracycline|chemotherap/i],
  ['Wrodzone / pediatria', /congenital|pediatric|paediatric|children|infant|neonat|fontan/i],
  ['Kardiomiopatie / genetyka', /hypertrophic|dilated cardiomyopathy|genetic|genom|variant|polygenic|myocarditis/i],
  ['Naczynia / aorta', /aort(a|ic) (aneurysm|dissection)|peripheral arter|\b(peripheral )?vascular disease|pulmonary (arterial )?hypertension|venous thrombo|carotid/i],
  ['AI / cyfrowa', /artificial intelligence|machine learning|deep learning|neural network|large language|\bai\b|wearable|smartwatch|digital/i],
  ['Badania podstawowe', /\bmice\b|\bmouse\b|murine|\brats?\b|zebrafish|in vitro|organoid|ipsc|cardiomyocytes|single-cell/i],
];
export function topicsFor(text) { return TOPICS.filter(([, re]) => re.test(text)).map(([n]) => n); }

export function typeFor(pubTypes, title) {
  const pt = pubTypes.join('|').toLowerCase(); const t = (title || '').toLowerCase();
  // odpowiedzi i listy najpierw — "Reply to ... guidelines" to nadal komentarz
  if (/^(reply|response|re:|letter|editorial|comment)|\breply\.?$|letter to the editor/.test(t) || (/editorial|comment|letter/.test(pt) && !/randomized|meta-analysis|guideline/.test(pt))) return 'Komentarz';
  // "guideline-directed therapy" itp. to nie wytyczne
  const tg = t.replace(/guidelines?[- ](directed|recommended|based|concordant|adherence|implementation|indicated)|guideline-?directed/g, '');
  if (/guideline/.test(pt) || /\bguidelines?\b|consensus (statement|document|report)|expert consensus|scientific statement|position (paper|statement)|clinical practice update/.test(tg)) return 'Wytyczne';
  if (/meta-analysis|systematic review/.test(pt) || /meta-analy|systematic review|umbrella review/.test(t)) return 'Meta-analiza';
  if (/randomized controlled trial|clinical trial, phase iii/.test(pt) || /\brandomi[sz]ed\b/.test(t) && !/non-?randomi/.test(t)) return 'RCT';
  if (/case reports/.test(pt) || /case report|a case of/.test(t)) return 'Opis przypadku';
  if (/\breview\b/.test(pt) || /\breview\b/.test(t)) return 'Przegląd';
  return 'Oryginalny';
}

// ---------- PubMed ----------
function buildPubmedQuery() {
  const p = config.pubmed;
  const ta = list => '(' + list.map(j => `"${j}"[ta]`).join(' OR ') + ')';
  const keyPart = ta(p.keyJournals);
  const generalPart = `(${ta(p.generalJournals)} AND ${p.scope})`;
  const highlightPart = `(${p.highlight} AND ${p.scope})`;
  return `((${keyPart}) OR ${generalPart} OR ${highlightPart}) NOT ${p.exclude}`;
}

function parsePubmedArticle(x, keySet, generalSet) {
  const pmid = one(/<PMID[^>]*>(\d+)<\/PMID>/, x);
  const title = stripTags(one(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/, x) || one(/<VernacularTitle>([\s\S]*?)<\/VernacularTitle>/, x) || '');
  const abs = all(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g, one(/<Abstract>([\s\S]*?)<\/Abstract>/, x) || '')
    .map(([, attrs, t]) => { const l = one(/Label="([^"]+)"/, attrs); return (l ? l + ': ' : '') + stripTags(t); }).join('\n');
  const journal = stripTags(one(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/, x) || '');
  const abbr = stripTags(one(/<MedlineTA>([\s\S]*?)<\/MedlineTA>/, x) || one(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/, x) || '');
  const doi = one(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/, x) || one(/<ELocationID EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/, x);
  const authors = all(/<Author[ >][\s\S]*?<\/Author>/g, one(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/, x) || '')
    .map(([a]) => { const ln = one(/<LastName>([^<]+)/, a); const ini = one(/<Initials>([^<]+)/, a); const coll = one(/<CollectiveName>([\s\S]*?)<\/CollectiveName>/, a); return ln ? decode(`${ln} ${ini || ''}`.trim()) : coll ? stripTags(coll) : null; })
    .filter(Boolean);
  const pubTypes = all(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g, x).map(m => m[1]);
  const mesh = all(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g, x).map(m => decode(m[1]));
  const keywords = all(/<Keyword[^>]*>([\s\S]*?)<\/Keyword>/g, x).map(m => stripTags(m[1]));
  const ed = x.match(/<PubMedPubDate PubStatus="entrez">\s*<Year>(\d+)<\/Year>\s*<Month>(\d+)<\/Month>\s*<Day>(\d+)<\/Day>/);
  const date = ed ? `${ed[1]}-${ed[2].padStart(2, '0')}-${ed[3].padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
  const type = typeFor(pubTypes, title);
  const tier = keySet.has(abbr) ? 'Kluczowe czasopismo' : generalSet.has(abbr) ? 'Czasopismo ogólnomedyczne' : 'Najważniejsze typy badań';
  return {
    id: 'pm' + pmid, source: 'PubMed', pmid, title, abstract: abs, journal, journalAbbr: abbr, doi,
    url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    authors: authors.slice(0, 6), authorsCount: authors.length, pubTypes, type, tier,
    highlight: ['RCT', 'Meta-analiza', 'Wytyczne'].includes(type),
    topics: topicsFor(`${title} ${abs} ${mesh.join(' ')} ${keywords.join(' ')}`),
    date,
  };
}

async function fetchPubmed(days, log) {
  const term = buildPubmedQuery();
  const s = JSON.parse(await get(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=5000&datetype=edat&reldate=${days}&${TOOL}&term=${encodeURIComponent(term)}`));
  const ids = s.esearchresult.idlist || [];
  log(`PubMed: ${s.esearchresult.count} rekordów z ostatnich ${days} dni`);
  const keySet = new Set(config.pubmed.keyJournals), generalSet = new Set(config.pubmed.generalJournals);
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    await sleep(400);
    const xml = await get(`${EUTILS}/efetch.fcgi`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `db=pubmed&retmode=xml&${TOOL}&id=${ids.slice(i, i + 200).join(',')}` });
    for (const [art] of all(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g, xml)) {
      try { const a = parsePubmedArticle(art, keySet, generalSet); if (a.title) out.push(a); } catch { /* pomiń uszkodzony rekord */ }
    }
  }
  return out;
}

// ---------- Elsevier RSS ----------
const ELS_SKIP = /^(corrigendum|erratum|correction|retraction|editorial board|table of contents|masthead|issue highlights|information for|cover|contents)/i;
async function fetchElsevier(log) {
  const out = []; const today = new Date().toISOString().slice(0, 10);
  await Promise.all(config.elsevier.map(async feed => {
    try {
      const xml = await get(feed.url);
      let n = 0;
      for (const [item] of all(/<item>[\s\S]*?<\/item>/g, xml)) {
        const title = stripTags(one(/<title>([\s\S]*?)<\/title>/, item) || '');
        if (!title || ELS_SKIP.test(title)) continue;
        const link = decode(one(/<link>([\s\S]*?)<\/link>/, item) || '').replace(/\?dgcid=.*$/, '').trim();
        const pii = one(/pii\/([A-Z0-9]+)/i, link);
        const descHtml = decode(one(/<description>([\s\S]*?)<\/description>/, item) || '');
        const pubDate = stripTags(one(/Publication date:\s*([^<]+)/i, descHtml) || '');
        const authors = stripTags(one(/Author\(s\):\s*([\s\S]*?)<\/p>/i, descHtml) || '').split(/,\s*/).filter(Boolean);
        const rest = stripTags(descHtml.replace(/<p>\s*(Publication date|<b>Source|Author\(s\))[\s\S]*?<\/p>/gi, ''));
        const type = typeFor([], title);
        const onl = pubDate.match(/Available online\s+(\d{1,2} \w+ \d{4})/i);
        const onlineDate = onl && !isNaN(Date.parse(onl[1] + ' UTC')) ? new Date(Date.parse(onl[1] + ' UTC')).toISOString().slice(0, 10) : null;
        out.push({ onlineDate,
          id: 'els' + (pii || normTitle(title)), source: 'Elsevier', pii, title, abstract: rest.length > 150 ? rest : '',
          journal: feed.name, journalAbbr: feed.abbr, doi: null, url: link, pubmedUrl: null,
          authors: authors.slice(0, 6), authorsCount: authors.length, pubTypes: [], type, tier: 'Elsevier',
          highlight: ['RCT', 'Meta-analiza', 'Wytyczne'].includes(type),
          topics: topicsFor(`${title} ${rest}`), issueDate: pubDate, date: today,
        });
        n++;
      }
      log(`Elsevier ${feed.abbr}: ${n} pozycji w kanale`);
    } catch (e) { log(`Elsevier ${feed.abbr}: BŁĄD ${e.message}`); }
  }));
  return out;
}

// ---------- store ----------
export function loadStore() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { lastFetch: null, articles: [] }; }
}

export async function runFetch(log = console.log) {
  const store = loadStore();
  const days = store.lastFetch ? config.pubmed.nextRunDays : config.pubmed.firstRunDays;
  const firstRun = !store.lastFetch;
  const byId = new Map(store.articles.map(a => [a.id, a]));
  const titles = new Map(store.articles.map(a => [normTitle(a.title), a]));
  const pruned = new Set(store.prunedIds || []);
  const now = new Date().toISOString();
  let added = 0;
  const errors = [];

  const merge = (a) => {
    const nt = normTitle(a.title);
    if (pruned.has(a.id)) return; // już kiedyś usunięty jako zbyt stary
    const existing = byId.get(a.id) || titles.get(nt);
    if (existing) {
      // PubMed wzbogaca wpis z Elseviera o abstrakt, DOI i typ publikacji
      if (a.source === 'PubMed' && existing.source === 'Elsevier') {
        Object.assign(existing, { abstract: existing.abstract || a.abstract, doi: a.doi, pmid: a.pmid, pubmedUrl: a.pubmedUrl, pubTypes: a.pubTypes, type: a.type, highlight: a.highlight, topics: [...new Set([...existing.topics, ...a.topics])] });
      }
      return;
    }
    // Elsevier: data "Available online" z kanału; gdy jej brak przy pierwszym uruchomieniu — "starsze"
    if (a.source === 'PubMed') a.firstSeen = a.date + 'T12:00:00Z';
    else if (a.onlineDate) { a.date = a.onlineDate; a.firstSeen = a.onlineDate + 'T12:00:00Z'; }
    else { a.firstSeen = firstRun ? null : now; if (firstRun) a.date = null; }
    byId.set(a.id, a); titles.set(nt, a); added++;
  };

  const [pm, els] = await Promise.all([
    fetchPubmed(days, log).catch(e => { errors.push('PubMed: ' + e.message); log('PubMed BŁĄD: ' + e.message); return []; }),
    fetchElsevier(log),
  ]);
  els.forEach(merge); pm.forEach(merge);

  const cutoff = Date.now() - config.keepDays * 864e5;
  const articles = [];
  for (const a of byId.values()) (!a.firstSeen || Date.parse(a.firstSeen) > cutoff ? articles.push(a) : pruned.add(a.id));
  for (const a of articles) a.type = typeFor(a.pubTypes || [], a.title); // klasyfikacja od nowa (poprawki reguł działają też wstecz)
  scoreAll(articles, profile); // ranking liczony od nowa przy każdym przebiegu (PubMed może dopisać abstrakt)
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  const result = { lastFetch: now, articles, prunedIds: [...pruned].slice(-5000), lastRun: { at: now, added, pubmed: pm.length, elsevier: els.length, errors } };
  fs.writeFileSync(DATA, JSON.stringify(result));
  log(`Dodano ${added} nowych, razem w bazie ${articles.length}`);
  return result.lastRun;
}

// uruchomienie z linii poleceń: node lib/fetch.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFetch().catch(e => { console.error(e); process.exit(1); });
}
