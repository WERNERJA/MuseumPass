/**
 * Haalt een echt wegtraject op via de OSRM demo-server (gratis, geen API key).
 * Valt terug op rechte lijnen als de aanvraag mislukt.
 *
 * OSRM endpoint: https://router.project-osrm.org/route/v1/driving/
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Haalt een polyline op die de wegen volgt tussen de opgegeven waypoints.
 * Geeft een array van coördinaten terug die je op de kaart kunt tekenen.
 */
export async function fetchRoadRoute(waypoints: LatLng[]): Promise<LatLng[]> {
  if (waypoints.length < 2) return waypoints;

  // OSRM verwacht: lon,lat;lon,lat;...
  const coords = waypoints
    .map((p) => `${p.longitude},${p.latitude}`)
    .join(';');

  const url =
    `https://router.project-osrm.org/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('Geen route gevonden');
    }

    // GeoJSON coördinaten zijn [lon, lat] — omzetten naar {latitude, longitude}
    const geoCoords: [number, number][] =
      data.routes[0].geometry.coordinates;

    return geoCoords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  } catch (err) {
    console.warn('[roadRouting] OSRM mislukt, gebruik rechte lijnen:', err);
    // Terugval: rechte lijn tussen waypoints
    return waypoints;
  }
}
