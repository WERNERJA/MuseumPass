import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Museum } from '../types';
import { Colors } from '../constants/colors';
import { formatDistance } from '../utils/distance';
import { getOpenStatus, getOpenStatusDagOnly } from '../utils/openingHours';

interface MuseumCardProps {
  museum: Museum;
  distanceKm?: number;
  isVisited?: boolean;
  isSelected?: boolean;
  onPress: () => void;
  onToggleRoute?: () => void;
  filterDate?: Date;
}

export function MuseumCard({
  museum,
  distanceKm,
  isVisited = false,
  isSelected = false,
  onPress,
  onToggleRoute,
  filterDate,
}: MuseumCardProps) {
  const checkDate = filterDate ?? new Date();

  // Is de gekozen datum vandaag?
  const vandaag = new Date();
  const isVandaag =
    checkDate.getFullYear() === vandaag.getFullYear() &&
    checkDate.getMonth() === vandaag.getMonth() &&
    checkDate.getDate() === vandaag.getDate();

  // Vandaag: check dag + huidig uur. Andere dag: enkel dag checken.
  const openStatus = isVandaag
    ? getOpenStatus(museum.openingsuren, checkDate)
    : getOpenStatusDagOnly(museum.openingsuren, checkDate);

  const badgeStyle =
    openStatus === 'open'               ? styles.badgeOpen :
    openStatus === 'tijdelijk_gesloten' ? styles.badgeTijdelijk :
    openStatus === 'gesloten'           ? styles.badgeClosed :
    styles.badgeOnbekend;

  const badgeTextStyle =
    openStatus === 'open'               ? styles.badgeTextOpen :
    openStatus === 'tijdelijk_gesloten' ? styles.badgeTextTijdelijk :
    openStatus === 'gesloten'           ? styles.badgeTextClosed :
    styles.badgeTextOnbekend;

  const badgeLabel =
    openStatus === 'open'               ? (isVandaag ? 'Nu open' : 'Open') :
    openStatus === 'tijdelijk_gesloten' ? 'Tijdelijk gesloten' :
    openStatus === 'gesloten'           ? 'Gesloten' :
    '? Check website';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isVisited && styles.cardVisited,
        isSelected && styles.cardSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Linkse icoon kolom */}
      <View style={styles.iconCol}>
        <View style={[styles.iconCircle, isVisited && styles.iconCircleVisited]}>
          {isVisited
            ? <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
            : <Ionicons name="business" size={22} color={Colors.primary} />
          }
        </View>
      </View>

      {/* Inhoud */}
      <View style={styles.content}>
        <Text style={[styles.name, isVisited && styles.nameVisited]} numberOfLines={2}>
          {museum.naam}
        </Text>

        {museum.gemeente ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.gemeente}> {museum.gemeente}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[styles.badgeText, badgeTextStyle]}>{badgeLabel}</Text>
          </View>
          {distanceKm !== undefined && (
            <Text style={styles.distance}>{formatDistance(distanceKm)}</Text>
          )}
        </View>
      </View>

      {/* Route knop */}
      {onToggleRoute && (
        <TouchableOpacity
          style={styles.routeBtn}
          onPress={onToggleRoute}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isSelected ? 'remove-circle' : 'add-circle-outline'}
            size={26}
            color={isSelected ? Colors.error : Colors.primary}
          />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardVisited: {
    backgroundColor: '#F0F4F8',
    opacity: 0.85,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  iconCol: {
    marginRight: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleVisited: {
    backgroundColor: Colors.primary,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  nameVisited: {
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gemeente: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeOpen:      { backgroundColor: '#D1FAE5' },
  badgeClosed:    { backgroundColor: '#FEE2E2' },
  badgeTijdelijk: { backgroundColor: '#FFE4CC' },
  badgeOnbekend:  { backgroundColor: '#FEF9C3' },
  badgeText:      { fontSize: 11, fontWeight: '600' },
  badgeTextOpen:      { color: '#065F46' },
  badgeTextClosed:    { color: '#991B1B' },
  badgeTextTijdelijk: { color: '#92400E' },
  badgeTextOnbekend:  { color: '#78716C' },
  distance: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  routeBtn: {
    marginLeft: 8,
    padding: 2,
  },
});
