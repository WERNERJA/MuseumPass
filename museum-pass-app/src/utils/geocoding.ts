import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Museum } from '../types';

const CACHE_KEY = 'geocode_cache_v1';

type CoordCache = Record<string, { latitude: number; longitude: number }>;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function loadCache(): Promise<CoordCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CoordCache;
  } catch (err) {
    console.warn('[geocoding] cache lezen mislukt', err);
  }
  return {};
}

async function saveCache(cache: CoordCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[geocoding] cache opslaan mislukt', err);
  }
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

/**
 * Geeft {latitude, longitude} terug voor een museum, of null als geocoding mislukt.
 *
 * - Gebruikt eerst de AsyncStorage-cache (sleutel: museum.id).
 * - Bij cache-miss: bouwt een adresstring en roept expo-location geocodeAsync aan.
 * - Slaat het resultaat op in de cache voor toekomstige gebruik.
 */
export async function geocodeMuseum(
  museum: Museum,
): Promise<{ latitude: number; longitude: number } | null> {
  // Terugval als het museum al coördinaten heeft (bijv. ingesteld door een vorige run)
  if (museum.latitude !== undefined && museum.longitude !== undefined) {
    return { latitude: museum.latitude, longitude: museum.longitude };
  }

  // Controleer de cache
  const cache = await loadCache();
  if (cache[museum.id]) {
    return cache[museum.id];
  }

  // Sla musea zonder adresgegevens over
  if (!museum.gemeente && !museum.postcode) {
    return null;
  }

  // Bouw adresstring op
  const parts: string[] = [];
  if (museum.straat) {
    parts.push(
      museum.huisnummer
        ? `${museum.straat} ${museum.huisnummer}`
        : museum.straat,
    );
  }
  if (museum.postcode && museum.gemeente) {
    parts.push(`${museum.postcode} ${museum.gemeente}`);
  } else if (museum.gemeente) {
    parts.push(museum.gemeente);
  } else if (museum.postcode) {
    parts.push(museum.postcode);
  }
  parts.push('België');

  const address = parts.join(', ');

  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0) {
      const { latitude, longitude } = results[0];
      const coord = { latitude, longitude };

      // Sla op in cache
      cache[museum.id] = coord;
      await saveCache(cache);

      return coord;
    }
  } catch (err) {
    console.warn(`[geocoding] mislukt voor "${museum.naam}":`, err);
  }

  return null;
}

/**
 * Geocodeer een batch musea en retourneer een bijgewerkte array met
 * latitude/longitude ingesteld waar geocoding slaagde.
 *
 * @param musea     De te geocoderen musea
 * @param batchSize Aantal parallel geocoding-verzoeken (standaard 5)
 * @param delayMs   Vertraging tussen batches om rate limiting te vermijden (standaard 300ms)
 */
export async function geocodeMuseaBatch(
  musea: Museum[],
  batchSize = 5,
  delayMs = 300,
): Promise<Museum[]> {
  const result: Museum[] = [...musea];

  for (let i = 0; i < musea.length; i += batchSize) {
    const batch = musea.slice(i, i + batchSize);

    const coords = await Promise.all(batch.map((m) => geocodeMuseum(m)));

    coords.forEach((coord, j) => {
      const globalIndex = i + j;
      if (coord) {
        result[globalIndex] = {
          ...result[globalIndex],
          latitude: coord.latitude,
          longitude: coord.longitude,
        };
      }
    });

    // Wacht even tussen batches (niet na de laatste batch)
    if (i + batchSize < musea.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}
