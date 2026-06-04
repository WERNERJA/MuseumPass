import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Museum } from '../types';
import { getAllMusea } from '../services/firestore';

const STORAGE_KEY = '@museum_pass:route_selection';

interface RouteContextValue {
  selectedIds: Set<string>;
  /** Musea in de gebruiker-gedefinieerde volgorde */
  selectedMusea: Museum[];
  isSelected: (id: string) => boolean;
  toggleRoute: (museum: Museum) => void;
  clearRoute: () => void;
  registerMusea: (musea: Museum[]) => void;
  /** Verplaats een museum 1 positie omhoog in de route */
  moveUp: (id: string) => void;
  /** Verplaats een museum 1 positie omlaag in de route */
  moveDown: (id: string) => void;
  /** Stel de volledige volgorde in (array van IDs) */
  reorder: (orderedIds: string[]) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouteProvider({ children }: { children: React.ReactNode }) {
  // Geordende lijst van IDs (volgorde bepaalt de route)
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [museumRegistry, setMuseumRegistry] = useState<Map<string, Museum>>(new Map());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          setOrderedIds(ids);
        }
      })
      .catch((err) => console.error('[RouteContext] laden mislukt', err));

    getAllMusea()
      .then((musea) => {
        setMuseumRegistry((prev) => {
          const next = new Map(prev);
          musea.forEach((m) => next.set(m.id, m));
          return next;
        });
      })
      .catch((err) => console.error('[RouteContext] musea laden mislukt', err));
  }, []);

  const persist = useCallback((ids: string[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(
      (err) => console.error('[RouteContext] opslaan mislukt', err),
    );
  }, []);

  const registerMusea = useCallback((musea: Museum[]) => {
    setMuseumRegistry((prev) => {
      const next = new Map(prev);
      musea.forEach((m) => next.set(m.id, m));
      return next;
    });
  }, []);

  const toggleRoute = useCallback(
    (museum: Museum) => {
      setMuseumRegistry((prev) => {
        if (!prev.has(museum.id)) {
          const next = new Map(prev);
          next.set(museum.id, museum);
          return next;
        }
        return prev;
      });

      setOrderedIds((prev) => {
        const idx = prev.indexOf(museum.id);
        let next: string[];
        if (idx >= 0) {
          next = prev.filter((id) => id !== museum.id);
        } else {
          next = [...prev, museum.id];
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearRoute = useCallback(() => {
    setOrderedIds([]);
    AsyncStorage.removeItem(STORAGE_KEY).catch(console.error);
  }, []);

  const selectedIds = new Set(orderedIds);

  const isSelected = useCallback(
    (id: string) => orderedIds.includes(id),
    [orderedIds],
  );

  const moveUp = useCallback(
    (id: string) => {
      setOrderedIds((prev) => {
        const idx = prev.indexOf(id);
        if (idx <= 0) return prev;
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const moveDown = useCallback(
    (id: string) => {
      setOrderedIds((prev) => {
        const idx = prev.indexOf(id);
        if (idx < 0 || idx >= prev.length - 1) return prev;
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reorder = useCallback(
    (newOrder: string[]) => {
      setOrderedIds(newOrder);
      persist(newOrder);
    },
    [persist],
  );

  const selectedMusea = orderedIds
    .map((id) => museumRegistry.get(id))
    .filter((m): m is Museum => m !== undefined);

  return (
    <RouteContext.Provider
      value={{
        selectedIds,
        selectedMusea,
        isSelected,
        toggleRoute,
        clearRoute,
        registerMusea,
        moveUp,
        moveDown,
        reorder,
      }}
    >
      {children}
    </RouteContext.Provider>
  );
}

export function useRouteContext(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRouteContext moet binnen RouteProvider gebruikt worden');
  return ctx;
}
