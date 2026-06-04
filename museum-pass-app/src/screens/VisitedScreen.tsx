import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import { Museum, RootStackParamList } from '../types';
import { getAllMusea } from '../services/firestore';
import { MuseumCard } from '../components/MuseumCard';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export function VisitedScreen() {
  const navigation = useNavigation<Navigation>();
  const [musea, setMusea] = useState<Museum[]>([]);
  const [loading, setLoading] = useState(true);

  // Herlaad data telkens wanneer dit scherm focus krijgt
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getAllMusea()
        .then(setMusea)
        .catch((err) => console.error('[VisitedScreen] laden mislukt', err))
        .finally(() => setLoading(false));
    }, []),
  );

  // Leid bezochte musea af direct uit al_bezocht in Firestore
  const bezochtMusea = useMemo(
    () => musea.filter((m) => m.al_bezocht === true),
    [musea],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Koptekst ── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Bezocht</Text>
        {bezochtMusea.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{bezochtMusea.length}</Text>
          </View>
        )}
      </View>

      {/* ── Inhoud ── */}
      {bezochtMusea.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="checkmark-done-circle-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>Nog geen bezoeken</Text>
          <Text style={styles.emptyText}>
            Open een museum in het tabblad "In de buurt" of "Verkennen" en tik
            op "Markeer als bezocht" om je bezoek hier bij te houden.
          </Text>
        </View>
      ) : (
        <FlatList
          data={bezochtMusea}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <MuseumCard
              museum={item}
              isVisited={true}
              onPress={() =>
                navigation.navigate('MuseumDetail', { museumId: item.id })
              }
            />
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.resultCount}>
                {bezochtMusea.length} museum{bezochtMusea.length !== 1 ? 'a' : ''}{' '}
                bezocht
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
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
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
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
