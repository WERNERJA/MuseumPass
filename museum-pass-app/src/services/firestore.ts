import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { Museum } from '../types';

const MUSEA_COLLECTION = 'musea';

// ---------------------------------------------------------------------------
// HTML entity decoder
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&#38;': '&',
};

function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return text.replace(/&(?:#(?:x[0-9a-fA-F]+|\d+)|[a-zA-Z]+);/g, (match) => {
    return HTML_ENTITIES[match] ?? match;
  });
}

// ---------------------------------------------------------------------------
// Hulpfunctie: Firestore document → Museum object
// ---------------------------------------------------------------------------

function docToMuseum(id: string, data: Record<string, unknown>): Museum {
  return {
    id,
    naam: decodeHtmlEntities((data.naam as string) ?? ''),
    omschrijving: decodeHtmlEntities((data.omschrijving as string) ?? ''),
    openingsuren: (data.openingsuren as string) ?? '',
    straat: decodeHtmlEntities((data.straat as string) ?? ''),
    huisnummer: (data.huisnummer as string) ?? '',
    postcode: (data.postcode as string) ?? '',
    gemeente: decodeHtmlEntities((data.gemeente as string) ?? ''),
    tel: (data.tel as string) ?? '',
    mail: (data.mail as string) ?? '',
    url_museum: (data.url_museum as string) ?? '',
    museumpass_url: (data.museumpass_url as string) ?? '',
    al_bezocht: (data.al_bezocht as boolean) ?? false,
  };
}

// ---------------------------------------------------------------------------
// Lees helpers
// ---------------------------------------------------------------------------

/**
 * Haal alle musea op uit Firestore.
 */
export async function getAllMusea(): Promise<Museum[]> {
  const snapshot = await getDocs(collection(db, MUSEA_COLLECTION));
  return snapshot.docs.map((d) => docToMuseum(d.id, d.data()));
}

/**
 * Haal musea op voor een specifieke gemeente.
 */
export async function getMuseaByGemeente(gemeente: string): Promise<Museum[]> {
  const q = query(
    collection(db, MUSEA_COLLECTION),
    where('gemeente', '==', gemeente),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => docToMuseum(d.id, d.data()));
}

/**
 * Geeft een gesorteerde lijst van unieke gemeenten die minstens één museum hebben.
 * Client-side deduplicatie — geschikt voor de omvang van deze dataset.
 */
export async function getAvailableGemeenten(): Promise<string[]> {
  const musea = await getAllMusea();
  const gemeenteSet = new Set(
    musea.map((m) => m.gemeente).filter((g) => g.trim() !== ''),
  );
  return Array.from(gemeenteSet).sort((a, b) => a.localeCompare(b, 'nl'));
}

/**
 * Geeft alleen de niet-bezochte musea terug (al_bezocht === false).
 */
export async function getNotVisited(): Promise<Museum[]> {
  const q = query(
    collection(db, MUSEA_COLLECTION),
    where('al_bezocht', '==', false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => docToMuseum(d.id, d.data()));
}

// ---------------------------------------------------------------------------
// Schrijf helpers
// ---------------------------------------------------------------------------

/**
 * Zet al_bezocht in Firestore voor het museum met het gegeven ID.
 * Dit is de enige plek waar al_bezocht wordt gewijzigd — nooit automatisch.
 */
export async function toggleBezocht(id: string, bezocht: boolean): Promise<void> {
  const docRef = doc(db, MUSEA_COLLECTION, id);
  await updateDoc(docRef, { al_bezocht: bezocht });
}
