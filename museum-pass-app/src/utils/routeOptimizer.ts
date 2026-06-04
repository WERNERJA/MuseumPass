import { Museum, UserLocation } from '../types';
import { haversineDistanceKm } from './distance';

interface Point {
  latitude: number;
  longitude: number;
}

function distanceBetween(a: Point, b: Point): number {
  return haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

/**
 * Nearest-neighbour TSP heuristiek.
 *
 * Begint bij `origin` (huidige positie van de gebruiker) en kiest steeds het
 * dichtstbijzijnde onaangedane museum totdat alle musea zijn opgenomen.
 *
 * Musea zonder coördinaten worden uitgefilterd — ze kunnen nog steeds in
 * lijstweergaven verschijnen maar niet op de kaart of in de route.
 *
 * @param origin    GPS-positie van de gebruiker (startpunt van de route).
 * @param museums   Kandidaat-musea (al gefilterd: open, niet bezocht).
 * @returns         Geordende array van musea die de geoptimaliseerde route vormen.
 */
export function optimiseRoute(origin: UserLocation, museums: Museum[]): Museum[] {
  // Alleen musea met coördinaten kunnen op de route
  const withCoords = museums.filter(
    (m) => m.latitude !== undefined && m.longitude !== undefined,
  );

  if (withCoords.length === 0) return [];
  if (withCoords.length === 1) return [withCoords[0]];

  const remaining = [...withCoords];
  const ordered: Museum[] = [];
  let current: Point = {
    latitude: origin.latitude,
    longitude: origin.longitude,
  };

  while (remaining.length > 0) {
    let closestIndex = 0;
    let closestDist = distanceBetween(current, remaining[0] as Point);

    for (let i = 1; i < remaining.length; i++) {
      const d = distanceBetween(current, remaining[i] as Point);
      if (d < closestDist) {
        closestDist = d;
        closestIndex = i;
      }
    }

    const next = remaining.splice(closestIndex, 1)[0];
    ordered.push(next);
    current = { latitude: next.latitude!, longitude: next.longitude! };
  }

  return ordered;
}

/**
 * Bouw een Apple Maps URL voor navigatie door een geordende lijst van stops.
 *
 * @param museums  Geordende lijst van musea (uitvoer van optimiseRoute).
 * @returns        Een `maps://` deep-link URL.
 */
export function buildAppleMapsUrl(museums: Museum[]): string {
  const withCoords = museums.filter(
    (m) => m.latitude !== undefined && m.longitude !== undefined,
  );

  if (withCoords.length === 0) return 'maps://';

  if (withCoords.length === 1) {
    const m = withCoords[0];
    const label = encodeURIComponent(m.naam);
    return `maps://?daddr=${m.latitude},${m.longitude}&q=${label}&dirflg=d`;
  }

  const first = withCoords[0];
  const last = withCoords[withCoords.length - 1];
  const intermediates = withCoords.slice(1, -1);

  let daddr = intermediates
    .map((m) => `${m.latitude},${m.longitude}`)
    .join('+to:');

  if (daddr) {
    daddr = `${daddr}+to:${last.latitude},${last.longitude}`;
  } else {
    daddr = `${last.latitude},${last.longitude}`;
  }

  return (
    `maps://?saddr=${first.latitude},${first.longitude}` +
    `&daddr=${daddr}` +
    `&dirflg=d`
  );
}

/**
 * Bereken de totale routeafstand: origin → museum 1 → … → museum N.
 *
 * @returns Totale afstand in kilometers.
 */
export function totalRouteDistanceKm(
  origin: UserLocation,
  museums: Museum[],
): number {
  const withCoords = museums.filter(
    (m) => m.latitude !== undefined && m.longitude !== undefined,
  );

  if (withCoords.length === 0) return 0;

  let total = 0;
  let prev: Point = {
    latitude: origin.latitude,
    longitude: origin.longitude,
  };

  for (const museum of withCoords) {
    total += distanceBetween(prev, museum as Point);
    prev = { latitude: museum.latitude!, longitude: museum.longitude! };
  }

  return total;
}
