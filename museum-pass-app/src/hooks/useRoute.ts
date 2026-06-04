import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Museum } from '../types';

const STORAGE_KEY = '@museum_pass:route_selection';

interface UseRouteResult {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  addToRoute: (museum: Museum) => Promise<void>;
  removeFromRoute: (id: string) => Promise<void>;
  toggleRoute: (museum: Museum) => Promise<void>;
  clearRoute: () => Promise<void>;
  selectedMusea: Museum[];
  loading: boolean;
}

/**
 * Beheert de routeselectie van de gebruiker, waarbij de gekozen museum-ID's
 * worden opgeslagen in AsyncStorage zodat de selectie app-herstarts overleeft.
 *
 * `selectedMusea` wordt afgeleid van `alleMusea`, dus het weerspiegelt altijd
 * de meest recente museumdata uit Firestore (inclusief al_bezocht).
 */
export function useRoute(alleMusea: Museum[]): UseRouteResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Laad opgeslagen selectie bij mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          setSelectedIds(new Set(ids));
        }
      })
      .catch((err) => console.error('[useRoute] laden mislukt', err))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: Set<string>) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(next)),
      );
    } catch (err) {
      console.error('[useRoute] opslaan mislukt', err);
    }
  }, []);

  const addToRoute = useCallback(
    async (museum: Museum) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(museum.id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeFromRoute = useCallback(
    async (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggleRoute = useCallback(
    async (museum: Museum) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(museum.id)) {
          next.delete(museum.id);
        } else {
          next.add(museum.id);
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearRoute = useCallback(async () => {
    setSelectedIds(new Set());
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  // Leid de volledige museum-objecten af uit de geselecteerde ID's
  const selectedMusea = alleMusea.filter((m) => selectedIds.has(m.id));

  return {
    selectedIds,
    isSelected,
    addToRoute,
    removeFromRoute,
    toggleRoute,
    clearRoute,
    selectedMusea,
    loading,
  };
}
