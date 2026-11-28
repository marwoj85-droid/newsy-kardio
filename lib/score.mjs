// Ranking punktowy publikacji: im wyższy wynik, tym ważniejsza publikacja.
// Każdy składnik dopisuje krótki powód (pokazywany w aplikacji), żeby było widać, skąd ocena.
// Profil osobisty (profile.json → compileProfile) dodaje wagi w scoreArticle(..., profile).

// --- czasopisma ---
const JOURNAL_TIERS = [
  [40, ['N Engl J Med', 'Lancet', 'JAMA', 'BMJ', 'Nat Med']],
  [30, ['Eur Heart J', 'J Am Coll Cardiol', 'Circulation', 'JAMA Cardiol', 'Nat Rev Cardiol', 'Ann Intern Med', 'JAMA Intern Med']],
  [20, ['Eur J Heart Fail', 'Europace', 'Circ Res', 'Circ Heart Fail', 'Circ Arrhythm Electrophysiol', 'Circ Cardiovasc Interv', 'Circ Cardiovasc Imaging',
    'JACC Heart Fail', 'JACC Cardiovasc Interv', 'JACC Cardiovasc Imaging', 'JACC Clin Electrophysiol', 'Eur J Prev Cardiol', 'Cardiovasc Res',
    'EuroIntervention', 'Eur Heart J Cardiovasc Imaging', 'Hypertension', 'Heart Rhythm', 'Nat Cardiovasc Res', 'Lancet Digit Health',
    'Lancet Diabetes Endocrinol', 'Stroke', 'JACC CardioOncol', 'JACC Basic Transl Sci']],
  [10, ['Heart', 'Am Heart J', 'Int J Cardiol', 'Can J Cardiol', 'Am J Cardiol', 'J Card Fail', 'Atherosclerosis', 'J Am Soc Echocardiogr',
    'Kardiol Pol', 'J Am Heart Assoc', 'Open Heart', 'Clin Res Cardiol', 'ESC Heart Fail', 'Eur Heart J Acute Cardiovasc Care',
    'Eur Heart J Qual Care Clin Outcomes', 'Eur Heart J Valvular Struct Heart Dis', 'Eur Heart J Digit Health', 'J Heart Lung Transplant',
    'JACC Adv', 'Circ Cardiovasc Qual Outcomes', 'Circ Genom Precis Med', 'Arterioscler Thromb Vasc Biol', 'Lancet Reg Health Eur']],
];
const JOURNAL_POINTS = new Map(JOURNAL_TIERS.flatMap(([p, list]) => list.map(j => [j, p])));
const SHORT = { 'N Engl J Med': 'NEJM', 'J Am Coll Cardiol': 'JACC', 'Eur Heart J': 'EHJ' };

// --- typ publikacji ---
const TYPE_POINTS = { 'Wytyczne': 35, 'RCT': 30, 'Meta-analiza': 18, 'Oryginalny': 8, 'Przegląd': 5, 'Opis przypadku': -10, 'Komentarz': -15 };
const SOCIETY = /\b(ESC|AHA|ACC|ESH|EAS|EHRA|HRS|EAPCI|EACVI|HFA|EACTS|SCAI|ACCF|ASE|EAPC|Polish Cardiac Society|Polskiego Towarzystwa Kardiologicznego)\b/;

// skróty, które nie są nazwami badań
const NOT_TRIAL = new Set(('PCI TAVI TAVR ECG EKG MRI CMR CT CTA CCTA HFREF HFPEF HFMREF LDL HDL LDL-C STEMI NSTEMI NSTE-ACS COVID COVID-19 SGLT2 GLP-1 DNA RNA USA ICD CABG ACS CAD CKD LVEF NYHA BMI ESC AHA ACC MACE ICU RCT PET SPECT TEE TTE ECMO LAA LAAO PFO ASD VSD DOAC DOACS NOAC MINOCA INOCA HCM DCM ARVC PAD PAH DVT VTE CRT CRT-D SCD NT-PROBNP BNP CRP HIV UK EU NIH II III IV AF AFL LBBAP LBBB RBBB AV SA TIA OSA LV RV LA RA BP HR CI OR HR SD IQR AUC ROC TOF TGA PDA FFR IVUS OCT IFR DES BMS POBA CTO LM ACE ARB ARNI MRA HFA EHRA ASE HRS SCAI EAPCI EACVI EAS ESH ACCF AI ML LLM GPT ICD-10 MESH NHANES UKB AFIB ST-SEGMENT ST-ELEVATION NON-ST QRS QTC SGLT2I GDMT ATTR ATTR-CM TTR PFA RF RFA CPAP LVOT LVOTO EF HFPEF HFREF').split(' '));

const n = s => parseInt(String(s).replace(/[ ,  ]/g, ''), 10);
const fmtN = v => v.toLocaleString('pl-PL');

export function sampleSize(text) {
  let best = 0;
  const re = /\b(\d{1,3}(?:[ ,  ]\d{3})+|\d{2,7})\s+(?:consecutive\s+|adult\s+|eligible\s+|hospitali[sz]ed\s+)?(?:patients|participants|adults|individuals|subjects|women|men|children|persons|people|cases|survivors|veterans|residents|recipients)\b/gi;
  for (const m of text.matchAll(re)) { const v = n(m[1]); if (v > best && v < 50_000_000) best = v; }
  const re2 = /\b[Nn]\s*=\s*(\d{1,3}(?:[ ,]\d{3})+|\d{2,7})\b/g;
  for (const m of text.matchAll(re2)) { const v = n(m[1]); if (v > best && v < 50_000_000) best = v; }
  return best;
}

export function trialName(title, abstract) {
  if (!abstract) return null;
  for (const m of title.matchAll(/\b([A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/g)) {
    const t = m[1];
    if (t.length < 3 || NOT_TRIAL.has(t.toUpperCase()) || !/[A-Z]{3}/.test(t.replace(/-/g, ''))) continue;
    const esc = t.replace(/[-]/g, '\\-');
    if (new RegExp(`\\b${esc}\\b[^.]{0,40}\\b(trial|study|registry|randomi[sz]ed)`, 'i').test(abstract) ||
        new RegExp(`\\b(trial|study)\\b[^.]{0,15}\\(?${esc}\\)?`, 'i').test(abstract) ||
        /\btrial\b/i.test(title)) return t;
  }
  return null;
}

/**
 * @param a artykuł (title, abstract, journalAbbr, type, pubTypes)
 * @param ctx { editorialNames: Set<string> } — nazwy badań wspomniane w komentarzach redakcyjnych
 * @param profile wynik compileProfile(profile.json) albo null
 */
export function scoreArticle(a, ctx = {}, profile = null) {
  const reasons = [];
  let s = 0;
  const title = a.title || '', abs = a.abstract || '', text = title + ' ' + abs;
  const pt = (a.pubTypes || []).join('|').toLowerCase();

  // czasopismo
  const jp = JOURNAL_POINTS.get(a.journalAbbr) || 0;
  s += jp;
  // nazwa czasopisma jest już widoczna przy artykule — nie powtarzamy jej w powodach

  // typ
  s += TYPE_POINTS[a.type] ?? 0;
  if (a.type === 'Wytyczne') {
    const soc = title.match(SOCIETY);
    // oficjalne wytyczne towarzystw ("2025 ESC/EACTS Guidelines for ...") na samą górę
    if (soc && /^(\d{4}\s+)?[A-Z]{2,}(\/[A-Z]{2,})*(\s[A-Z]{2,})*\s([A-Za-z-]+\s){0,4}[Gg]uidelines?\b/.test(title.trim())) { s += 30; reasons.push(`oficjalne wytyczne ${soc[1]}`); }
    else if (soc) { s += 10; reasons.push(`stanowisko ${soc[1]}`); }
    else reasons.push('wytyczne / konsensus');
  }
  if (a.type === 'Wytyczne' && profile && jp) {
    // profil: wytyczne europejskie i polskie wyżej niż amerykańskie (tylko w czasopismach z rankingu)
    const g = profile.guidelines;
    if (g.preferredRe.test(title)) s += g.preferred;
    else if (g.americanRe.test(title)) s += g.american;
  }
  if (a.type === 'Komentarz' || a.type === 'Opis przypadku') return finish(a, s, reasons);

  // opisy protokołów badań (bez wyników)
  const protocol = /rationale and design|design and rationale|study protocol|protocol for a|: protocol\b/i.test(title);
  if (protocol) { s -= 15; reasons.push('protokół badania'); }

  // wielkość badania (tylko badania z danymi — nie przeglądy)
  const size = ['RCT', 'Meta-analiza', 'Oryginalny'].includes(a.type) ? sampleSize(text) : 0;
  if (size >= 100) {
    s += Math.min(15, Math.max(0, Math.round(4 * Math.log10(size) - 6)));
    if (size >= 1000) reasons.push(`${fmtN(size)} pacjentów`);
  }

  // nazwane badanie / rejestracja
  const trial = trialName(title, abs);
  if (trial) { s += 6; reasons.push(`badanie ${trial}`); }
  else if (/\bNCT\d{8}\b/.test(abs)) s += 3;

  // projekt
  let design = 0;
  if (/multi-?cent(er|re)|multinational|international,? (randomi|multi)/i.test(text)) { design += 4; reasons.push('wieloośrodkowe'); }
  if (/double-?blind/i.test(text)) { design += 4; reasons.push('podwójnie zaślepione'); }
  if (/phase (3|iii)\b|clinical trial, phase iii/i.test(text + ' ' + pt)) design += 4;
  if (/placebo/i.test(abs)) design += 2;
  if (['RCT', 'Meta-analiza'].includes(a.type) && /\b(all-cause (death|mortality)|cardiovascular death|mortality|myocardial infarction|hospitali[sz]ation for heart failure|MACE|major adverse cardiovascular)\b/i.test(abs)) design += 4;
  s += Math.min(12, design);

  // komentarz redakcyjny o tym samym badaniu
  if (trial && ctx.editorialNames?.has(trial.toUpperCase())) { s += 10; reasons.push('z komentarzem redakcyjnym'); }

  // badania podstawowe
  const basic = /\b(mice|mouse|murine|rats?|zebrafish|porcine model|in vitro|organoids?)\b/i.test(text) && !/patients/i.test(abs);
  if (basic) { s -= 12; }

  if (profile) s += profileScore(a, { title, text, basic, protocol, jp }, profile, reasons);

  return finish(a, s, reasons);
}

// ---------- profil osobisty (profile.json, opis: profil-zawodowy.md) ----------
const rx = s => new RegExp(s, 'i');
export function compileProfile(p) {
  const areas = o => Object.entries(o || {}).map(([name, re]) => [name, rx(re)]);
  return {
    core: { ...p.core, areas: areas(p.core?.areas) },
    secondary: { ...p.secondary, areas: areas(p.secondary?.areas) },
    procedures: { ...p.procedures, re: rx(p.procedures.re) },
    penalties: { ...p.penalties, pediatricRe: rx(p.penalties.pediatricRe), cardioRe: rx(p.penalties.cardioRe), cardioJournalRe: rx(p.penalties.cardioJournalRe) },
    types: { ...p.types, educationalRe: rx(p.types.educationalRe), realWorldRe: rx(p.types.realWorldRe) },
    sources: { ...p.sources, europeanJournals: new Set(p.sources.europeanJournals), polishJournals: new Set(p.sources.polishJournals), polishRe: new RegExp(p.sources.polishRe) },
    guidelines: { ...p.guidelines, preferredRe: new RegExp(p.guidelines.preferredRe), americanRe: new RegExp(p.guidelines.americanRe) },
  };
}

function profileScore(a, { title, text, basic, protocol, jp }, P, reasons) {
  let s = 0; const mine = [];
  // dziedzina w tytule = pełne punkty, tylko w abstrakcie = część; nieznane czasopismo = część
  const hits = areas => areas.filter(([, re]) => re.test(text)).map(([n, re]) => ({ n, inTitle: re.test(title) }));
  const pts = (base, h) => base * (h.some(x => x.inTitle) ? 1 : P.abstractFactor ?? 1) * (jp ? 1 : P.unknownJournalFactor ?? 1);
  const core = hits(P.core.areas), sec = hits(P.secondary.areas);
  const cp = core.length ? pts(P.core.points, core) + (core.length > 1 ? P.core.bothBonus : 0) : 0;
  const sp = sec.length ? pts(P.secondary.points, sec) : 0;
  s += Math.max(cp, sp);
  // etykieta: najpierw dziedziny z tytułu
  const named = [...core, ...sec].sort((x, y) => y.inTitle - x.inTitle);
  if (named.length) mine.push(...(named.some(x => x.inTitle) ? named.filter(x => x.inTitle) : named).map(x => x.n));
  if (P.procedures.re.test(text)) { s += P.procedures.points; if (!mine.length) mine.push(P.procedures.label); }
  a.profile = mine.length ? (cp && cp >= sp ? 2 : 1) : 0; // 2 = główna dziedzina, 1 = poboczna
  if (mine.length) reasons.unshift(`Twój profil: ${mine.slice(0, 2).join(', ')}`);

  // typ: przeglądy edukacyjne i rejestry wyżej
  const T = P.types;
  if (a.type in T.points) s += T.points[a.type] - (TYPE_POINTS[a.type] ?? 0);
  if (a.type === 'Przegląd') {
    if (mine.length) s += T.reviewInProfile;
    if (T.educationalRe.test(title)) { s += T.educational; reasons.push('przegląd edukacyjny'); }
  }
  if (['Oryginalny', 'Meta-analiza'].includes(a.type) && T.realWorldRe.test(text)) { s += T.realWorld; reasons.push('rejestr / real-world'); }

  // źródła: europejskie i polskie
  const S = P.sources;
  if (S.polishJournals.has(a.journalAbbr)) s += S.polish;
  else if (S.europeanJournals.has(a.journalAbbr)) s += S.european;
  if (S.polishRe.test(text)) { s += S.polishText; reasons.push('Polska'); }

  // kary: to, czego nie chcę widzieć
  const X = P.penalties;
  if (basic) s += X.basicScience;
  if (protocol) s += X.protocol;
  if (X.pediatricRe.test(title)) { s += X.pediatricTitle; reasons.push('pediatria'); }
  if (!X.cardioJournalRe.test(a.journalAbbr || a.journal || '') && !X.cardioRe.test(text)) { s += X.outOfCardiology; reasons.push('poza kardiologią'); }
  return s;
}

function finish(a, s, reasons) {
  const score = Math.max(0, Math.round(s));
  return { score, stars: score >= STARS[2] ? 3 : score >= STARS[1] ? 2 : score >= STARS[0] ? 1 : 0, reasons: reasons.slice(0, 4) };
}
// progi gwiazdek (kalibrowane na rzeczywistych danych)
export const STARS = [40, 55, 70];

// nazwy badań wymienione w komentarzach redakcyjnych / edytorialach
export function editorialNames(articles) {
  const set = new Set();
  for (const a of articles) {
    if (a.type !== 'Komentarz' && !/editorial|comment/i.test((a.pubTypes || []).join('|'))) continue;
    for (const m of (a.title || '').matchAll(/\b([A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/g))
      if (m[1].length >= 3 && !NOT_TRIAL.has(m[1].toUpperCase())) set.add(m[1].toUpperCase());
  }
  return set;
}

export function scoreAll(articles, profile = null) {
  const ctx = { editorialNames: editorialNames(articles) };
  for (const a of articles) {
    a.profile = 0;
    const r = scoreArticle(a, ctx, profile);
    a.score = r.score; a.stars = r.stars; a.reasons = r.reasons;
    a.highlight = r.stars >= 1;
  }
  return articles;
}
