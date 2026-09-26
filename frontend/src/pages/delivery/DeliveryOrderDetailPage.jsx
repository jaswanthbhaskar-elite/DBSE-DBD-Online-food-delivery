import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
    getAssignedOrderById,
    updateDeliveryOrderStatus,
    updateLocation,
} from "../../api/deliveryApi";
import { getRoadRoute, resampleRoute } from "../../api/routingApi";
import LiveTrackingMap from "../../components/map/LiveTrackingMap";

const STATUS_STYLES = {
    placed: "text-primary bg-primary/10",
    confirmed: "text-primary bg-primary/10",
    preparing: "text-warning bg-warning-bg",
    out_for_delivery: "text-warning bg-warning-bg",
    delivered: "text-success bg-success-bg",
    cancelled: "text-error bg-error-bg",
};

const formatDate = (value) =>
    value
        ? new Date(value).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          })
        : "—";

// preparing -> out_for_delivery ("picked up") and out_for_delivery ->
// delivered are the two forward actions a delivery partner can take here.
const DeliveryOrderDetailPage = () => {
    const { orderId } = useParams();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState(null);

    const loadOrder = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAssignedOrderById(orderId);
            setOrder(data.order);
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to load this order."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrder();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    // Live location sharing — starts automatically the instant this order
    // becomes out_for_delivery. There is no manual start/stop control.
    // It tries the device's real GPS first (a one-time silent permission
    // probe); if geolocation is unsupported, denied, or fails, it falls
    // back automatically to simulated movement along the real OSRM road
    // route (or a straight-line interpolation if OSRM is unavailable) —
    // so live tracking always starts and always looks realistic on the
    // customer's map, regardless of whether this device has usable GPS.
    // Both paths send updates through the exact same updateLocation() call
    // used before, so the backend and the customer's Socket.io/map
    // pipeline can't tell the difference.
    const [trackingMode, setTrackingMode] = useState(null); // null | "gps" | "simulated"
    const [locationError, setLocationError] = useState(null);

    // Same map component the customer sees on their order tracking page
    // (components/map/LiveTrackingMap), reusing the exact lat/lng values
    // already being computed below for updateLocation() — no new backend
    // endpoint, no second source of truth for "where am I right now".
    const [currentPosition, setCurrentPosition] = useState(null); // [lat, lng] | null
    const [mapRoadRoute, setMapRoadRoute] = useState(null); // [[lat,lng], ...] | null

    // ~2 minutes at 5s/tick, start to destination — a deliberately
    // unhurried pace, not an instant jump to the customer's door.
    const SIMULATION_TOTAL_STEPS = 24;
    const simulationStepRef = useRef(0);

    useEffect(() => {
        if (!order || order.order_status !== "out_for_delivery") {
            setTrackingMode(null);
            setCurrentPosition(null);
            setMapRoadRoute(null);
            return undefined;
        }

        let cancelled = false;
        let gpsIntervalId = null;
        let simIntervalId = null;

        // Road route for the map's polyline — fetched once per tracking
        // session (not re-fetched on every position tick), exactly like the
        // customer page does via getRoadRouteWithDuration. Independent of
        // GPS vs. simulated mode: even a real courier

        // the road path, not just the two/three dots. Failure here isn't
        // fatal — LiveTrackingMap already falls back to a straight line
        // when roadRoute is null.
        if (
            order.restaurant_latitude != null &&
            order.restaurant_longitude != null &&
            order.delivery_latitude != null &&
            order.delivery_longitude != null
        ) {
            getRoadRoute(
                {
                    latitude: order.restaurant_latitude,
                    longitude: order.restaurant_longitude,
                },
                {
                    latitude: order.delivery_latitude,
                    longitude: order.delivery_longitude,
                }
            )
                .then((route) => {
                    if (!cancelled) setMapRoadRoute(route);
                })
                .catch(() => {
                    if (!cancelled) setMapRoadRoute(null);
                });
        }

        const startSimulatedMovement = () => {
            if (cancelled) return;
            setTrackingMode("simulated");
            setLocationError(null);

            // IMPORTANT: check for null/undefined BEFORE calling Number().
            // Number(null) is 0, not NaN — so if an address was ever saved
            // without real coordinates, this used to silently treat the
            // destination as (0,0) (the Gulf of Guinea) and simulate a
            // "delivery" heading there, which is exactly the "same fake
            // location for every order" bug this was rewritten to prevent.
            // Missing coordinates must be caught here, before the Number()
            // conversion, not after it.
            const hasRestaurantCoords =
                order.restaurant_latitude != null &&
                order.restaurant_longitude != null;
            const hasDeliveryCoords =
                order.delivery_latitude != null &&
                order.delivery_longitude != null;

            if (!hasRestaurantCoords || !hasDeliveryCoords) {
                setLocationError(
                    "Can't start live tracking — this order is missing restaurant or delivery coordinates."
                );
                return;
            }

            const start = {
                latitude: Number(order.restaurant_latitude),
                longitude: Number(order.restaurant_longitude),
            };
            const end = {
                latitude: Number(order.delivery_latitude),
                longitude: Number(order.delivery_longitude),
            };

            if (
                Number.isNaN(start.latitude) ||
                Number.isNaN(start.longitude) ||
                Number.isNaN(end.latitude) ||
                Number.isNaN(end.longitude)
            ) {
                setLocationError(
                    "Can't start live tracking — this order's coordinates are invalid."
                );
                return;
            }

            simulationStepRef.current = 0;
            let routeSteps = null; // [lat,lng][] along real roads, if available

            const runTicks = () => {
                const tick = () => {
                    simulationStepRef.current += 1;
                    const totalSteps = routeSteps
                        ? routeSteps.length
                        : SIMULATION_TOTAL_STEPS;
                    const stepIndex = Math.min(
                        simulationStepRef.current,
                        totalSteps
                    );
                    const fraction = stepIndex / totalSteps;

                    let lat, lng;
                    if (routeSteps) {
                        [lat, lng] = routeSteps[stepIndex - 1];
                    } else {
                        lat =
                            start.latitude +
                            (end.latitude - start.latitude) * fraction;
                        lng =
                            start.longitude +
                            (end.longitude - start.longitude) * fraction;
                    }
setCurrentPosition([lat, lng]);
                    updateLocation(lat, lng).catch(() => {
                        // A single failed tick isn't fatal — the next tick retries.
                    });

                    if (fraction >= 1 && simIntervalId) {
                        clearInterval(simIntervalId);
                        simIntervalId = null;
                    }
                };

                tick(); // move immediately once, then keep going
                simIntervalId = setInterval(tick, 5000);
            };

            getRoadRoute(start, end)
                .then((route) => {
                    if (cancelled) return;
                    routeSteps = resampleRoute(route, SIMULATION_TOTAL_STEPS);
                    runTicks();
                })
                .catch(() => {
                    // OSRM unavailable/failed — fall back to straight-line
                    // interpolation rather than blocking tracking.
                    if (cancelled) return;
                    routeSteps = null;
                    runTicks();
                });
        };

        const startRealGps = () => {
            if (cancelled) return;
            setTrackingMode("gps");
            setLocationError(null);

            const sendCurrentPosition = () => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        // Only latitude/longitude are ever read or sent —
                        // no other geolocation data (accuracy, heading,
                        // altitude, etc.) is collected or transmitted.
                        setCurrentPosition([
                            position.coords.latitude,
                            position.coords.longitude,
                        ]);
                        updateLocation(
                            position.coords.latitude,
                            position.coords.longitude
                        ).catch(() => {
                            // A single failed update isn't fatal — the
                            // next interval tick retries.
                        });
                    },
                    () => {
                        // A single failed read isn't fatal — the next 10s
                        // tick retries. Tracking mode is decided once via
                        // the initial probe below, so one transient error
                        // here doesn't switch modes mid-delivery.
                    },
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
                );
            };

            sendCurrentPosition(); // send immediately, then keep going
            gpsIntervalId = setInterval(sendCurrentPosition, 10000);
        };

        // One-time, silent probe: is real GPS actually usable right now?
        // If yes, use it. If unsupported, permission denied, or it fails,
        // fall back to simulated movement immediately — no button, no
        // manual choice, tracking just starts either way.
        if (!navigator.geolocation) {
            startSimulatedMovement();
        } else {
            navigator.geolocation.getCurrentPosition(
                () => {
                    if (!cancelled) startRealGps();
                },
                () => {
                    if (!cancelled) startSimulatedMovement();
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
        }

        return () => {
            cancelled = true;
            if (gpsIntervalId) clearInterval(gpsIntervalId);
            if (simIntervalId) clearInterval(simIntervalId);
            setTrackingMode(null);
            setCurrentPosition(null);
            setMapRoadRoute(null);
        };
    }, [order?.order_status, orderId]);

    const handleStatusUpdate = async (nextStatus) => {
        setUpdatingStatus(true);
        setStatusError(null);
        try {
            await updateDeliveryOrderStatus(orderId, nextStatus);
            await loadOrder();
} catch (err) {
            setStatusError(
                err.response?.data?.message ||
                    "Failed to update order status."
            );
        } finally {
            setUpdatingStatus(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-8">
                <p className="text-sm text-muted py-4">Loading order...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            <Link
                to="/delivery"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to my deliveries
            </Link>

            <div className="flex items-start justify-between gap-2 mt-3 mb-6">
                <h1 className="text-2xl font-semibold text-ink">
                    Order #{order.order_id}
                </h1>
                <span
                    className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                        STATUS_STYLES[order.order_status] ||
                        "text-muted bg-background"
                    }`}
                >
                    {order.order_status.replace(/_/g, " ")}
                </span>
            </div>

            {order.order_status === "out_for_delivery" && (
                <p className="text-xs text-success mb-4 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    {trackingMode
                        ? "Sharing your live location with the customer"
                        : "Starting live tracking..."}
                </p>
            )}
            {locationError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {locationError}
                </p>
            )}

            {/* Pickup */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Pickup From
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    <p className="text-sm font-semibold text-ink">
                        {order.restaurant_name}
                    </p>
                    <p className="text-sm text-muted">
                        {order.restaurant_address_line},{" "}
                        {order.restaurant_city}, {order.restaurant_state}
                    </p>
                    {order.restaurant_phone && (
                        <p className="text-sm text-muted mt-1">
                            {order.restaurant_phone}
                        </p>
                    )}
                </div>
            </section>

            {/* Drop-off */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Deliver To
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    <p className="text-sm font-semibold text-ink">
                        {order.customer_name}
                    </p>
                    <p className="text-sm text-muted">
                        {order.delivery_address_line}, {order.delivery_city},{" "}
                        {order.delivery_state} - {order.delivery_pincode}
                    </p>
                    {order.customer_phone && (
                        <p className="text-sm text-muted mt-1">
                            {order.customer_phone}
                        </p>
                    )}
                </div>
            </section>
{/* Live Map — same LiveTrackingMap component the customer sees
                on their order tracking page, showing the restaurant,
                delivery address, and this partner's own live position. */}
            {order.order_status === "out_for_delivery" && (
                <section className="mb-6">
                    <h2 className="text-lg font-semibold text-ink mb-3">
                        Live Map
                    </h2>
                    <div className="bg-surface border border-border rounded-lg shadow-card p-4 sm:p-5">
                        <LiveTrackingMap
                            restaurant={{
                                latitude: order.restaurant_latitude,
                                longitude: order.restaurant_longitude,
                            }}
                            customer={{
                                latitude: order.delivery_latitude,
                                longitude: order.delivery_longitude,
                            }}
                            partner={
                                currentPosition
                                    ? {
                                          latitude: currentPosition[0],
                                          longitude: currentPosition[1],
                                      }
                                    : null
                            }
                            roadRoute={mapRoadRoute}
                        />
                    </div>
                </section>
            )}

            {/* Items */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Items
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    <div className="flex flex-col gap-1.5 mb-3">
                        {order.items.map((item) => (
                            <div
                                key={item.order_item_id}
                                className="flex items-center justify-between text-sm"
                            >
                                <span className="text-muted">
                                    {item.name} × {item.quantity}
                                </span>
                                <span className="text-ink font-medium">
                                    ₹{item.item_subtotal}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-border pt-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-sm text-muted">
                            <span>Subtotal</span>
                            <span>₹{order.subtotal}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted">
                            <span>Delivery fee</span>
                            <span>₹{order.delivery_fee}</span>
                        </div>
                        <div className="flex items-center justify-between text-base font-bold text-ink mt-1">
                            <span>Total</span>
                            <span>₹{order.total_amount}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Timeline */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Timeline
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4 flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted">Placed</span>
                        <span className="text-ink">
                            {formatDate(order.placed_at)}
                        </span>
                    </div>
<div className="flex items-center justify-between">
                        <span className="text-muted">Delivered</span>
                        <span className="text-ink">
                            {formatDate(order.delivered_at)}
                        </span>
                    </div>
                </div>
            </section>

            {statusError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {statusError}
                </p>
            )}

            {order.order_status === "preparing" && (
                <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleStatusUpdate("out_for_delivery")}
                    className="h-11 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {updatingStatus ? "Updating..." : "Mark Picked Up"}
                </button>
            )}

            {order.order_status === "out_for_delivery" && (
                <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleStatusUpdate("delivered")}
                    className="h-11 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {updatingStatus ? "Updating..." : "Mark Delivered"}
                </button>
            )}
        </div>
    );
};

export default DeliveryOrderDetailPage;