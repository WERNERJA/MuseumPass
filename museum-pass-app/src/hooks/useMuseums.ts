import { useState, useEffect, useCallback, useRef } from 'react';
import { Museum, UserLocation } from '../types';
import { getAllMusea, getMuseaByGemeente } from '../services/firestore';
import { haversineDistanceKm } from '../utils/distance';
import { isOpenOpDag } from '../utils/openingHours';
import { geocodeMuseaBatch } from '../utils/geocoding';

// ---------------------------------------------------------------------------
// useNearbyMusea
// ---------------------------------------------------------------------------

interface UseNearbyMuseaOptions {
  location: UserLocation | null;
  radiusKm?: number;
  filterDate?: Date;
}

interface UseNearbyMuseaResult {
  musea: Museum[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Laadt alle musea EENMALIG en hergebruikt die cache bij elke radius-/datumwijziging.
 * Geocoding loopt eenmalig op de achtergrond.
 * Filteren en sorteren gebeurt in-memory — geen extra Firestore-aanroepen.
 */
export function useNearbyMusea({
  location,
  radiusKm = 25,
  filterDate,
}: UseNearbyMuseaOptions): UseNearbyMuseaResult {
  // Volledige gecachede museumlijst (met coördinaten na geocoding)
  const allMuseaRef = useRef<Museum[]>([]);
  const geocodingDoneRef = useRef(false);

  const [musea, setMusea] = useState<Museum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Pas het filter toe op de gecachede lijst — GEEN netwerkaanroep. */
  const applyFilter = useCallback(
    (lijst: Museum[]) => {
      if (!location) return;
      const filtered = lijst
        .filter((m) => m.latitude !== undefined && m.longitude !== undefined)
        .map((m) => ({
          ...m,
          distanceKm: haversineDistanceKm(
            location.latitude, location.longitude,
            m.latitude!, m.longitude!,
          ),
        }))
        .filter((m) => m.distanceKm <= radiusKm)
        .filter((m) =>
          filterDate ? isOpenOpDag(m.openingsuren, filterDate) !== false : true,
        )
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

      setMusea(filtered);
    },
    [location, radiusKm, filterDate],
  );

  /** Initieel laden + geocoding (één keer). */
  const initialLoad = useCallback(async () => {
    if (!location) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const all = await getAllMusea();
      allMuseaRef.current = all;
      applyFilter(all); // toon meteen wat er is (zonder coördinaten → leeg, snel)
      setLoading(false);

      // Geocoding op achtergrond — één keer
      if (!geocodingDoneRef.current) {
        geocodingDoneRef.current = true;
        const geocoded = await geocodeMuseaBatch(all, 10, 200);
        allMuseaRef.current = geocoded;
        applyFilter(geocoded); // update met coördinaten
      }
    } catch (err) {
      setError('Musea konden niet worden geladen. Controleer je verbinding.');
      console.error('[useNearbyMusea]', err);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]); // alleen herladen bij locatiewijziging

  // Initieel laden
  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  // Herfilter in-memory als radius of datum wijzigt (GEEN Firestore-aanroep)
  useEffect(() => {
    if (allMuseaRef.current.length > 0) {
      applyFilter(allMuseaRef.current);
    }
  }, [applyFilter]);

  const refresh = useCallback(async () => {
    geocodingDoneRef.current = false;
    allMuseaRef.current = [];
    await initialLoad();
  }, [initialLoad]);

  return { musea, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useMuseaByGemeente
// ---------------------------------------------------------------------------

interface UseMuseaByGemeinteOptions {
  gemeente: string;
  filterDate?: Date;
}

interface UseMuseaByGemeinteResult {
  musea: Museum[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMuseaByGemeente({
  gemeente,
  filterDate,
}: UseMuseaByGemeinteOptions): UseMuseaByGemeinteResult {
  const [musea, setMusea] = useState<Museum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!gemeente) { setMusea([]); return; }
    setLoading(true);
    setError(null);
    try {
      const gemeenteMusea = await getMuseaByGemeente(gemeente);
      const filtered = filterDate
        ? gemeenteMusea.filter(
            (m) => isOpenOpDag(m.openingsuren, filterDate) !== false,
          )
        : gemeenteMusea;
      setMusea(filtered);
    } catch (err) {
      setError('Musea konden niet worden geladen. Controleer je verbinding.');
      console.error('[useMuseaByGemeente]', err);
    } finally {
      setLoading(false);
    }
  }, [gemeente, filterDate]);

  useEffect(() => { fetch(); }, [fetch]);

  return { musea, loading, error, refresh: fetch };
}

// ---------------------------------------------------------------------------
// useAllMusea
// ---------------------------------------------------------------------------

interface UseAllMuseaResult {
  musea: Museum[];
  setMusea: React.Dispatch<React.SetStateAction<Museum[]>>;
  loading: boolean;
  error: string | null;
}

export function useAllMusea(): UseAllMuseaResult {
  const [musea, setMusea] = useState<Museum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllMusea()
      .then(setMusea)
      .catch((err) => {
        setError('Musea konden niet worden geladen.');
        console.error('[useAllMusea]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  return { musea, setMusea, loading, error };
}
