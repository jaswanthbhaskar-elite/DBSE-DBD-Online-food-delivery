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

const DeliveryOrderDetailPage = () => {
    const { orderId } = useParams();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState(null);

    // Live tracking state
    const [trackingMode, setTrackingMode] = useState(null);
    const [locationError, setLocationError] = useState(null);

    // Position currently displayed on the delivery partner's map.
    const [livePartnerPosition, setLivePartnerPosition] = useState(null);

    // OSRM road route used by the simulation and displayed on the map.
    const [roadRoute, setRoadRoute] = useState(null);

    const simulationStepRef = useRef(0);

    const SIMULATION_TOTAL_STEPS = 24;

    const loadOrder = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await getAssignedOrderById(orderId);
            setOrder(data.order);

            // Show the partner's currently stored DB location immediately,
            // if the backend provides it.
            if (
                data.order?.delivery_partner_latitude != null &&
                data.order?.delivery_partner_longitude != null
            ) {
                setLivePartnerPosition({
                    latitude: Number(data.order.delivery_partner_latitude),
                    longitude: Number(
                        data.order.delivery_partner_longitude
                    ),
                });
            }
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    "Failed to load this order."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrder();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    /*
     * Live location sharing.
     *
     * When the order is out_for_delivery:
     *
     * 1. Build the restaurant -> customer OSRM route.
     * 2. Use real GPS if available.
     * 3. Otherwise simulate movement along the OSRM route.
     * 4. Keep the local map marker synchronized with every location update.
     * 5. Send the same coordinates to the backend through updateLocation().
     */
    useEffect(() => {
        if (!order || order.order_status !== "out_for_delivery") {
            setTrackingMode(null);
            setRoadRoute(null);
            return undefined;
        }

        let cancelled = false;
        let gpsIntervalId = null;
        let simIntervalId = null;

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
            return undefined;
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
            return undefined;
        }

        setLocationError(null);
        simulationStepRef.current = 0;

        /*
         * Fetch the road route once for the map.
         */
        getRoadRoute(start, end)
            .then((route) => {
                if (cancelled) return;

                const sampledRoute = resampleRoute(
                    route,
                    SIMULATION_TOTAL_STEPS
                );

                setRoadRoute(sampledRoute);
            })
            .catch(() => {
                if (cancelled) return;

                // The simulator can still fall back to straight-line movement.
                setRoadRoute(null);
            });

        /*
         * Simulated movement.
         *
         * This uses the exact same coordinates that are sent to the backend.
         * The local React state is updated at the same time so the partner's
         * own map visibly moves.
         */
        const startSimulatedMovement = () => {
            if (cancelled) return;

            setTrackingMode("simulated");
            setLocationError(null);
            simulationStepRef.current = 0;

            let routeSteps = null;

            const startSimulation = (resolvedRoute) => {
                if (cancelled) return;

                routeSteps = resolvedRoute;

                const tick = () => {
                    if (cancelled) return;

                    simulationStepRef.current += 1;

                    const totalSteps = routeSteps
                        ? routeSteps.length
                        : SIMULATION_TOTAL_STEPS;

                    const stepIndex = Math.min(
                        simulationStepRef.current,
                        totalSteps
                    );

                    const fraction = stepIndex / totalSteps;

                    let latitude;
                    let longitude;

                    if (routeSteps && routeSteps.length > 0) {
                        [latitude, longitude] =
                            routeSteps[stepIndex - 1];
                    } else {
                        latitude =
                            start.latitude +
                            (end.latitude - start.latitude) *
                                fraction;

                        longitude =
                            start.longitude +
                            (end.longitude - start.longitude) *
                                fraction;
                    }

                    /*
                     * Update the delivery partner's own map immediately.
                     */
                    setLivePartnerPosition({
                        latitude,
                        longitude,
                    });

                    /*
                     * Send the exact same position to the backend.
                     */
                    updateLocation(latitude, longitude).catch(() => {
                        // A single failed tick is not fatal.
                        // The next tick retries.
                    });

                    if (fraction >= 1 && simIntervalId) {
                        clearInterval(simIntervalId);
                        simIntervalId = null;
                    }
                };

                // Move immediately.
                tick();

                // Then continue every 5 seconds.
                simIntervalId = setInterval(tick, 5000);
            };

            /*
             * Fetch the route for the simulator.
             */
            getRoadRoute(start, end)
                .then((route) => {
                    if (cancelled) return;

                    const sampledRoute = resampleRoute(
                        route,
                        SIMULATION_TOTAL_STEPS
                    );

                    setRoadRoute(sampledRoute);
                    startSimulation(sampledRoute);
                })
                .catch(() => {
                    if (cancelled) return;

                    setRoadRoute(null);
                    startSimulation(null);
                });
        };

        /*
         * Real GPS mode.
         *
         * If the browser has usable GPS permission, the actual browser
         * coordinates are shown on the map and sent to the backend.
         *
         * If GPS is unavailable/denied, simulation starts automatically.
         */
        const startRealGps = () => {
            if (cancelled) return;

            setTrackingMode("gps");
            setLocationError(null);

            const sendCurrentPosition = () => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        if (cancelled) return;

                        const latitude = position.coords.latitude;
                        const longitude = position.coords.longitude;

                        setLivePartnerPosition({
                            latitude,
                            longitude,
                        });

                        updateLocation(latitude, longitude).catch(() => {
                            // A single failed update is not fatal.
                        });
                    },
                    () => {
                        // Keep trying on the next interval.
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 10000,
                        timeout: 8000,
                    }
                );
            };

            sendCurrentPosition();
            gpsIntervalId = setInterval(sendCurrentPosition, 10000);
        };

        /*
         * One-time GPS probe.
         *
         * If GPS cannot be used, automatically switch to simulation.
         */
        if (!navigator.geolocation) {
            startSimulatedMovement();
        } else {
            navigator.geolocation.getCurrentPosition(
                () => {
                    if (!cancelled) {
                        startRealGps();
                    }
                },
                () => {
                    if (!cancelled) {
                        startSimulatedMovement();
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 5000,
                }
            );
        }

        return () => {
            cancelled = true;

            if (gpsIntervalId) {
                clearInterval(gpsIntervalId);
            }

            if (simIntervalId) {
                clearInterval(simIntervalId);
            }

            setTrackingMode(null);
            setLivePartnerPosition(null);
            setRoadRoute(null);
        };
    }, [
        order?.order_status,
        order?.restaurant_latitude,
        order?.restaurant_longitude,
        order?.delivery_latitude,
        order?.delivery_longitude,
        orderId,
    ]);

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
                <p className="text-sm text-muted py-4">
                    Loading order...
                </p>
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

    /*
     * Data passed to LiveTrackingMap.
     *
     * Restaurant and customer are static.
     * Partner is the live position updated by GPS/simulation.
     */
    const mapRestaurant = {
        latitude: order.restaurant_latitude,
        longitude: order.restaurant_longitude,
    };

    const mapCustomer = {
        latitude: order.delivery_latitude,
        longitude: order.delivery_longitude,
    };

    const mapPartner = livePartnerPosition
        ? {
              latitude: livePartnerPosition.latitude,
              longitude: livePartnerPosition.longitude,
          }
        : null;

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

                    {trackingMode === "gps"
                        ? "Sharing your live GPS location with the customer"
                        : trackingMode === "simulated"
                        ? "Simulating live delivery movement"
                        : "Starting live tracking..."}
                </p>
            )}

            {locationError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {locationError}
                </p>
            )}

            {/* Live Delivery Map */}
            {order.order_status === "out_for_delivery" && (
                <section className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-ink">
                            Live Delivery Map
                        </h2>

                        {trackingMode === "simulated" && (
                            <span className="text-xs font-semibold text-success bg-success-bg px-2.5 py-1 rounded-full">
                                Simulated GPS
                            </span>
                        )}

                        {trackingMode === "gps" && (
                            <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                Live GPS
                            </span>
                        )}
                    </div>

                    <LiveTrackingMap
                        restaurant={mapRestaurant}
                        customer={mapCustomer}
                        partner={mapPartner}
                        roadRoute={roadRoute}
                    />

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#c1440e]" />
                            Restaurant
                        </span>

                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#2f9e44]" />
                            Delivery Partner
                        </span>

                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#241c15]" />
                            Delivery Address
                        </span>
                    </div>
                </section>
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
                        {order.restaurant_city},{" "}
                        {order.restaurant_state}
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
                        {order.delivery_address_line},{" "}
                        {order.delivery_city},{" "}
                        {order.delivery_state} -{" "}
                        {order.delivery_pincode}
                    </p>

                    {order.customer_phone && (
                        <p className="text-sm text-muted mt-1">
                            {order.customer_phone}
                        </p>
                    )}
                </div>
            </section>

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
                    onClick={() =>
                        handleStatusUpdate("out_for_delivery")
                    }
                    className="h-11 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {updatingStatus
                        ? "Updating..."
                        : "Mark Picked Up"}
                </button>
            )}

            {order.order_status === "out_for_delivery" && (
                <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() =>
                        handleStatusUpdate("delivered")
                    }
                    className="h-11 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {updatingStatus
                        ? "Updating..."
                        : "Mark Delivered"}
                </button>
            )}
        </div>
    );
};

export default DeliveryOrderDetailPage;