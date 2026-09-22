import { useEffect, useRef, useState } from "react";
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Polyline,
    Popup,
    useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Deliberately uses CircleMarker (colored dots) instead of Leaflet's default
// pin icon. Leaflet's default marker images resolve via relative paths that
// break under Vite's bundler unless manually reconfigured — CircleMarker
// needs no icon assets at all, sidestepping that entirely for a college
// demo where a colored dot communicates the same thing.

// Imperatively re-fits the map's viewport, but ONLY when the number of
// markers actually changes (e.g. the delivery partner's marker appearing
// for the first time, or the road route loading in) — not on every single
// partner position tick. `points` is a brand-new array on every render
// (recomputed from live coordinates), so keying off array identity would
// re-fit/re-center the whole map on every location update, which reads as
// the map "jumping" regardless of how smoothly the marker itself moves.
const FitBounds = ({ points }) => {
    const map = useMap();
    const previousCountRef = useRef(-1);

    useEffect(() => {
        if (points.length === previousCountRef.current) return;
        previousCountRef.current = points.length;

        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 15);
        } else {
            map.fitBounds(points, { padding: [40, 40] });
        }
    }, [points, map]);

    return null;
};

// Smoothly glides a marker from wherever it's currently displayed to a new
// target position over `durationMs`, instead of snapping instantly on every
// delivery:location socket event. Used only for the delivery partner
// marker — the restaurant and destination markers never move, so they're
// rendered directly from their props with no animation needed.
//
// Uses a ref (not state) to track the in-flight position so that if a new
// target arrives mid-animation, the next glide smoothly continues from
// wherever the dot currently visually is, rather than snapping back to the
// last committed position first. State is only used to trigger re-renders.
function useAnimatedPosition(target, durationMs) {
    const [renderPos, setRenderPos] = useState(target || null);
    const currentRef = useRef(target || null);
    const rafRef = useRef(null);

    const targetLat = target ? target[0] : null;
    const targetLng = target ? target[1] : null;

    useEffect(() => {
        if (targetLat == null || targetLng == null) return undefined;
        const targetPoint = [targetLat, targetLng];

        // First position ever received — nothing to glide from yet, so
        // just place the marker directly.
        if (!currentRef.current) {
            currentRef.current = targetPoint;
            setRenderPos(targetPoint);
            return undefined;
        }

        const from = currentRef.current;
        if (from[0] === targetPoint[0] && from[1] === targetPoint[1]) {
            return undefined; // no actual movement — nothing to animate
        }

        let start = null;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const step = (timestamp) => {
            if (start === null) start = timestamp;
            const elapsed = timestamp - start;
            const t = Math.min(elapsed / durationMs, 1);
            const eased = easeOutCubic(t);

            const next = [
                from[0] + (targetPoint[0] - from[0]) * eased,
                from[1] + (targetPoint[1] - from[1]) * eased,
            ];
            currentRef.current = next;
            setRenderPos(next);

            if (t < 1) {
                rafRef.current = requestAnimationFrame(step);
            }
        };

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(step);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        // Only the actual coordinate values should restart the animation —
        // not a new-but-equal array reference from a parent re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetLat, targetLng, durationMs]);

    return renderPos;
}

// How long the partner marker takes to glide between two reported
// positions. Deliberately well under the ~5-10s gap between real updates
// (so it settles before the next one arrives, rather than constantly
// racing to catch up), and deliberately not fast/instant either — this is
// the "smooth, not-too-fast" pace of the glide itself.
const PARTNER_GLIDE_DURATION_MS = 2200;

// restaurant / customer / partner are each optional {latitude, longitude}
// objects — any of them may be missing or incomplete, handled gracefully
// rather than crashing. roadRoute is an optional array of [lat, lng] pairs
// from OSRM (via routingApi.js) — when present, it's drawn as a solid line
// instead of the straight-line fallback. When absent (never fetched, or the
// routing request failed), the straight partner→destination line is used
// instead, so the map never breaks just because routing is unavailable.
const LiveTrackingMap = ({ restaurant, customer, partner, roadRoute }) => {
    const staticMarkerDefs = [
        { data: restaurant, label: "Restaurant", color: "#c1440e" },
        { data: customer, label: "Delivery Address", color: "#241c15" },
    ];

    const staticMarkers = staticMarkerDefs
        .filter(
            (m) =>
                m.data &&
                m.data.latitude != null &&
                m.data.longitude != null &&
                !Number.isNaN(Number(m.data.latitude)) &&
                !Number.isNaN(Number(m.data.longitude))
        )
        .map((m) => ({
            label: m.label,
            color: m.color,
            position: [Number(m.data.latitude), Number(m.data.longitude)],
        }));

    const partnerTarget =
        partner &&
        partner.latitude != null &&
        partner.longitude != null &&
        !Number.isNaN(Number(partner.latitude)) &&
        !Number.isNaN(Number(partner.longitude))
            ? [Number(partner.latitude), Number(partner.longitude)]
            : null;

    // Hooks must run unconditionally on every render, so this is called
    // before any early return below, even though its result is only used
    // when a partner position actually exists.
    const animatedPartnerPosition = useAnimatedPosition(
        partnerTarget,
        PARTNER_GLIDE_DURATION_MS
    );

    const partnerMarker = animatedPartnerPosition
        ? {
              label: "Delivery Partner",
              color: "#2f9e44",
              position: animatedPartnerPosition,
          }
        : null;

    const markers = partnerMarker
        ? [...staticMarkers, partnerMarker]
        : staticMarkers;

    if (markers.length === 0) {
        return (
            <p className="text-sm text-muted">
                Location data isn't available yet.
            </p>
        );
    }

    const points = markers.map((m) => m.position);
    const hasRoadRoute = Array.isArray(roadRoute) && roadRoute.length > 1;

    // Straight connecting line between the delivery partner and the
    // customer's destination only (not the restaurant). Uses the animated
    // (not raw target) partner position so the line's endpoint moves in
    // sync with the dot instead of snapping ahead of it. Used only as a
    // fallback when no road route is available.
    const destinationPoint = staticMarkers.find(
        (m) => m.label === "Delivery Address"
    )?.position;
    const straightLinePoints =
        !hasRoadRoute && animatedPartnerPosition && destinationPoint
            ? [animatedPartnerPosition, destinationPoint]
            : null;

    // Fit the viewport to the whole road route when one is shown, not just
    // the marker points, so the full path is visible.
    const boundsPoints = hasRoadRoute ? [...points, ...roadRoute] : points;

    return (
        <div className="h-80 md:h-[420px] lg:h-[480px] w-full rounded-lg overflow-hidden border border-border">
            <MapContainer
                center={points[0]}
                zoom={14}
                className="h-full w-full"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {markers.map((marker) => (
                    <CircleMarker
                        key={marker.label}
                        center={marker.position}
                        radius={9}
                        pathOptions={{
                            color: marker.color,
                            fillColor: marker.color,
                            fillOpacity: 0.9,
                        }}
                    >
                        <Popup>{marker.label}</Popup>
                    </CircleMarker>
                ))}
                {hasRoadRoute && (
                    <Polyline
                        positions={roadRoute}
                        pathOptions={{
                            color: "#2f9e44",
                            weight: 4,
                            opacity: 0.85,
                        }}
                    />
                )}
                {straightLinePoints && (
                    <Polyline
                        positions={straightLinePoints}
                        pathOptions={{
                            color: "#2f9e44",
                            weight: 3,
                            dashArray: "6 8",
                        }}
                    />
                )}
                <FitBounds points={boundsPoints} />
            </MapContainer>
        </div>
    );
};

export default LiveTrackingMap;