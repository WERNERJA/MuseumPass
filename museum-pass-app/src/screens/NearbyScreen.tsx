import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import { Museum, RootStackParamList } from '../types';
import { useLocation } from '../hooks/useLocation';
import { useNearbyMusea } from '../hooks/useMuseums';
import { useVisited } from '../hooks/useVisited';
import { useRouteContext } from '../context/RouteContext';
import { MuseumCard } from '../components/MuseumCard';
import { MuseumMap } from '../components/MuseumMap';
import { DatePicker } from '../components/DatePicker';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export function NearbyScreen() {
  const navigation = useNavigation<Navigation>();
  const [filterDate, setFilterDate] = useState(new Date());
  const [radiusKm, setRadiusKm] = useState(25);
  const [sliderValue, setSliderValue] = useState(25);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [refreshing, setRefreshing] = useState(false);

  const { location, error: locationError, loading: locationLoading } =
    useLocation();
  const { musea, loading, error, refresh } = useNearbyMusea({
    location,
    radiusKm,
    filterDate,
  });
  const { isVisited } = useVisited();
  const { isSelected, toggleRoute, registerMusea } = useRouteContext();

  // Registreer geladen musea in de globale context
  React.useEffect(() => {
    if (musea.length > 0) registerMusea(musea);
  }, [musea, registerMusea]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // ----- Laden / foutstatus -----

  if (locationLoading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.statusText}>Locatie ophalen…</Text>
      </SafeAreaView>
    );
  }

  if (locationError) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Ionicons name="location-outline" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>Locatie niet beschikbaar</Text>
        <Text style={styles.errorText}>{locationError}</Text>
      </SafeAreaView>
    );
  }

  // ----- Hoofd-UI -----

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Koptekst ── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>In de buurt</Text>

        {/* Lijst / Kaart toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              viewMode === 'list' && styles.toggleBtnActive,
            ]}
            onPress={() => setViewMode('list')}
            accessibilityLabel="Lijstweergave"
          >
            <Ionicons
              name="list"
              size={18}
              color={viewMode === 'list' ? Colors.white : Colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              viewMode === 'map' && styles.toggleBtnActive,
            ]}
            onPress={() => setViewMode('map')}
            accessibilityLabel="Kaartweergave"
          >
            <Ionicons
              name="map"
              size={18}
              color={viewMode === 'map' ? Colors.white : Colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filters ── */}
      <View style={styles.filters}>
        {/* Datumkiezer */}
        <DatePicker selectedDate={filterDate} onDateChange={setFilterDate} />

        {/* Straalslider */}
        <View style={styles.sliderContainer}>
          <View style={styles.sliderLabelRow}>
            <Text style={styles.sliderLabel}>Straal</Text>
            <View style={styles.sliderValueBadge}>
              <Text style={styles.sliderValueText}>{sliderValue} km</Text>
            </View>
          </View>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderEdge}>5</Text>
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={100}
              step={5}
              value={sliderValue}
              minimumTrackTintColor={Colors.primary}
              maximumTrackTintColor={Colors.border}
              thumbTintColor={Colors.primary}
              onValueChange={(v) => setSliderValue(Math.round(v))}
              onSlidingComplete={(v) => setRadiusKm(Math.round(v))}
            />
            <Text style={styles.sliderEdge}>100</Text>
          </View>
        </View>
      </View>

      {/* ── Inhoud ── */}
      {viewMode === 'map' ? (
        <MuseumMap
          museums={musea}
          userLocation={location}
          visitedIds={new Set(musea.filter((m) => isVisited(m)).map((m) => m.id))}
          onMarkerPress={(m: Museum) =>
            navigation.navigate('MuseumDetail', { museumId: m.id })
          }
          style={styles.mapFull}
        />
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryText}>Opnieuw proberen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.flatList}
          data={musea}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <MuseumCard
              museum={item}
              distanceKm={item.distanceKm}
              isVisited={isVisited(item)}
              isSelected={isSelected(item.id)}
              filterDate={filterDate}
              onPress={() =>
                navigation.navigate('MuseumDetail', { museumId: item.id })
              }
              onToggleRoute={() => toggleRoute(item)}
            />
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.resultCount}>
                {musea.length} museum{musea.length !== 1 ? 'a' : ''}{' '}
                binnen {radiusKm} km
              </Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.emptyTitle}>Zoeken…</Text>
                <Text style={styles.emptyText}>Musea binnen {sliderValue} km zoeken</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Geen musea gevonden</Text>
                <Text style={styles.emptyText}>
                  Vergroot de straal of kies een andere datum.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  filters: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 6,
  },
  sliderContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sliderValueBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  sliderValueText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sliderEdge: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    width: 24,
    textAlign: 'center',
  },
  mapFull: {
    flex: 1,
    margin: 12,
    borderRadius: 16,
  },
  flatList: {
    flex: 1,
  },
  list: {
    paddingBottom: 24,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  statusText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
});
