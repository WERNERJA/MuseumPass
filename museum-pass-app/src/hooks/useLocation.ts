import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { UserLocation } from '../types';

interface UseLocationResult {
  location: UserLocation | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Requests foreground location permission and returns the user's current
 * GPS coordinates. Exposes a `refresh()` to re-acquire on demand.
 */
export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLocation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setError(
          'Location permission denied. Please enable it in Settings to find nearby museums.',
        );
        setLoading(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch (err) {
      setError('Could not determine your location. Please try again.');
      console.error('[useLocation]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  return { location, error, loading, refresh: fetchLocation };
}
