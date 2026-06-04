/**
 * Parser voor Belgische openingsuren in vrije tekst.
 *
 * Herkent:
 *  - Dagbereiken:  "di - zo", "ma-vr", "di t/m zo", "di t.e.m. zo"
 *  - Tijdformaten: "10:00 - 17:00", "10:00 > 17:00", "9.30 - 17.00", "10u - 17u"
 *  - Seizoenen:    "02/05 > 31/10: ma - zo: 14:00 > 17:00"
 *  - Speciaal:     "tijdelijk gesloten", "elke dag", "dagelijks"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenStatus =
  | 'open'               // open op dit moment
  | 'gesloten'           // gesloten vandaag of buiten uren
  | 'tijdelijk_gesloten' // tijdelijk gesloten
  | 'onbekend';          // kan niet bepaald worden

// ---------------------------------------------------------------------------
// Dag-mapping (JS: 0=zo 1=ma 2=di 3=wo 4=do 5=vr 6=za)
// ---------------------------------------------------------------------------

const DAG_JS: Record<string, number> = {
  zondag:0, zo:0, maandag:1, ma:1, dinsdag:2, di:2,
  woensdag:3, wo:3, donderdag:4, do:4, vrijdag:5, vr:5, zaterdag:6, za:6,
};
const DAG_WOORDEN =
  'maandag|ma|dinsdag|di|woensdag|wo|donderdag|do|vrijdag|vr|zaterdag|za|zondag|zo';

function dagNaarJs(naam: string): number | null {
  return DAG_JS[naam.toLowerCase().trim()] ?? null;
}

function dagBereikNaarJs(van: string, tot: string): number[] {
  const ORDER = [1,2,3,4,5,6,0];
  const vanJs = dagNaarJs(van); const totJs = dagNaarJs(tot);
  if (vanJs === null || totJs === null) return [];
  const vanIdx = ORDER.indexOf(vanJs); const totIdx = ORDER.indexOf(totJs);
  if (vanIdx === -1 || totIdx === -1) return [];
  const dagen: number[] = [];
  let i = vanIdx;
  while (true) {
    dagen.push(ORDER[i]);
    if (ORDER[i] === totJs) break;
    i = (i + 1) % 7;
    if (dagen.length > 7) break;
  }
  return dagen;
}

// ---------------------------------------------------------------------------
// Tijdparsing
// ---------------------------------------------------------------------------

function parseMinuten(s: string): number | null {
  s = s.trim().toLowerCase();
  const c = s.match(/^(\d{1,2}):(\d{2})$/);
  if (c) { const h=+c[1],m=+c[2]; if(h<=24&&m<=59) return h*60+m; }
  const u = s.match(/^(\d{1,2})u(\d{2})?$/);
  if (u) { const h=+u[1],m=u[2]?+u[2]:0; if(h<=24&&m<=59) return h*60+m; }
  const d = s.match(/^(\d{1,2})(?:[.,](\d{2}))?$/);
  if (d) { const h=+d[1],m=d[2]?+d[2]:0; if(h<=24&&m<=59) return h*60+m; }
  return null;
}

function extractTijdBereik(s: string): { openMin?: number; sluitMin?: number } {
  const T = String.raw`\d{1,2}(?::\d{2}|[.,]\d{2}|u\d{2}|u)?`;
  const SEP = String.raw`\s*(?:[-–>]|tot)\s*`;
  const m = s.toLowerCase().match(new RegExp(`(${T})${SEP}(${T})`));
  if (!m) return {};
  const openMin = parseMinuten(m[1]);
  const sluitMin = parseMinuten(m[2]);
  if (openMin === null || sluitMin === null || openMin >= sluitMin) return {};
  return { openMin, sluitMin };
}

// ---------------------------------------------------------------------------
// Seizoenscheck: "DD/MM > DD/MM:" of "DD/MM - DD/MM:"
// ---------------------------------------------------------------------------

function isInSeizoen(regel: string, date: Date): boolean | null {
  const m = regel.match(/(\d{1,2})\/(\d{1,2})\s*[>–\-]\s*(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const [, sd, sm, ed, em] = m.map(Number);
  const maand = date.getMonth() + 1;
  const dag = date.getDate();
  const cur = maand * 100 + dag;
  const start = sm * 100 + sd;
  const einde = em * 100 + ed;
  if (start <= einde) return cur >= start && cur <= einde;
  // Seizoen loopt over jaargrens (bijv. okt → mrt)
  return cur >= start || cur <= einde;
}

// ---------------------------------------------------------------------------
// Regelanalyse
// ---------------------------------------------------------------------------

interface Regelinfo {
  jsDagen: number[];
  gesloten: boolean;
  openMin?: number;
  sluitMin?: number;
}

function normaliseer(s: string): string {
  return s.toLowerCase()
    .replace(/t\.e\.m\./g, '-').replace(/t\/m/g, '-')
    .replace(/[–—]/g, '-').replace(/\s+-\s+/g, '-').replace(/\s*-\s*/g, '-');
}

function analyseerRegel(regel: string): Regelinfo | null {
  const lower = normaliseer(regel);
  const isGesloten = /geslo|closed/.test(lower);

  if (/elke.?dag|dagelijks|alle.?dag/.test(lower)) {
    return { jsDagen:[0,1,2,3,4,5,6], gesloten:isGesloten, ...extractTijdBereik(regel) };
  }

  const bereikRe = new RegExp(`\\b(${DAG_WOORDEN})-(${DAG_WOORDEN})\\b`);
  const bereikMatch = lower.match(bereikRe);
  if (bereikMatch) {
    const dagen = dagBereikNaarJs(bereikMatch[1], bereikMatch[2]);
    if (dagen.length > 0)
      return { jsDagen:dagen, gesloten:isGesloten, ...extractTijdBereik(regel) };
  }

  const dagenRe = new RegExp(`\\b(${DAG_WOORDEN})\\b`, 'g');
  const dagMatches = [...lower.matchAll(dagenRe)];
  if (dagMatches.length > 0) {
    const dagen = dagMatches.map(m=>dagNaarJs(m[1])).filter((d): d is number => d!==null);
    if (dagen.length > 0)
      return { jsDagen:dagen, gesloten:isGesloten, ...extractTijdBereik(regel) };
  }

  return null;
}

function splitRegels(s: string): string[] {
  return s
    .replace(/([^\n])(Gesloten:)/gi, '$1\n$2')
    .split(/[\n;|]/).map(r=>r.trim()).filter(r=>r.length>0);
}

// ---------------------------------------------------------------------------
// Kern: evalueer alle regels voor een gegeven datum+tijd
// ---------------------------------------------------------------------------

interface EvalResult {
  openGevonden: boolean;
  geslotenGevonden: boolean;
  aantalGeparste: number;
}

function evalueerRegels(openingsuren: string, date: Date, checkTijd: boolean): EvalResult {
  const targetDag = date.getDay();
  const targetMin = date.getHours() * 60 + date.getMinutes();

  const regels = splitRegels(openingsuren);
  let openGevonden = false;
  let geslotenGevonden = false;
  let aantalGeparste = 0;

  for (const regel of regels) {
    // Seizoensregel: check of de datum in het seizoen valt
    const seizoen = isInSeizoen(regel, date);
    if (seizoen !== null) {
      if (!seizoen) {
        // Buiten seizoen → sla over (museum kan andere seizoensregels hebben)
        aantalGeparste++;
        continue;
      }
      // Binnen seizoen: verwerk de rest van de regel als gewone dagregels
      // Knip het datumgedeelte weg en analyseer de rest
      const restRegel = regel.replace(/\d{1,2}\/\d{1,2}\s*[>–\-]\s*\d{1,2}\/\d{1,2}\s*:?\s*/,'');
      const info = analyseerRegel(restRegel);
      if (!info) { aantalGeparste++; continue; }
      aantalGeparste++;

      if (!info.jsDagen.includes(targetDag)) continue;
      if (info.gesloten) { geslotenGevonden = true; continue; }

      if (checkTijd && info.openMin !== undefined && info.sluitMin !== undefined) {
        if (targetMin >= info.openMin && targetMin < info.sluitMin) openGevonden = true;
        else geslotenGevonden = true;
      } else {
        openGevonden = true;
      }
      continue;
    }

    // Gewone regel
    const info = analyseerRegel(regel);
    if (!info) continue;
    aantalGeparste++;

    if (!info.jsDagen.includes(targetDag)) continue;
    if (info.gesloten) { geslotenGevonden = true; continue; }

    if (checkTijd && info.openMin !== undefined && info.sluitMin !== undefined) {
      if (targetMin >= info.openMin && targetMin < info.sluitMin) openGevonden = true;
      else geslotenGevonden = true;
    } else {
      openGevonden = true;
    }
  }

  return { openGevonden, geslotenGevonden, aantalGeparste };
}

// ---------------------------------------------------------------------------
// Publieke API
// ---------------------------------------------------------------------------

/**
 * Rijke statusbepaling (voor badge in MuseumCard).
 * Controleert dag + tijdstip + seizoen + tijdelijk gesloten.
 */
export function getOpenStatus(openingsuren: string, date: Date): OpenStatus {
  if (!openingsuren?.trim()) return 'onbekend';

  // Tijdelijk gesloten detectie
  if (/tijdelijk\s*geslo|temporary\s*clos|wegens\s*(verbouw|renov|werk)/i.test(openingsuren)) {
    return 'tijdelijk_gesloten';
  }

  const { openGevonden, geslotenGevonden, aantalGeparste } = evalueerRegels(openingsuren, date, true);

  if (geslotenGevonden && !openGevonden) return 'gesloten';
  if (openGevonden) return 'open';
  if (aantalGeparste > 0) return 'gesloten'; // schema gelezen, dag niet gevonden
  return 'onbekend';
}

/**
 * Controleert of een museum open is OP DE GESELECTEERDE DAG (zonder tijdcheck).
 * Gebruik dit voor filtering in de lijst — ongeacht het huidige uur.
 * Retourneert null als het schema onleesbaar is.
 */
export function isOpenOpDag(openingsuren: string, date: Date): boolean | null {
  if (!openingsuren?.trim()) return null;

  if (/tijdelijk\s*geslo|temporary\s*clos|wegens\s*(verbouw|renov|werk)/i.test(openingsuren)) {
    return false;
  }

  // Gebruik 12:00 zodat we puur de DAG checken (niet het uur)
  const middag = new Date(date);
  middag.setHours(12, 0, 0, 0);

  const { openGevonden, geslotenGevonden, aantalGeparste } = evalueerRegels(openingsuren, middag, false);

  if (geslotenGevonden && !openGevonden) return false;
  if (openGevonden) return true;
  if (aantalGeparste > 0) return false;
  return null;
}

/** Geeft de openingsuren als tekst terug voor weergave. */
export function formatOpeningsuren(openingsuren: string): string {
  return openingsuren?.trim() ?? '';
}

/** Naam van de huidige weekdag in het Nederlands. */
export function huidigeDagNaam(): string {
  const namen = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  return namen[new Date().getDay()];
}

/**
 * Status voor een TOEKOMSTIGE dag: enkel dag checken, uur doet er niet toe.
 * Gebruikt 12:00 als referentietijdstip.
 */
export function getOpenStatusDagOnly(openingsuren: string, date: Date): OpenStatus {
  if (!openingsuren?.trim()) return 'onbekend';
  if (/tijdelijk\s*geslo|temporary\s*clos|wegens\s*(verbouw|renov|werk)/i.test(openingsuren)) {
    return 'tijdelijk_gesloten';
  }
  const middag = new Date(date);
  middag.setHours(12, 0, 0, 0);
  const { openGevonden, geslotenGevonden, aantalGeparste } =
    evalueerRegels(openingsuren, middag, false);
  if (geslotenGevonden && !openGevonden) return 'gesloten';
  if (openGevonden) return 'open';
  if (aantalGeparste > 0) return 'gesloten';
  return 'onbekend';
}

/** Achterwaartse compatibiliteit. */
export function isLikelyOpenOnDate(openingsuren: string, date: Date): boolean | null {
  const s = getOpenStatus(openingsuren, date);
  if (s === 'open') return true;
  if (s === 'gesloten' || s === 'tijdelijk_gesloten') return false;
  return null;
}
