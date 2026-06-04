import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
  Region,
} from 'react-native-maps';
import { Museum, UserLocation } from '../types';
import { Colors } from '../constants/colors';
import { fetchRoadRoute, LatLng } from '../utils/roadRouting';

interface RouteMapProps {
  museums: Museum[];
  userLocation?: UserLocation | null;
  style?: object;
}

function regionForPoints(
  museums: Museum[],
  userLocation?: UserLocation | null,
): Region {
  const points = [
    ...museums
      .filter((m) => m.latitude !== undefined && m.longitude !== undefined)
      .map((m) => ({ lat: m.latitude!, lng: m.longitude! })),
    ...(userLocation
      ? [{ lat: userLocation.latitude, lng: userLocation.longitude }]
      : []),
  ];

  if (points.length === 0) {
    return { latitude: 50.85, longitude: 4.35, latitudeDelta: 2.5, longitudeDelta: 2.5 };
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + 0.15, 0.05),
    longitudeDelta: Math.max(maxLng - minLng + 0.15, 0.05),
  };
}

export function RouteMap({ museums, userLocation, style }: RouteMapProps) {
  const museaWithCoords = museums.filter(
    (m) => m.latitude !== undefined && m.longitude !== undefined,
  );
  const region = regionForPoints(museaWithCoords, userLocation);

  // Waypoints: gebruiker (optioneel) + musea op volgorde
  const waypoints: LatLng[] = [
    ...(userLocation
      ? [{ latitude: userLocation.latitude, longitude: userLocation.longitude }]
      : []),
    ...museaWithCoords.map((m) => ({
      latitude: m.latitude!,
      longitude: m.longitude!,
    })),
  ];

  // Route polyline die wegen volgt
  const [roadPolyline, setRoadPolyline] = useState<LatLng[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoadPolyline(waypoints);
      return;
    }

    setLoadingRoute(true);
    fetchRoadRoute(waypoints)
      .then(setRoadPolyline)
      .finally(() => setLoadingRoute(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(waypoints)]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        region={region}
        showsUserLocation
        mapType="standard"
      >
        {/* Wegvolgende polyline */}
        {roadPolyline.length > 1 && (
          <Polyline
            coordinates={roadPolyline}
            strokeColor={Colors.primary}
            strokeWidth={4}
          />
        )}

        {/* Museummarkers met volgnummers */}
        {museaWithCoords.map((museum, index) => (
          <Marker
            key={museum.id}
            coordinate={{
              latitude: museum.latitude!,
              longitude: museum.longitude!,
            }}
            title={`${index + 1}. ${museum.naam}`}
            description={museum.gemeente || undefined}
            pinColor={
              index === 0
                ? Colors.routeStart
                : index === museaWithCoords.length - 1
                ? Colors.routeEnd
                : Colors.primary
            }
          />
        ))}
      </MapView>

      {/* Laad-indicator terwijl route wordt opgehaald */}
      {loadingRoute && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.primary} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
});
