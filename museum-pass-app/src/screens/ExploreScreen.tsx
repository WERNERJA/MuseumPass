import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import { RootStackParamList } from '../types';
import { useMuseaByGemeente } from '../hooks/useMuseums';
import { useVisited } from '../hooks/useVisited';
import { useRouteContext } from '../context/RouteContext';
import { MuseumCard } from '../components/MuseumCard';
import { DatePicker } from '../components/DatePicker';
import { getAvailableGemeenten } from '../services/firestore';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export function ExploreScreen() {
  const navigation = useNavigation<Navigation>();
  const [selectedGemeente, setSelectedGemeente] = useState('');
  const [filterDate, setFilterDate] = useState(new Date());
  const [gemeenten, setGemeenten] = useState<string[]>([]);
  const [gemeentenLoading, setGemeentenLoading] = useState(true);

  // Zoekbalk state
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { musea, loading, error } = useMuseaByGemeente({
    gemeente: selectedGemeente,
    filterDate,
  });
  const { isVisited } = useVisited();
  const { isSelected, toggleRoute, registerMusea } = useRouteContext();

  React.useEffect(() => {
    if (musea.length > 0) registerMusea(musea);
  }, [musea, registerMusea]);

  useEffect(() => {
    getAvailableGemeenten()
      .then(setGemeenten)
      .catch(console.error)
      .finally(() => setGemeentenLoading(false));
  }, []);

  // Filter gemeenten op basis van zoektekst
  const filteredGemeenten = useMemo(() => {
    if (!searchText.trim()) return gemeenten;
    const query = searchText.toLowerCase().trim();
    return gemeenten.filter((g) => g.toLowerCase().includes(query));
  }, [gemeenten, searchText]);

  const handleSelectGemeente = (gemeente: string) => {
    setSelectedGemeente(gemeente);
    setSearchText(gemeente);
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  const handleClearSearch = () => {
    setSearchText('');
    setSelectedGemeente('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Koptekst ── */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Verkennen</Text>
        <Text style={styles.screenSubtitle}>Zoek musea per gemeente</Text>
      </View>

      {/* ── Zoekbalk ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Gemeente</Text>
        {gemeentenLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputRow}>
              <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Typ een gemeente (bv. Brussel, Brugge...)"
                placeholderTextColor={Colors.textMuted}
                value={searchText}
                onChangeText={(text) => {
                  setSearchText(text);
                  setShowDropdown(true);
                  if (!text.trim()) setSelectedGemeente('');
                }}
                onFocus={() => setShowDropdown(true)}
                autoCorrect={false}
                autoCapitalize="words"
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Dropdown */}
            {showDropdown && searchText.trim().length > 0 && filteredGemeenten.length > 0 && (
              <View style={styles.dropdown}>
                {filteredGemeenten.slice(0, 8).map((gemeente) => (
                  <TouchableOpacity
                    key={gemeente}
                    style={[
                      styles.dropdownItem,
                      gemeente === selectedGemeente && styles.dropdownItemActive,
                    ]}
                    onPress={() => handleSelectGemeente(gemeente)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={gemeente === selectedGemeente ? Colors.white : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.dropdownText,
                        gemeente === selectedGemeente && styles.dropdownTextActive,
                      ]}
                    >
                      {gemeente}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {showDropdown && searchText.trim().length > 0 && filteredGemeenten.length === 0 && (
              <View style={styles.dropdown}>
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>Geen gemeente gevonden</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Datumfilter ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Open op</Text>
        <DatePicker selectedDate={filterDate} onDateChange={setFilterDate} />
      </View>

      {/* ── Resultaten ── */}
      {!selectedGemeente ? (
        <View style={styles.placeholder}>
          <Ionicons name="map-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.placeholderTitle}>Kies een gemeente</Text>
          <Text style={styles.placeholderText}>
            Typ hierboven een gemeente om de beschikbare musea te zien.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={Colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={musea}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MuseumCard
              museum={item}
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
                {musea.length} museum{musea.length !== 1 ? 'a' : ''} in{' '}
                {selectedGemeente}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="calendar-outline"
                size={48}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyTitle}>Geen musea open die dag</Text>
              <Text style={styles.emptyText}>
                Probeer een andere datum — sommige musea zijn op bepaalde dagen gesloten.
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
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    zIndex: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  searchContainer: {
    zIndex: 20,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    padding: 0,
  },
  dropdown: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primary,
  },
  dropdownText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dropdownTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  dropdownEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: Colors.textMuted,
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
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
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
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
    marginTop: 12,
  },
});
