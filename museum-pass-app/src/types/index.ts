// ---------------------------------------------------------------------------
// Museum model — velden rechtstreeks van Firestore (collectie: musea)
// ---------------------------------------------------------------------------

export interface Museum {
  id: string;              // Firestore document ID (UUID)
  naam: string;            // museumnaam
  omschrijving: string;    // beschrijving
  openingsuren: string;    // vrije tekst, bijv. "Di - vr: 9.30 – 17.00\nZa - zo: 10.00 – 17.00"
  straat: string;          // straatnaam (leeg voor ~16/268)
  huisnummer: string;      // huisnummer (leeg voor ~16/268)
  postcode: string;        // 4-cijferig Belgisch postcode (leeg voor ~16/268)
  gemeente: string;        // gemeente/stad (leeg voor ~16/268)
  tel: string;             // telefoonnummer (leeg voor ~1/268)
  mail: string;            // e-mailadres
  url_museum: string;      // museumwebsite (leeg voor ~86/268)
  museumpass_url: string;  // MuseumPASS-pagina (altijd ingevuld)
  al_bezocht: boolean;     // bezocht? — opgeslagen in Firestore, NOOIT resetten

  // Toegevoegd door de app na geocoding:
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
}

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

export interface RouteStop {
  museum: Museum;
  order: number;
}

// ---------------------------------------------------------------------------
// Locatie
// ---------------------------------------------------------------------------

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Navigatie param lists
// ---------------------------------------------------------------------------

export type RootStackParamList = {
  Tabs: undefined;
  MuseumDetail: { museumId: string };
};

export type TabParamList = {
  InDeBuurt: undefined;
  Verkennen: undefined;
  Route: undefined;
  Bezocht: undefined;
};
