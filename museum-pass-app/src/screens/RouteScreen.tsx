import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import { Museum, RootStackParamList } from '../types';
import { useRouteContext } from '../context/RouteContext';
import { useLocation } from '../hooks/useLocation';
import { RouteMap } from '../components/RouteMap';
import {
  buildAppleMapsUrl,
  totalRouteDistanceKm,
} from '../utils/routeOptimizer';
import { formatDistance } from '../utils/distance';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export function RouteScreen() {
  const navigation = useNavigation<Navigation>();
  const {
    selectedIds,
    selectedMusea,
    toggleRoute,
    clearRoute,
    moveUp,
    moveDown,
  } = useRouteContext();

  const removeFromRoute = (id: string) => {
    const museum = selectedMusea.find((m) => m.id === id);
    if (museum) toggleRoute(museum);
  };
  const { location } = useLocation();

  // Gebruik de gebruiker-gedefinieerde volgorde uit de context (niet auto-optimized)
  const routeMusea = selectedMusea;

  const totaalKm = useMemo(() => {
    if (!location || routeMusea.length === 0) return 0;
    return totalRouteDistanceKm(location, routeMusea);
  }, [location, routeMusea]);

  const handleOpenInKaart = async () => {
    if (routeMusea.length === 0) return;
    const url = buildAppleMapsUrl(routeMusea);
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Fout', 'Apple Maps kon niet worden geopend op dit apparaat.');
    }
  };

  const handleVerwijderRoute = () => {
    Alert.alert(
      'Route wissen',
      'Alle musea uit je route verwijderen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Wissen', style: 'destructive', onPress: clearRoute },
      ],
    );
  };

  // ----- Lege staat -----

  if (selectedIds.size === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Routeplanner</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="navigate-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Geen musea geselecteerd</Text>
          <Text style={styles.emptyText}>
            Tik op het{' '}
            <Text style={{ color: Colors.primary, fontWeight: '700' }}>+</Text>
            {' '}icoon op een museumkaart in "In de buurt" of "Verkennen" om het
            toe te voegen aan je route.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ----- Hoofd-UI -----

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Koptekst ── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Routeplanner</Text>
        <TouchableOpacity
          onPress={handleVerwijderRoute}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.clearText}>Alles wissen</Text>
        </TouchableOpacity>
      </View>

      {/* ── Kaart ── */}
      <RouteMap
        museums={routeMusea}
        userLocation={location}
        style={styles.map}
      />

      {/* ── Samenvattingsbalk ── */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Ionicons name="business-outline" size={16} color={Colors.primary} />
          <Text style={styles.summaryLabel}>
            {routeMusea.length} stop{routeMusea.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {totaalKm > 0 && (
          <View style={styles.summaryItem}>
            <Ionicons name="car-outline" size={16} color={Colors.primary} />
            <Text style={styles.summaryLabel}>
              ~{formatDistance(totaalKm)} totaal
            </Text>
          </View>
        )}
      </View>

      {/* ── Hint ── */}
      <View style={styles.hintBar}>
        <Ionicons name="swap-vertical-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.hintText}>
          Gebruik de pijltjes om musea te verschuiven in de route
        </Text>
      </View>

      {/* ── Geordende stoppenlijst ── */}
      <FlatList
        data={routeMusea}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => (
          <RouteStopRij
            museum={item}
            volgorde={index + 1}
            totaal={routeMusea.length}
            onPress={() =>
              navigation.navigate('MuseumDetail', { museumId: item.id })
            }
            onVerwijder={() => removeFromRoute(item.id)}
            onMoveUp={() => moveUp(item.id)}
            onMoveDown={() => moveDown(item.id)}
            canMoveUp={index > 0}
            canMoveDown={index < routeMusea.length - 1}
          />
        )}
        contentContainerStyle={styles.stopList}
      />

      {/* ── Open in Apple Maps CTA ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.mapsBtn}
          onPress={handleOpenInKaart}
          activeOpacity={0.88}
        >
          <Ionicons name="navigate" size={20} color={Colors.white} />
          <Text style={styles.mapsBtnText}>Openen in Apple Maps</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Routestop-rij subcomponent
// ---------------------------------------------------------------------------

interface RouteStopRijProps {
  museum: Museum;
  volgorde: number;
  totaal: number;
  onPress: () => void;
  onVerwijder: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function RouteStopRij({
  museum,
  volgorde,
  totaal,
  onPress,
  onVerwijder,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: RouteStopRijProps) {
  const dotColor =
    volgorde === 1
      ? Colors.routeStart
      : volgorde === totaal
      ? Colors.routeEnd
      : Colors.primary;

  return (
    <TouchableOpacity
      style={styles.stopRow}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Volgorde-indicator met verbindingslijn */}
      <View style={styles.orderCol}>
        {volgorde > 1 && <View style={styles.lineTop} />}
        <View style={[styles.orderDot, { backgroundColor: dotColor }]}>
          <Text style={styles.orderNum}>{volgorde}</Text>
        </View>
        {volgorde < totaal && <View style={styles.lineBottom} />}
      </View>

      {/* Museuminfo */}
      <View style={styles.stopContent}>
        <Text style={styles.stopName} numberOfLines={1}>
          {museum.naam}
        </Text>
        <Text style={styles.stopGemeente}>{museum.gemeente}</Text>
      </View>

      {/* Verplaatsknoppen */}
      <View style={styles.moveCol}>
        <TouchableOpacity
          onPress={onMoveUp}
          disabled={!canMoveUp}
          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          style={styles.moveBtn}
        >
          <Ionicons
            name="chevron-up"
            size={20}
            color={canMoveUp ? Colors.primary : Colors.border}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onMoveDown}
          disabled={!canMoveDown}
          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          style={styles.moveBtn}
        >
          <Ionicons
            name="chevron-down"
            size={20}
            color={canMoveDown ? Colors.primary : Colors.border}
          />
        </TouchableOpacity>
      </View>

      {/* Verwijderknop */}
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={onVerwijder}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Verwijder ${museum.naam} uit route`}
      >
        <Ionicons name="close-circle" size={20} color={Colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  clearText: {
    fontSize: 14,
    color: Colors.error,
    fontWeight: '600',
  },
  map: {
    height: 220,
    marginHorizontal: 16,
    borderRadius: 16,
  },
  summaryBar: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  stopList: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  orderCol: {
    width: 32,
    alignItems: 'center',
  },
  orderDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderNum: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  lineTop: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    minHeight: 12,
  },
  lineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    minHeight: 12,
  },
  stopContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stopGemeente: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  moveCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    marginRight: 2,
  },
  moveBtn: {
    padding: 2,
  },
  removeBtn: {
    padding: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapsBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  mapsBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});
