import { useEffect, useRef, useState } from "react";
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    useMapEvents,
    useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// General Hyderabad city center — used only as a starting viewport before
// we know anything about the customer's actual location. Never saved as
// their address; it's just where the map opens.
const DEFAULT_CENTER = [17.385044, 78.486671];

// Registers a click handler on the map and reports the tapped [lat, lng]
// back to the parent — the manual fallback for whenever auto-geocoding the
// typed address doesn't land in the right spot.
const ClickToPick = ({ onPick }) => {
    useMapEvents({
        click(e) {
            onPick([e.latlng.lat, e.latlng.lng]);
        },
    });
    return null;
};

// Smoothly flies the map to `value` (the current pin — from an auto-geocode
// result or a manual tap) whenever it changes, so the customer sees the map
// actually move to match their typed address without doing anything
// themselves. Falls back to centering on the browser's geolocation once, if
// available, before any address has been typed — just a friendly starting
// point, not something that's ever saved. Skips redundant flyTo calls for
// a position it's already centered on.
const RecenterOnChange = ({ value, browserLocation }) => {
    const map = useMap();
    const lastAppliedKeyRef = useRef(null);

    useEffect(() => {
        const target = value || browserLocation;
        if (!target) return;

        const key = `${target[0]},${target[1]}`;
        if (lastAppliedKeyRef.current === key) return;
        lastAppliedKeyRef.current = key;

        map.flyTo(target, 16, { duration: 0.8 });
    }, [value, browserLocation, map]);

    return null;
};

// Shows the customer's real delivery location on a map, automatically
// updated from their typed address (via CheckoutPage.jsx's debounced
// geocoding), with tap-to-adjust as a manual fallback for whenever
// geocoding doesn't land in the right spot. `value` is [lat, lng] or null;
// `onChange` receives a newly tapped [lat, lng]; `geocoding` and
// `locationSource` ("auto" | "manual" | null) drive the status line below
// the map.
//
// Uses CircleMarker (not Leaflet's default pin) for the same reason
// LiveTrackingMap.jsx does — the default marker's icon images resolve via
// relative paths that break under Vite's bundler unless manually
// reconfigured, and a colored dot communicates the same thing here too.
const AddressLocationPicker = ({
    value,
    onChange,
    geocoding,
    locationSource,
    locationPrecision,
}) => {
    const [browserLocation, setBrowserLocation] = useState(null);

    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setBrowserLocation([
                    position.coords.latitude,
                    position.coords.longitude,
                ]);
            },
            () => {
                // Denied or unavailable — the map just opens at
                // DEFAULT_CENTER; auto-geocoding or a manual tap still work
                // fine without it. Not an error state; nothing to surface.
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }, []);

    const markerPosition = value || browserLocation || DEFAULT_CENTER;

    const coordsLabel = value
        ? `(${value[0].toFixed(5)}, ${value[1].toFixed(5)})`
        : "";

    const statusMessage = geocoding
        ? "Locating your address..."
        : value && locationSource === "auto" && locationPrecision === "exact"
        ? `Detected your address ${coordsLabel} — tap the map if this looks off.`
        : value && locationSource === "auto" && locationPrecision === "area"
        ? `Found the general area near your address ${coordsLabel} — this may not be your exact spot. Tap the map to fine-tune it.`
        : value && locationSource === "auto" && locationPrecision === "city"
        ? `Only found ${coordsLabel} at a city level — this is likely NOT your exact location. Please tap the map to set it precisely.`
        : value && locationSource === "manual"
        ? `Location set ${coordsLabel} — tap the map to adjust.`
        : "Start typing your address above and we'll locate it automatically — or tap the map directly.";

    const isImprecise =
        locationSource === "auto" &&
        (locationPrecision === "area" || locationPrecision === "city");

    return (
        <div>
            <div className="h-56 w-full rounded-md overflow-hidden border border-border">
                <MapContainer
                    center={markerPosition}
                    zoom={value || browserLocation ? 16 : 12}
                    className="h-full w-full"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <CircleMarker
                        center={markerPosition}
                        radius={10}
                        pathOptions={{
                            color: "#c1440e",
                            fillColor: "#c1440e",
                            fillOpacity: 0.9,
                        }}
                    />
                    <ClickToPick onPick={onChange} />
                    <RecenterOnChange
                        value={value}
                        browserLocation={browserLocation}
                    />
                </MapContainer>
            </div>
            <p
                className={`text-xs mt-1.5 flex items-center gap-1.5 ${
                    isImprecise ? "text-warning font-medium" : "text-muted"
                }`}
            >
                {geocoding && (
                    <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                {statusMessage}
            </p>
        </div>
    );
};

export default AddressLocationPicker;