// Small, dependency-free geo helpers used only for the customer-facing
// "estimated delivery time" display. Nothing here touches order data,
// tracking state, or any network call — pure functions over coordinates.

// Great-circle distance between two [lat, lng] points, in meters. Standard
// haversine formula — accurate enough for "which point on this route is
// closest to the partner" without needing a mapping library.
export function haversineDistanceMeters(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Estimates remaining seconds of an in-progress delivery, given:
//   - routePoints: the full OSRM route as [lat,lng][], restaurant -> customer
//   - totalDurationSeconds: OSRM's own estimated duration for that full route
//   - currentPosition: the delivery partner's current [lat,lng]
//
// Approach: find the nearest point on the route to the partner's current
// position, treat that point's index as "how far along the route" they
// are (index / (length-1) as a 0..1 fraction), and scale the total
// duration down by the remaining fraction. This needs no extra network
// calls beyond the one route fetch already made when tracking started —
// it just re-evaluates cheaply on every position update.
//
// Returns null if there isn't enough data to estimate anything (fewer than
// two route points, or a missing position) — callers should just hide the
// ETA in that case rather than showing a nonsensical number.
export function estimateRemainingSeconds(
    routePoints,
    totalDurationSeconds,
    currentPosition
) {
    if (
        !Array.isArray(routePoints) ||
        routePoints.length < 2 ||
        !currentPosition ||
        typeof totalDurationSeconds !== "number" ||
        Number.isNaN(totalDurationSeconds)
    ) {
        return null;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < routePoints.length; i += 1) {
        const distance = haversineDistanceMeters(
            routePoints[i],
            currentPosition
        );
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
        }
    }

    const fractionTraveled = nearestIndex / (routePoints.length - 1);
    const remaining = totalDurationSeconds * (1 - fractionTraveled);
    return Math.max(0, Math.round(remaining));
}

// Formats a seconds count as a short, friendly ETA string — "3 mins",
// "1 min", or "Arriving now" for anything under a minute.
export function formatEtaMinutes(seconds) {
    if (seconds == null) return null;
    const minutes = Math.round(seconds / 60);
    if (minutes <= 0) return "Arriving now";
    if (minutes === 1) return "1 min";
    return `${minutes} mins`;
}