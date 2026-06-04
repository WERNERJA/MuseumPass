# Museum Pass App

A React Native (Expo SDK 51) iPhone app for museum pass holders in Belgium. Discover nearby museums with GPS, plan optimised multi-stop routes, browse by city and date, and track which museums you have visited.

---

## Features

| Tab | Description |
|-----|-------------|
| **Nearby** | GPS-based discovery within a configurable radius (10 / 25 / 50 / 100 km). Toggle between list and Apple Maps view. Filter by date. |
| **Explore** | Browse museums by city. Pick any date in the next 14 days to see which museums are open. |
| **Route** | Select museums, get a nearest-neighbour TSP-optimised route on an Apple Maps view, open in Apple Maps for turn-by-turn navigation. |
| **Visited** | Museums you have marked as visited, stored locally with AsyncStorage. |
| **Museum detail** | Full opening hours, description, distance, tags, Directions, "Add to Route", and "Mark as Visited" buttons. |

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React Native 0.74 + Expo SDK 51 |
| Language | TypeScript (strict) |
| Navigation | React Navigation 6 (bottom tabs + native stack) |
| Maps | react-native-maps (Apple MapKit on iOS) |
| Location | expo-location |
| Backend | Firebase Firestore (client SDK v10) |
| Local storage | @react-native-async-storage/async-storage |
| Icons | @expo/vector-icons (Ionicons) |
| Date utilities | date-fns v3 |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | any recent |
| Expo CLI | `npm install -g expo-cli` |
| Expo Go (iOS) | latest |
| Firebase project | free Spark plan is sufficient |

---

## 1. Firebase setup

### 1.1 Firebase project

Het Firebase project `museumpass-b3f1b` bestaat al met 268 musea in de `musea` collectie.
De configuratie is al ingevuld in `app.json`.

### 1.2 Firestore security rules

Ga naar [Firebase Console → museumpass-b3f1b → Firestore → Rules](https://console.firebase.google.com/project/museumpass-b3f1b/firestore/rules) en stel dit in:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /musea/{document} {
      allow read: if true;
      allow write: if true;   // persoonlijk gebruik — enkel al_bezocht wordt gewijzigd
    }
  }
}
```

### 1.3 Get your web app config

1. In the Firebase console, go to **Project settings > General**.
2. Under "Your apps", click **Add app > Web**.
3. Copy the `firebaseConfig` object values.

### 1.4 Add config to `app.json`

Open `app.json` and replace the placeholder values in the `extra` section:

```json
"extra": {
  "firebaseApiKey": "AIza...",
  "firebaseAuthDomain": "your-project.firebaseapp.com",
  "firebaseProjectId": "your-project",
  "firebaseStorageBucket": "your-project.appspot.com",
  "firebaseMessagingSenderId": "123456789",
  "firebaseAppId": "1:123456789:web:abc123"
}
```

---

## 2. Install dependencies

```bash
cd museum-pass-app
npm install
```

---

## 3. Seed sample data

The app ships with 10 real Belgian museums across Bruges, Ghent, Antwerp, Brussels, Tervuren, and Ostend.

### Option A — from within the Expo app (easiest)

Add a temporary button anywhere and call:

```ts
import { seedSampleData } from '../services/firestore';
// ...
<Button title="Seed DB" onPress={seedSampleData} />
```

Remove the button after seeding. Remember to temporarily allow writes in your Firestore security rules.

### Option B — ts-node script

```bash
npm install -D ts-node
npx ts-node src/services/seed.ts
```

---

## 4. Run the app

```bash
npx expo start
```

- Press **i** to open in the iOS Simulator.
- Scan the QR code with **Expo Go** on your iPhone for a real-device experience (location features work best on a real device).

---

## Project structure

```
museum-pass-app/
├── app/
│   ├── _layout.tsx            # Expo Router root shell
│   └── index.tsx              # App entry: React Navigation stack + tabs
├── src/
│   ├── screens/
│   │   ├── NearbyScreen.tsx       # GPS nearby list + map
│   │   ├── ExploreScreen.tsx      # City + date search
│   │   ├── RouteScreen.tsx        # Optimised route planner
│   │   ├── VisitedScreen.tsx      # Visited museums list
│   │   └── MuseumDetailScreen.tsx # Full detail + CTAs
│   ├── components/
│   │   ├── MuseumCard.tsx         # Reusable card with badges
│   │   ├── MuseumMap.tsx          # Apple Maps marker view
│   │   ├── RouteMap.tsx           # Map with polyline + numbered markers
│   │   └── DatePicker.tsx         # 14-day horizontal chip picker
│   ├── hooks/
│   │   ├── useLocation.ts         # expo-location GPS hook
│   │   ├── useMuseums.ts          # Nearby, city, and all-museums hooks
│   │   ├── useVisited.ts          # AsyncStorage-backed visited set
│   │   └── useRoute.ts            # AsyncStorage-backed route selection
│   ├── services/
│   │   ├── firebase.ts            # Firebase app init (singleton)
│   │   ├── firestore.ts           # getAllMuseums, getMuseumsByCity, seedSampleData
│   │   └── seed.ts                # ts-node seed runner
│   ├── utils/
│   │   ├── distance.ts            # Haversine formula + formatDistance
│   │   ├── openingHours.ts        # isOpenNow, isOpenOnDate, getWeekSchedule
│   │   └── routeOptimizer.ts      # Nearest-neighbour TSP + Apple Maps URL
│   ├── types/
│   │   └── index.ts               # Museum, DayHours, OpeningHours, nav types
│   └── constants/
│       └── colors.ts              # Design system colours
├── app.json                   # Expo config + Firebase keys (extra section)
├── babel.config.js
├── package.json
└── tsconfig.json
```

---

## Seeded museums

| Museum | City |
|--------|------|
| Groeningemuseum | Bruges |
| STAM – Stadsmuseum Gent | Ghent |
| MAS – Museum aan de Stroom | Antwerp |
| Royal Museums of Fine Arts of Belgium | Brussels |
| Museum aan de Stroom (MAS) | Antwerp |
| Design Museum Ghent | Ghent |
| Belfry of Bruges | Bruges |
| Royal Museum for Central Africa | Tervuren |
| Mu.ZEE | Ostend |
| Museum Mayer van den Bergh | Antwerp |

---

## Firestore data model

```
Collection: museums
Document ID: slugified-museum-name (e.g. "groeningemuseum-bruges")
Fields:
  id: string
  name: string
  city: string
  address: string
  latitude: number
  longitude: number
  description: string
  imageUrl?: string
  openingHours: {
    monday: { open: "HH:MM", close: "HH:MM" } | null
    tuesday: ...
    wednesday: ...
    thursday: ...
    friday: ...
    saturday: ...
    sunday: ...
  }
  tags: string[]
```

`null` for a day means the museum is closed on that day.

---

## Design colours

| Token | Hex |
|-------|-----|
| Primary (navy) | `#1B4F72` |
| Accent (amber) | `#F39C12` |
| Background | `#F5F6FA` |
| Surface | `#FFFFFF` |
| Success | `#27AE60` |
| Error | `#E74C3C` |

---

## Known limitations and next steps

- **Authentication** — Add Firebase Auth for per-user cloud sync of visited museums.
- **Route optimisation** — The nearest-neighbour heuristic is good for ≤15 stops. For larger route sets, a 2-opt improvement pass would help.
- **Offline support** — Enable Firestore offline persistence via `enableIndexedDbPersistence(db)` in `firebase.ts`.
- **Real-time updates** — Replace `getDocs` with `onSnapshot` for live museum data.
- **Image hosting** — Add Firebase Storage for real museum photographs.
- **Android** — Switch `PROVIDER_DEFAULT` to `PROVIDER_GOOGLE` in the map components and add a Google Maps API key.

---

## License

MIT
