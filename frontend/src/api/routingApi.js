// Calls the free public OSRM (Open Source Routing Machine) demo server
// directly from the browser — no backend involvement, no API key, no paid
// service, no Google Maps. This is the "free OpenStreetMap-based routing
// solution suitable for a college demo" the task asked for.

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

// start/end: {latitude, longitude}. Returns an array of [latitude,
// longitude] pairs describing the road route, ready to hand straight to
// Leaflet's <Polyline positions={...}>.
//
// Throws on any failure (network error, OSRM down, no route found, etc.) —
// callers are expected to catch this and fall back to the existing
// straight-line behavior rather than letting a routing failure break the
// map or the live tracking marker.
export const getRoadRoute = async (start, end) => {
    const url = `${OSRM_BASE_URL}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Routing service unavailable.");
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
        throw new Error("No road route found between these points.");
    }

    // GeoJSON coordinates are [longitude, latitude] — Leaflet wants
    // [latitude, longitude], so they're swapped here once, in one place.
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => [
        lat,
        lng,
    ]);
};

// Same request as getRoadRoute, but also returns OSRM's own estimated
// total travel duration for the route (in seconds) — used to compute the
// customer-facing "estimated delivery time" without a second network call.
// A separate function rather than changing getRoadRoute's return shape, so
// existing callers (e.g. the delivery partner's simulated-movement effect)
// are completely unaffected.
export const getRoadRouteWithDuration = async (start, end) => {
    const url = `${OSRM_BASE_URL}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Routing service unavailable.");
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
        throw new Error("No road route found between these points.");
    }

    const route = data.routes[0];
    return {
        points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        durationSeconds: route.duration,
    };
};

// Picks `count` evenly-spaced points from a full route (which can have
// hundreds of points along real roads) — used by the demo simulation so it
// takes a fixed, predictable number of steps/interval ticks regardless of
// how detailed the actual road geometry happens to be.
export const resampleRoute = (routePoints, count) => {
    if (routePoints.length <= count) return routePoints;

    const result = [];
    for (let i = 0; i < count; i += 1) {
        const index = Math.round(
            (i / (count - 1)) * (routePoints.length - 1)
        );
        result.push(routePoints[index]);
    }
    return result;
};