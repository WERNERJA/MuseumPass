import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { Museum, UserLocation } from '../types';
import { Colors } from '../constants/colors';

interface MuseumMapProps {
  museums: Museum[];
  userLocation?: UserLocation | null;
  selectedMuseumId?: string;
  visitedIds?: Set<string>;
  onMarkerPress?: (museum: Museum) => void;
  style?: object;
}

/**
 * Berekent een kaartregio die alle musea (en optioneel de gebruiker) omsluit.
 * Standaard: centrum van België als er geen punten zijn.
 */
function regionForMuseums(
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
    // Standaard: centrum van België
    return {
      latitude: 50.85,
      longitude: 4.35,
      latitudeDelta: 2.5,
      longitudeDelta: 2.5,
    };
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const padding = 0.05;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + padding, 0.05),
    longitudeDelta: Math.max(maxLng - minLng + padding, 0.05),
  };
}

/**
 * Apple Maps (MapKit) weergave met museummarkers.
 * - Blauwe pins voor niet-bezochte musea
 * - Grijze pins voor bezochte musea
 * - Amberkleurige pin voor het geselecteerde museum
 * - Alleen musea MET coördinaten krijgen een marker
 */
export function MuseumMap({
  museums,
  userLocation,
  selectedMuseumId,
  visitedIds = new Set(),
  onMarkerPress,
  style,
}: MuseumMapProps) {
  const mapRef = useRef<MapView>(null);
  const museaWithCoords = museums.filter(
    (m) => m.latitude !== undefined && m.longitude !== undefined,
  );
  const region = regionForMuseums(museaWithCoords, userLocation);

  // Herpositioneer de kaart als de museumlijst verandert
  useEffect(() => {
    if (mapRef.current && museaWithCoords.length > 0) {
      mapRef.current.animateToRegion(
        regionForMuseums(museaWithCoords, userLocation),
        500,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museaWithCoords.length, userLocation]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
      >
        {museaWithCoords.map((museum) => {
          const isSelected = museum.id === selectedMuseumId;
          const isVisited = visitedIds.has(museum.id);

          return (
            <Marker
              key={museum.id}
              coordinate={{
                latitude: museum.latitude!,
                longitude: museum.longitude!,
              }}
              title={museum.naam}
              description={museum.gemeente || undefined}
              pinColor={
                isVisited
                  ? Colors.visited
                  : isSelected
                  ? Colors.accent
                  : Colors.primary
              }
              onPress={() => onMarkerPress?.(museum)}
            />
          );
        })}
      </MapView>
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
});
