import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { getOrderById, cancelOrder, confirmDelivery } from "../../api/orderApi";
import { getRestaurantById } from "../../api/restaurantApi";
import { getAddressById } from "../../api/addressApi";
import { getOrderTracking } from "../../api/trackingApi";
import { getRoadRouteWithDuration } from "../../api/routingApi";
import { estimateRemainingSeconds, formatEtaMinutes } from "../../utils/eta";
import { createSocketConnection } from "../../sockets/socketClient";
import LiveTrackingMap from "../../components/map/LiveTrackingMap";
import {
    getOrderReviews,
    submitRestaurantReview,
    submitDeliveryPartnerReview,
} from "../../api/reviewApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";

const STATUS_SEQUENCE = [
    "placed",
    "confirmed",
    "preparing",
    "out_for_delivery",
    "delivered",
];

const STATUS_STEP_LABELS = {
    placed: "Placed",
    confirmed: "Confirmed",
    preparing: "Preparing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
};

// Purely presentational progress bar derived from order_status — draws no
// data of its own and changes nothing about how status is fetched or
// updated. Cancelled orders fall back to just the status badge above this
// (handled by the caller only rendering this when relevant).
const StatusTimeline = ({ status }) => {
    const currentIndex = STATUS_SEQUENCE.indexOf(status);
    if (currentIndex === -1) return null;

    return (
        <div className="flex items-center mb-6">
            {STATUS_SEQUENCE.map((step, index) => (
                <div
                    key={step}
                    className="flex items-center flex-1 last:flex-none"
                >
                    <div className="flex flex-col items-center gap-1.5">
                        <div
                            className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                index <= currentIndex
                                    ? "bg-primary text-white"
                                    : "bg-background border border-border text-muted"
                            }`}
                        >
                            {index < currentIndex ? "✓" : index + 1}
                        </div>
                        <span
                            className={`hidden sm:block text-[11px] font-semibold text-center whitespace-nowrap ${
                                index <= currentIndex
                                    ? "text-ink"
                                    : "text-muted"
                            }`}
                        >
                            {STATUS_STEP_LABELS[step]}
                        </span>
                    </div>
                    {index < STATUS_SEQUENCE.length - 1 && (
                        <div
                            className={`h-px flex-1 mx-2 mb-4 sm:mb-4 transition-colors ${
                                index < currentIndex
                                    ? "bg-primary"
                                    : "bg-border"
                            }`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

const STATUS_STYLES = {
    placed: "text-primary bg-primary/10",
    confirmed: "text-primary bg-primary/10",
    preparing: "text-warning bg-warning-bg",
    out_for_delivery: "text-warning bg-warning-bg",
    delivered: "text-success bg-success-bg",
    cancelled: "text-error bg-error-bg",
};

const CANCELLABLE_STATUSES = ["placed", "confirmed"];

const formatDate = (value) =>
    value
        ? new Date(value).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          })
        : "—";

// Small inline star picker — five clickable stars, filled up to the
// selected value. Kept local to this page rather than a new component file
// since it's only used here.
const StarPicker = ({ value, onChange, disabled }) => (
    <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
            <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange(n)}
                className={`text-2xl leading-none transition-colors disabled:cursor-not-allowed ${
                    n <= value ? "text-primary" : "text-border"
                }`}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
                ★
            </button>
        ))}
    </div>
);

const OrderDetailPage = () => {
    const { orderId } = useParams();

    const [order, setOrder] = useState(null);
    const [items, setItems] = useState([]);
    const [restaurant, setRestaurant] = useState(null);
    const [address, setAddress] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState(null);

    const loadOrder = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getOrderById(orderId);
            setOrder(data.order);
            setItems(data.items);

            const [restaurantData, addressData] = await Promise.all([
                getRestaurantById(data.order.restaurant_id),
                getAddressById(data.order.delivery_address_id),
            ]);
            setRestaurant(restaurantData.restaurant);
            setAddress(addressData.address);
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

    // Live tracking: only active while the order is out_for_delivery.
    // Loads the last-known position via the existing tracking endpoint
    // first, then joins the existing order_${orderId} Socket.io room so
    // later updates move the delivery-partner marker without a refresh.
    const [tracking, setTracking] = useState(null);
    const [trackingError, setTrackingError] = useState(null);
    // Road route from OSRM (restaurant -> destination). Fetched ONCE per
    // tracking session, not on every delivery:location socket event — a
    // routing request every few seconds would be wasteful and unnecessary,
    // since the road path itself doesn't change, only the partner's
    // position along it. routeDurationSeconds is OSRM's own estimate for
    // the full route and, combined with the partner's live position, is
    // what powers the "estimated delivery time" display below — no extra
    // network calls needed as the partner moves.
    const [roadRoute, setRoadRoute] = useState(null);
    const [routeDurationSeconds, setRouteDurationSeconds] = useState(null);

    useEffect(() => {
        if (!order || order.order_status !== "out_for_delivery") {
            setTracking(null);
            setRoadRoute(null);
            setRouteDurationSeconds(null);
            return;
        }

        let socket;
        let cancelled = false;

        const startTracking = async () => {
            try {
                const data = await getOrderTracking(orderId);
                if (!cancelled) setTracking(data.tracking);

                const t = data.tracking;
                if (
                    t?.restaurant_latitude != null &&
                    t?.restaurant_longitude != null &&
                    t?.delivery_latitude != null &&
                    t?.delivery_longitude != null
                ) {
                    try {
                        const { points, durationSeconds } =
                            await getRoadRouteWithDuration(
                                {
                                    latitude: t.restaurant_latitude,
                                    longitude: t.restaurant_longitude,
                                },
                                {
                                    latitude: t.delivery_latitude,
                                    longitude: t.delivery_longitude,
                                }
                            );
                        if (!cancelled) {
                            setRoadRoute(points);
                            setRouteDurationSeconds(durationSeconds);
                        }
                    } catch {
                        // Routing unavailable/failed — LiveTrackingMap
                        // already falls back to a straight line when
                        // roadRoute is null, so this isn't fatal to the
                        // rest of the tracking UI. The ETA display simply
                        // hides itself when there's no route to base it on.
                        if (!cancelled) {
                            setRoadRoute(null);
                            setRouteDurationSeconds(null);
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setTrackingError(
                        err.response?.data?.message ||
                            "Failed to load live tracking."
                    );
                }
            }

            socket = createSocketConnection();
            socket.emit("joinOrderRoom", orderId);
            socket.on("delivery:location", (payload) => {
                if (String(payload.order_id) !== String(orderId)) return;
                setTracking((prev) =>
                    prev
                        ? {
                              ...prev,
                              delivery_partner_latitude: payload.latitude,
                              delivery_partner_longitude: payload.longitude,
                          }
                        : prev
                );
            });
            // Fired by the backend the moment the delivery partner marks
            // this order delivered. Reuses the same room/connection the
            // live-location updates already use — no second WebSocket
            // system. Refetching the full order (rather than just flipping
            // a local flag) keeps the UI in sync with the real database
            // state, including delivered_at.
            socket.on("order:delivered", (payload) => {
                if (String(payload.order_id) !== String(orderId)) return;
                loadOrder();
            });
        };

        startTracking();

        return () => {
            cancelled = true;
            if (socket) socket.disconnect();
        };
    }, [order?.order_status, orderId]);

    // Estimated delivery time shown to the customer.
    //   - Before dispatch (placed/confirmed/preparing): a friendly static
    //     estimate of placed_at + 40 minutes — typical for prep + delivery
    //     on a college-demo dataset, not tied to any live signal yet.
    //   - Once out_for_delivery: recomputed from the partner's live
    //     position against the already-fetched OSRM route, so it counts
    //     down naturally as they move (see utils/eta.js) with no extra
    //     network calls beyond the one route fetch above.
    const STATIC_PREP_ESTIMATE_MINUTES = 40;

    const estimatedDeliveryLabel = useMemo(() => {
        if (!order) return null;

        if (order.order_status === "out_for_delivery") {
            const partnerPosition =
                tracking?.delivery_partner_latitude != null &&
                tracking?.delivery_partner_longitude != null
                    ? [
                          Number(tracking.delivery_partner_latitude),
                          Number(tracking.delivery_partner_longitude),
                      ]
                    : null;

            const remainingSeconds = estimateRemainingSeconds(
                roadRoute,
                routeDurationSeconds,
                partnerPosition
            );
            const formatted = formatEtaMinutes(remainingSeconds);
            return formatted ? `Arriving in ${formatted}` : null;
        }

        if (order.order_status === "placed" || order.order_status === "confirmed" || order.order_status === "preparing") {
            if (!order.placed_at) return null;
            const estimatedTime = new Date(
                new Date(order.placed_at).getTime() +
                    STATIC_PREP_ESTIMATE_MINUTES * 60000
            );
            return `Estimated delivery by ${estimatedTime.toLocaleTimeString(
                undefined,
                { hour: "numeric", minute: "2-digit" }
            )}`;
        }

        return null; // delivered / cancelled — no ETA needed
    }, [
        order?.order_status,
        order?.placed_at,
        tracking?.delivery_partner_latitude,
        tracking?.delivery_partner_longitude,
        roadRoute,
        routeDurationSeconds,
    ]);

    const handleCancel = async () => {
        setCancelling(true);
        setCancelError(null);
        try {
            await cancelOrder(orderId);
            await loadOrder();
        } catch (err) {
            setCancelError(
                err.response?.data?.message || "Failed to cancel order."
            );
        } finally {
            setCancelling(false);
        }
    };

    const [confirming, setConfirming] = useState(false);
    const [confirmError, setConfirmError] = useState(null);

    const handleConfirmDelivery = async () => {
        setConfirming(true);
        setConfirmError(null);
        try {
            await confirmDelivery(orderId);
            await loadOrder();
        } catch (err) {
            setConfirmError(
                err.response?.data?.message ||
                    "Failed to confirm delivery."
            );
        } finally {
            setConfirming(false);
        }
    };

    // Reviews: only relevant once the order is delivered. Loads any
    // existing reviews so the form can be replaced with a "thanks" state
    // instead of letting the customer submit twice (the backend also
    // enforces this via UNIQUE(order_id), but checking first avoids a
    // pointless failed request).
    const [reviews, setReviews] = useState(null);
    const [reviewsError, setReviewsError] = useState(null);

    const [restaurantRating, setRestaurantRating] = useState(0);
    const [restaurantComment, setRestaurantComment] = useState("");
    const [submittingRestaurantReview, setSubmittingRestaurantReview] = useState(false);
    const [restaurantReviewError, setRestaurantReviewError] = useState(null);

    const [partnerRating, setPartnerRating] = useState(0);
    const [partnerComment, setPartnerComment] = useState("");
    const [submittingPartnerReview, setSubmittingPartnerReview] = useState(false);
    const [partnerReviewError, setPartnerReviewError] = useState(null);

    useEffect(() => {
        if (
            !order ||
            order.order_status !== "delivered" ||
            !order.customer_confirmed_at
        ) {
            setReviews(null);
            return;
        }

        const fetchReviews = async () => {
            try {
                const data = await getOrderReviews(orderId);
                setReviews(data);
            } catch (err) {
                setReviewsError(
                    err.response?.data?.message ||
                        "Failed to load review status."
                );
            }
        };

        fetchReviews();
    }, [order?.order_status, order?.customer_confirmed_at, orderId]);

    const handleSubmitRestaurantReview = async (e) => {
        e.preventDefault();
        if (restaurantRating < 1) {
            setRestaurantReviewError("Please select a star rating.");
            return;
        }

        setSubmittingRestaurantReview(true);
        setRestaurantReviewError(null);
        try {
            const data = await submitRestaurantReview(
                orderId,
                restaurantRating,
                restaurantComment.trim() || null
            );
            setReviews((prev) => ({
                ...prev,
                restaurant_review: data.review,
            }));
        } catch (err) {
            setRestaurantReviewError(
                err.response?.data?.message || "Failed to submit review."
            );
        } finally {
            setSubmittingRestaurantReview(false);
        }
    };

    const handleSubmitPartnerReview = async (e) => {
        e.preventDefault();
        if (partnerRating < 1) {
            setPartnerReviewError("Please select a star rating.");
            return;
        }

        setSubmittingPartnerReview(true);
        setPartnerReviewError(null);
        try {
            const data = await submitDeliveryPartnerReview(
                orderId,
                partnerRating,
                partnerComment.trim() || null
            );
            setReviews((prev) => ({
                ...prev,
                delivery_partner_review: data.review,
            }));
        } catch (err) {
            setPartnerReviewError(
                err.response?.data?.message || "Failed to submit review."
            );
        } finally {
            setSubmittingPartnerReview(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-muted py-4">Loading order...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    const canCancel = CANCELLABLE_STATUSES.includes(order.order_status);
    const isCancelled = order.order_status === "cancelled";

    return (
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
            <Link
                to="/customer/orders"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to my orders
            </Link>

            <div className="flex items-start justify-between gap-3 mt-3 mb-6">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
                        <ImageWithFallback
                            src={restaurant?.image_url}
                            alt={restaurant?.name || "Restaurant"}
                            className="w-full h-full object-cover"
                            iconClassName="w-4 h-4"
                        />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold text-ink truncate">
                            Order #{order.order_id}
                        </h1>
                        <p className="text-sm text-muted truncate">
                            {restaurant?.name}
                        </p>
                    </div>
                </div>
                <span
                    className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                        STATUS_STYLES[order.order_status] ||
                        "text-muted bg-background"
                    }`}
                >
                    {order.order_status.replace(/_/g, " ")}
                </span>
            </div>

            {!isCancelled && (
                <StatusTimeline status={order.order_status} />
            )}

            {estimatedDeliveryLabel && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink mb-6 -mt-2">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="w-4 h-4 text-primary shrink-0"
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path
                            d="M12 7v5l3 3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    {estimatedDeliveryLabel}
                </p>
            )}

            {order.order_status === "out_for_delivery" && (
                <section className="mb-6">
                    <div className="bg-surface border border-border rounded-lg shadow-card p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-semibold text-ink">
                                Live Tracking
                            </h2>
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                                On the way
                            </span>
                        </div>
                        {trackingError ? (
                            <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                {trackingError}
                            </p>
                        ) : tracking ? (
                            <>
                                {tracking.delivery_partner_name && (
                                    <div className="flex items-center justify-between gap-3 bg-background border border-border rounded-md px-4 py-3 mb-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-ink truncate">
                                                {tracking.delivery_partner_name}
                                            </p>
                                            <p className="text-xs text-muted mt-0.5">
                                                {tracking.delivery_partner_vehicle_type
                                                    ? tracking.delivery_partner_vehicle_type
                                                          .charAt(0)
                                                          .toUpperCase() +
                                                      tracking.delivery_partner_vehicle_type.slice(
                                                          1
                                                      )
                                                    : "Delivery partner"}
                                                {tracking.delivery_partner_rating
                                                    ? ` · ★ ${tracking.delivery_partner_rating}`
                                                    : ""}
                                            </p>
                                        </div>
                                        {tracking.delivery_partner_phone && (
                                            <a
                                                href={`tel:${tracking.delivery_partner_phone}`}
                                                className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
                                            >
                                                {tracking.delivery_partner_phone}
                                            </a>
                                        )}
                                    </div>
                                )}
                                <LiveTrackingMap
                                    restaurant={{
                                        latitude: tracking.restaurant_latitude,
                                        longitude: tracking.restaurant_longitude,
                                    }}
                                    customer={{
                                        latitude: tracking.delivery_latitude,
                                        longitude: tracking.delivery_longitude,
                                    }}
                                    partner={{
                                        latitude:
                                            tracking.delivery_partner_latitude,
                                        longitude:
                                            tracking.delivery_partner_longitude,
                                    }}
                                    roadRoute={roadRoute}
                                />
                            </>
                        ) : (
                            <p className="text-sm text-muted">
                                Loading live tracking...
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* Items */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Items
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    <div className="flex flex-col gap-3 mb-3">
                        {items.map((item) => (
                            <div
                                key={item.order_item_id}
                                className="flex items-center gap-3 text-sm"
                            >
                                <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
                                    <ImageWithFallback
                                        src={item.image_url}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                        iconClassName="w-4 h-4"
                                    />
                                </div>
                                <span className="text-muted flex-1">
                                    {item.name} × {item.quantity} (₹
                                    {item.unit_price} each)
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
                        {Number(order.discount_amount) > 0 && (
                            <div className="flex items-center justify-between text-sm text-muted">
                                <span>Discount</span>
                                <span>-₹{order.discount_amount}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between text-sm text-muted">
                            <span>Tax</span>
                            <span>₹{order.tax_amount}</span>
                        </div>
                        <div className="flex items-center justify-between text-base font-bold text-ink mt-1">
                            <span>Total</span>
                            <span>₹{order.total_amount}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Delivery address */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Delivery Address
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    {address ? (
                        <>
                            <p className="text-sm font-semibold text-ink">
                                {address.label}
                            </p>
                            <p className="text-sm text-muted">
                                {address.address_line}, {address.city},{" "}
                                {address.state} - {address.pincode}
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-muted">
                            Address unavailable.
                        </p>
                    )}
                </div>
            </section>

            {/* Timestamps */}
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

            {order.order_status === "delivered" && !order.customer_confirmed_at && (
                <section className="mb-6">
                    <div className="bg-primary/6 border border-primary/20 rounded-lg shadow-card p-6 text-center">
                        <p className="text-2xl mb-1">🎉</p>
                        <p className="text-lg font-semibold text-ink mb-1">
                            Your order has arrived!
                        </p>
                        <p className="text-sm text-muted mb-4">
                            Did you receive your order?
                        </p>

                        {confirmError && (
                            <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4 text-left">
                                {confirmError}
                            </p>
                        )}

                        <button
                            type="button"
                            disabled={confirming}
                            onClick={handleConfirmDelivery}
                            className="h-11 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {confirming ? "Confirming..." : "Yes, I received it"}
                        </button>
                    </div>
                </section>
            )}

            {order.order_status === "delivered" && order.customer_confirmed_at && (
                <section className="mb-6">
                    <div className="bg-success-bg border border-success/25 rounded-lg p-4 text-center">
                        <p className="text-sm font-semibold text-success">
                            Order completed ✓
                        </p>
                    </div>
                </section>
            )}

            {order.order_status === "delivered" && order.customer_confirmed_at && (
                <section className="mb-6">
                    <h2 className="text-lg font-semibold text-ink mb-3">
                        Rate Your Order
                    </h2>

                    {reviewsError && (
                        <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-3">
                            {reviewsError}
                        </p>
                    )}

                    {/* Restaurant review */}
                    <div className="bg-surface border border-border rounded-lg shadow-card p-4 mb-3">
                        <p className="text-sm font-semibold text-ink mb-2">
                            {restaurant?.name || "Restaurant"}
                        </p>

                        {reviews?.restaurant_review ? (
                            <div>
                                <StarPicker
                                    value={reviews.restaurant_review.rating}
                                    onChange={() => {}}
                                    disabled
                                />
                                {reviews.restaurant_review.comment && (
                                    <p className="text-sm text-muted mt-2">
                                        {reviews.restaurant_review.comment}
                                    </p>
                                )}
                                <p className="text-xs text-success mt-2">
                                    Thanks for your feedback!
                                </p>
                            </div>
                        ) : reviews ? (
                            <form
                                onSubmit={handleSubmitRestaurantReview}
                                className="flex flex-col gap-2"
                            >
                                <StarPicker
                                    value={restaurantRating}
                                    onChange={setRestaurantRating}
                                    disabled={submittingRestaurantReview}
                                />
                                <textarea
                                    placeholder="Optional comment"
                                    value={restaurantComment}
                                    onChange={(e) =>
                                        setRestaurantComment(e.target.value)
                                    }
                                    className="w-full min-h-16 px-3 py-2 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                                />
                                {restaurantReviewError && (
                                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                        {restaurantReviewError}
                                    </p>
                                )}
                                <button
                                    type="submit"
                                    disabled={submittingRestaurantReview}
                                    className="self-start h-9 px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {submittingRestaurantReview
                                        ? "Submitting..."
                                        : "Submit Review"}
                                </button>
                            </form>
                        ) : (
                            <p className="text-sm text-muted">
                                Loading...
                            </p>
                        )}
                    </div>

                    {/* Delivery partner review — only if this order actually had one assigned */}
                    {order.delivery_partner_id && (
                        <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                            <p className="text-sm font-semibold text-ink mb-2">
                                Delivery Partner
                            </p>

                            {reviews?.delivery_partner_review ? (
                                <div>
                                    <StarPicker
                                        value={
                                            reviews.delivery_partner_review
                                                .rating
                                        }
                                        onChange={() => {}}
                                        disabled
                                    />
                                    {reviews.delivery_partner_review
                                        .comment && (
                                        <p className="text-sm text-muted mt-2">
                                            {
                                                reviews.delivery_partner_review
                                                    .comment
                                            }
                                        </p>
                                    )}
                                    <p className="text-xs text-success mt-2">
                                        Thanks for your feedback!
                                    </p>
                                </div>
                            ) : reviews ? (
                                <form
                                    onSubmit={handleSubmitPartnerReview}
                                    className="flex flex-col gap-2"
                                >
                                    <StarPicker
                                        value={partnerRating}
                                        onChange={setPartnerRating}
                                        disabled={submittingPartnerReview}
                                    />
                                    <textarea
                                        placeholder="Optional comment"
                                        value={partnerComment}
                                        onChange={(e) =>
                                            setPartnerComment(e.target.value)
                                        }
                                        className="w-full min-h-16 px-3 py-2 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                                    />
                                    {partnerReviewError && (
                                        <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                            {partnerReviewError}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={submittingPartnerReview}
                                        className="self-start h-9 px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {submittingPartnerReview
                                            ? "Submitting..."
                                            : "Submit Review"}
                                    </button>
                                </form>
                            ) : (
                                <p className="text-sm text-muted">
                                    Loading...
                                </p>
                            )}
                        </div>
                    )}
                </section>
            )}

            {cancelError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {cancelError}
                </p>
            )}

            {canCancel && (
                <button
                    type="button"
                    disabled={cancelling}
                    onClick={handleCancel}
                    className="h-10 px-4 rounded-sm font-semibold text-sm text-ink bg-surface border border-border transition-colors hover:not-disabled:border-error hover:not-disabled:text-error disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {cancelling ? "Cancelling..." : "Cancel Order"}
                </button>
            )}
        </div>
    );
};

export default OrderDetailPage;