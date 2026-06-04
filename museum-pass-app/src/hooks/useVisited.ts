import { useState, useCallback } from 'react';
import { Museum } from '../types';
import { toggleBezocht } from '../services/firestore';

interface UseVisitedResult {
  isVisited: (museum: Museum) => boolean;
  toggleVisited: (museum: Museum) => Promise<void>;
  loading: boolean;
}

/**
 * Beheert de bezoekstatus van musea.
 *
 * De bron van waarheid is `al_bezocht` in Firestore — NIET AsyncStorage.
 * `isVisited` leest gewoon de `al_bezocht`-waarde van het museum-object.
 * `toggleVisited` schrijft terug naar Firestore en updatet lokaal de state.
 *
 * De musea-array wordt buiten deze hook geladen (bijv. useAllMusea) en
 * doorgegeven aan de schermen. Na een toggle reflecteert het opgeladen object
 * al de nieuwe waarde (optimistisch via lokale staat in useMuseums).
 */
export function useVisited(): UseVisitedResult {
  const [loading, setLoading] = useState(false);

  const isVisited = useCallback((museum: Museum) => {
    return museum.al_bezocht === true;
  }, []);

  const toggleVisited = useCallback(async (museum: Museum) => {
    setLoading(true);
    try {
      await toggleBezocht(museum.id, !museum.al_bezocht);
    } catch (err) {
      console.error('[useVisited] toggleBezocht mislukt', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isVisited,
    toggleVisited,
    loading,
  };
}
