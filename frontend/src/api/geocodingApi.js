// Forward geocoding via Nominatim, OpenStreetMap's free, keyless geocoding
// service — same public-OSM-ecosystem pattern already used elsewhere in
// this project for routing (routingApi.js) and map tiles. No API key, no
// paid service, no backend involvement.
//
// Nominatim's usage policy asks for roughly one request per second per
// client. Callers here are expected to debounce — CheckoutPage.jsx waits
// until the person pauses typing before calling this, rather than firing a
// request on every keystroke.
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

// IMPORTANT: uses Nominatim's freeform `q=` full-text search, NOT its
// "structured" query mode (street=/city=/state=/postalcode= as separate
// params). A previous version of this file switched to structured mode to
// try to help informal home addresses, but structured mode requires a
// strict field-level match against tagged OSM data — a mall or hotel name
// typed into a "street" field usually doesn't match anything at all, since
// it isn't tagged as a street name. That broke matching broadly, including
// the previously-working named-place case. Freeform `q=` treats the whole
// string as one full-text search against everything (streets, POI names,
// localities, etc.) and is what actually works well for named places.
async function searchNominatim(queryText) {
    if (!queryText || !queryText.trim()) return null;

    const params = new URLSearchParams({
        format: "json",
        limit: "1",
        q: queryText,
    });

    try {
        const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;

        const results = await response.json();
        if (!Array.isArray(results) || results.length === 0) return null;

        const latitude = Number(results[0].lat);
        const longitude = Number(results[0].lon);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

        return { latitude, longitude };
    } catch {
        return null;
    }
}

// Converts a typed address into { latitude, longitude, precision }, or
// null if nothing at all could be resolved. Tries progressively shorter
// freeform text queries rather than one all-or-nothing attempt:
//
//   1. "exact" — full address text including the street/house line. This
//      is the query style that already worked well for named places
//      (malls, hotels, well-known landmarks) tagged as POIs in OSM.
//   2. "area"  — drops the street/house line, keeps city + pincode. Many
//      informal Indian home addresses (e.g. "H.No. 12-3, near XYZ temple")
//      simply don't exist as structured street data in OSM even though
//      the surrounding area does — this still gets a genuinely useful
//      starting point instead of a hard failure.
//   3. "city"  — city + state only. Broadest fallback; resolves for any
//      real city name even when the postal code itself doesn't match.
//
// `precision` tells the caller how much to trust the result — CheckoutPage
// uses it to tell the customer "this is exact" vs "this is roughly the
// area, please fine-tune on the map" instead of presenting a rough guess
// as if it were a precise match.
export const geocodeAddress = async ({ address_line, city, state, pincode }) => {
    const hasAnyInput = [address_line, city, state, pincode].some(
        (part) => part && part.trim().length > 0
    );
    if (!hasAnyInput) return null;

    const exactQuery = [address_line, city, state, pincode, "India"]
        .filter((part) => part && part.trim())
        .join(", ");
    const exact = await searchNominatim(exactQuery);
    if (exact) return { ...exact, precision: "exact" };

    if (city || pincode) {
        const areaQuery = [city, pincode, state, "India"]
            .filter((part) => part && part.trim())
            .join(", ");
        const area = await searchNominatim(areaQuery);
        if (area) return { ...area, precision: "area" };
    }

    if (city) {
        const cityQuery = [city, state, "India"]
            .filter((part) => part && part.trim())
            .join(", ");
        const cityLevel = await searchNominatim(cityQuery);
        if (cityLevel) return { ...cityLevel, precision: "city" };
    }

    return null;
};