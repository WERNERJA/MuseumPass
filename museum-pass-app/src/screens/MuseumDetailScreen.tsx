import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import { Museum, RootStackParamList } from '../types';
import { getAllMusea, toggleBezocht } from '../services/firestore';
import { useRouteContext } from '../context/RouteContext';
import { useLocation } from '../hooks/useLocation';
import { isLikelyOpenOnDate, formatOpeningsuren } from '../utils/openingHours';
import { haversineDistanceKm, formatDistance } from '../utils/distance';

type Props = NativeStackScreenProps<RootStackParamList, 'MuseumDetail'>;

export function MuseumDetailScreen({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { museumId } = route.params;

  const [museum, setMuseum] = useState<Museum | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);

  const { location } = useLocation();
  const { isSelected, toggleRoute } = useRouteContext();

  // Laad het specifieke museum bij mount
  useEffect(() => {
    getAllMusea()
      .then((all) => {
        const found = all.find((m) => m.id === museumId) ?? null;
        setMuseum(found);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [museumId]);

  const handleToggleBezocht = useCallback(async () => {
    if (!museum || toggleLoading) return;
    setToggleLoading(true);
    try {
      const newValue = !museum.al_bezocht;
      await toggleBezocht(museum.id, newValue);
      setMuseum((prev) => prev ? { ...prev, al_bezocht: newValue } : prev);
    } catch (err) {
      Alert.alert('Fout', 'Bezoekstatus kon niet worden opgeslagen.');
      console.error('[MuseumDetailScreen] toggleBezocht', err);
    } finally {
      setToggleLoading(false);
    }
  }, [museum, toggleLoading]);

  // ----- Laden / niet-gevonden -----

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!museum) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.notFoundText}>Museum niet gevonden.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Terug</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ----- Afgeleide waarden -----

  const selected = isSelected(museum.id);
  const openStatus = isLikelyOpenOnDate(museum.openingsuren, new Date());
  const openingsuurenTekst = formatOpeningsuren(museum.openingsuren);

  const adres = [
    museum.straat && museum.huisnummer
      ? `${museum.straat} ${museum.huisnummer}`
      : museum.straat,
    museum.postcode && museum.gemeente
      ? `${museum.postcode} ${museum.gemeente}`
      : museum.gemeente,
  ]
    .filter(Boolean)
    .join(', ');

  const distance =
    location != null &&
    museum.latitude !== undefined &&
    museum.longitude !== undefined
      ? haversineDistanceKm(
          location.latitude,
          location.longitude,
          museum.latitude,
          museum.longitude,
        )
      : null;

  const handleOpenKaart = async () => {
    let url: string;
    if (museum.latitude !== undefined && museum.longitude !== undefined) {
      url = `maps://?daddr=${museum.latitude},${museum.longitude}&q=${encodeURIComponent(museum.naam)}&dirflg=d`;
    } else if (adres) {
      url = `maps://?daddr=${encodeURIComponent(adres)}&q=${encodeURIComponent(museum.naam)}&dirflg=d`;
    } else {
      Alert.alert('Fout', 'Geen adres beschikbaar voor navigatie.');
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Fout', 'Apple Maps kon niet worden geopend op dit apparaat.');
    }
  };

  const handleOpenUrl = async (url: string) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  const handleBelefoon = () => {
    if (!museum.tel) return;
    Linking.openURL(`tel:${museum.tel.replace(/\s/g, '')}`);
  };

  const handleMail = () => {
    if (!museum.mail) return;
    Linking.openURL(`mailto:${museum.mail}`);
  };

  // Badge
  const openBadgeStyle =
    openStatus === true
      ? styles.openBadgeOpen
      : openStatus === false
      ? styles.openBadgeClosed
      : styles.openBadgeOnbekend;
  const openBadgeTextStyle =
    openStatus === true
      ? styles.openBadgeTextOpen
      : openStatus === false
      ? styles.openBadgeTextClosed
      : styles.openBadgeTextOnbekend;
  const openBadgeLabel =
    openStatus === true
      ? 'Nu open'
      : openStatus === false
      ? 'Gesloten'
      : '? Controleer website';

  // ----- Hoofd-UI -----

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Terug knop */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        <Text style={styles.backBtnText}>Terug</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero placeholder ── */}
        <View style={styles.hero}>
          <View style={styles.heroPlaceholder}>
            <Ionicons name="business" size={56} color={Colors.primaryLight} />
          </View>

          {/* Bezocht banner */}
          {museum.al_bezocht && (
            <View style={styles.visitedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
              <Text style={styles.visitedBannerText}>Bezocht</Text>
            </View>
          )}
        </View>

        {/* ── Titelsectie ── */}
        <View style={styles.titleSection}>
          {/* Naam + open/gesloten badge */}
          <View style={styles.titleRow}>
            <Text style={styles.name}>{museum.naam}</Text>
            <View style={[styles.openBadge, openBadgeStyle]}>
              <Text style={[styles.openBadgeText, openBadgeTextStyle]}>
                {openBadgeLabel}
              </Text>
            </View>
          </View>

          {/* Adres */}
          {adres ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={15} color={Colors.primary} />
              <Text style={styles.infoText}>{adres}</Text>
            </View>
          ) : null}

          {/* Afstand */}
          {distance !== null && (
            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={15} color={Colors.accent} />
              <Text style={[styles.infoText, styles.distanceText]}>
                {formatDistance(distance)} verwijderd
              </Text>
            </View>
          )}

          {/* Telefoon */}
          {museum.tel ? (
            <TouchableOpacity style={styles.infoRow} onPress={handleBelefoon}>
              <Ionicons name="call-outline" size={15} color={Colors.primary} />
              <Text style={[styles.infoText, styles.linkText]}>{museum.tel}</Text>
            </TouchableOpacity>
          ) : null}

          {/* E-mail */}
          {museum.mail ? (
            <TouchableOpacity style={styles.infoRow} onPress={handleMail}>
              <Ionicons name="mail-outline" size={15} color={Colors.primary} />
              <Text style={[styles.infoText, styles.linkText]}>{museum.mail}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Over het museum ── */}
        {museum.omschrijving ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Over het museum</Text>
            <Text style={styles.description}>{museum.omschrijving}</Text>
          </View>
        ) : null}

        {/* ── Openingsuren ── */}
        {openingsuurenTekst ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Openingsuren</Text>
            <View style={styles.openingsCard}>
              <Text style={styles.openingsTekst}>{openingsuurenTekst}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Links ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Links</Text>
          <View style={styles.linksCard}>
            {/* MuseumPASS pagina — altijd aanwezig */}
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => handleOpenUrl(museum.museumpass_url)}
            >
              <Ionicons name="card-outline" size={18} color={Colors.primary} />
              <Text style={styles.linkRowText}>MuseumPASS pagina</Text>
              <Ionicons name="open-outline" size={14} color={Colors.textSecondary} />
            </TouchableOpacity>

            {/* Museumwebsite — optioneel */}
            {museum.url_museum ? (
              <TouchableOpacity
                style={[styles.linkRow, styles.linkRowBorder]}
                onPress={() => handleOpenUrl(museum.url_museum)}
              >
                <Ionicons name="globe-outline" size={18} color={Colors.primary} />
                <Text style={styles.linkRowText}>Website museum</Text>
                <Ionicons name="open-outline" size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Ruimte voor de vaste CTA-balk */}
        <View style={{ height: 160 }} />
      </ScrollView>

      {/* ── CTA knoppen (vast onderaan) ── */}
      <View style={styles.ctaContainer}>
        {/* Routebeschrijving */}
        <TouchableOpacity
          style={[styles.ctaBtn, styles.ctaBtnSecondary]}
          onPress={handleOpenKaart}
        >
          <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
          <Text style={styles.ctaBtnSecondaryText}>Routebeschrijving</Text>
        </TouchableOpacity>

        {/* Toevoegen aan / Verwijderen uit Route */}
        <TouchableOpacity
          style={[
            styles.ctaBtn,
            selected ? styles.ctaBtnRemove : styles.ctaBtnRoute,
          ]}
          onPress={() => toggleRoute(museum)}
        >
          <Ionicons
            name={selected ? 'remove-circle-outline' : 'add-circle-outline'}
            size={18}
            color={Colors.white}
          />
          <Text style={styles.ctaBtnText}>
            {selected ? 'Verwijder uit route' : 'Voeg toe aan route'}
          </Text>
        </TouchableOpacity>

        {/* Markeer als bezocht / Ongedaan maken */}
        <TouchableOpacity
          style={[
            styles.ctaBtn,
            museum.al_bezocht ? styles.ctaBtnUnvisit : styles.ctaBtnVisit,
          ]}
          onPress={handleToggleBezocht}
          disabled={toggleLoading}
        >
          {toggleLoading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons
              name={museum.al_bezocht ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={18}
              color={Colors.white}
            />
          )}
          <Text style={styles.ctaBtnText}>
            {museum.al_bezocht ? 'Markering ongedaan maken' : 'Markeer als bezocht'}
          </Text>
        </TouchableOpacity>
      </View>
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
    padding: 24,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  backBtnText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  // ── Hero ──
  hero: {
    height: 180,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  heroPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
  visitedBanner: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  visitedBannerText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  // ── Titel ──
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  openBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 4,
  },
  openBadgeOpen: { backgroundColor: Colors.openBadge },
  openBadgeClosed: { backgroundColor: Colors.closedBadge },
  openBadgeOnbekend: { backgroundColor: '#FEF9C3' },
  openBadgeText: { fontSize: 12, fontWeight: '700' },
  openBadgeTextOpen: { color: Colors.openBadgeText },
  openBadgeTextClosed: { color: Colors.closedBadgeText },
  openBadgeTextOnbekend: { color: '#92400E' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  linkText: {
    color: Colors.primaryLight,
    textDecorationLine: 'underline',
  },
  distanceText: {
    color: Colors.accent,
    fontWeight: '600',
  },
  // ── Secties ──
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 23,
  },
  // ── Openingsuren ──
  openingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  openingsTekst: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  // ── Links ──
  linksCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  linkRowText: {
    flex: 1,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  // ── CTA-balk ──
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 16,
    gap: 10,
  },
  ctaBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  ctaBtnSecondary: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ctaBtnRoute: { backgroundColor: Colors.primary },
  ctaBtnRemove: { backgroundColor: Colors.error },
  ctaBtnVisit: { backgroundColor: Colors.success },
  ctaBtnUnvisit: { backgroundColor: Colors.textSecondary },
  ctaBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  ctaBtnSecondaryText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Fout / niet-gevonden ──
  notFoundText: {
    fontSize: 16,
    color: Colors.error,
    marginTop: 12,
  },
  backLink: {
    color: Colors.primary,
    fontSize: 15,
    marginTop: 16,
    fontWeight: '600',
  },
});
