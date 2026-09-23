import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    getMyRestaurant,
    getRestaurantOrders,
    updateOrderStatus,
} from "../../api/restaurantApi";
import { assignNearestPartner } from "../../api/deliveryApi";

// The restaurant owner's role ends at 'preparing'. Both marking an order
// picked up (out_for_delivery) and delivered are the delivery partner's
// actions alone, on their own dashboard — the owner has no way to actually
// know when a partner picks up or delivers an order.
const NEXT_STATUS = {
    placed: "confirmed",
    confirmed: "preparing",
};

const STATUS_LABELS = {
    placed: "Placed",
    confirmed: "Confirmed",
    preparing: "Preparing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
};

const STATUS_STYLES = {
    placed: "text-primary bg-primary/10",
    confirmed: "text-primary bg-primary/10",
    preparing: "text-warning bg-warning-bg",
    out_for_delivery: "text-warning bg-warning-bg",
    delivered: "text-success bg-success-bg",
    cancelled: "text-error bg-error-bg",
};

// Assignment only makes sense once an order is confirmed and the kitchen has
// (or is) preparing it — matches the same statuses the delivery partner's
// own "available orders" list already considers assignable on the backend.
const ASSIGNABLE_STATUSES = ["confirmed", "preparing"];

const formatDate = (value) => {
    if (!value) return "—";

    return new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
};

const OwnerDashboardPage = () => {
    const [restaurant, setRestaurant] = useState(null);
    const [orders, setOrders] = useState([]);

    const [loading, setLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);

    const [error, setError] = useState(null);
    const [ordersError, setOrdersError] = useState(null);

    const [updatingOrderId, setUpdatingOrderId] = useState(null);

    // Delivery-partner assignment UI state, keyed by order_id so each
    // order's card can show its own loading/error/success independently.
    const [assigningOrderId, setAssigningOrderId] = useState(null);
    const [assignErrorByOrder, setAssignErrorByOrder] = useState({});
    const [assignSuccessByOrder, setAssignSuccessByOrder] = useState({});
    // distance_km only ever comes back on the assign response itself (it's
    // not stored on the order), so it's kept here rather than expected to
    // survive a refetch.
    const [assignDistanceByOrder, setAssignDistanceByOrder] = useState({});

    const fetchRestaurant = async () => {
        try {
            const data = await getMyRestaurant();
            setRestaurant(data.restaurant);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    "Something went wrong while loading your restaurant."
            );
        }
    };

    const fetchOrders = async () => {
        setOrdersLoading(true);
        setOrdersError(null);

        try {
            const data = await getRestaurantOrders();
            setOrders(data.orders || []);
        } catch (err) {
            setOrdersError(
                err.response?.data?.message ||
                    "Something went wrong while loading orders."
            );
        } finally {
            setOrdersLoading(false);
        }
    };

    useEffect(() => {
        const loadDashboard = async () => {
            setLoading(true);

            await Promise.all([fetchRestaurant(), fetchOrders()]);

            setLoading(false);
        };

        loadDashboard();
    }, []);

    const handleStatusUpdate = async (order) => {
        const nextStatus = NEXT_STATUS[order.order_status];

        if (!nextStatus) return;

        setUpdatingOrderId(order.order_id);
        setOrdersError(null);

        try {
            await updateOrderStatus(order.order_id, nextStatus);

            // Reload orders so the new status comes directly
            // from the backend.
            await fetchOrders();
        } catch (err) {
            setOrdersError(
                err.response?.data?.message ||
                    "Failed to update the order status."
            );
        } finally {
            setUpdatingOrderId(null);
        }
    };

    // Calls the EXISTING PATCH /api/delivery/orders/:id/assign with no
    // delivery_partner_id — the backend's existing auto-assignment logic
    // (online + location + no active order + within 10 km, nearest first)
    // picks the partner. Nothing about distance or eligibility is decided
    // here in the frontend.
    const handleAssignNearestPartner = async (order) => {
        const orderId = order.order_id;

        setAssigningOrderId(orderId);
        setAssignErrorByOrder((prev) => ({ ...prev, [orderId]: null }));
        setAssignSuccessByOrder((prev) => ({ ...prev, [orderId]: null }));

        try {
            const data = await assignNearestPartner(orderId);

            if (typeof data.distance_km === "number") {
                setAssignDistanceByOrder((prev) => ({
                    ...prev,
                    [orderId]: data.distance_km,
                }));
            }

            setAssignSuccessByOrder((prev) => ({
                ...prev,
                [orderId]:
                    data.message || "Delivery partner assigned successfully.",
            }));

            // Refresh so the order's delivery_partner_id/name comes
            // straight from the backend, same as handleStatusUpdate does.
            await fetchOrders();
        } catch (err) {
            setAssignErrorByOrder((prev) => ({
                ...prev,
                [orderId]:
                    err.response?.data?.message ||
                    "Failed to assign a delivery partner.",
            }));
        } finally {
            setAssigningOrderId(null);
        }
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <p className="text-sm text-muted py-4">
                    Loading your restaurant...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <p className="text-sm text-muted py-4">
                    You don't have a restaurant yet.
                </p>
            </div>
        );
    }

    // Delivered/cancelled orders live on the dedicated Order History page —
    // this dashboard only ever shows orders that still need action.
    const activeOrders = orders.filter(
        (order) =>
            order.order_status !== "delivered" &&
            order.order_status !== "cancelled"
    );

    return (
        <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Restaurant information */}
            <section>
                <div className="flex items-center gap-2">
                    <h1 className="inline-block text-2xl font-semibold text-ink">
                        {restaurant.name}
                    </h1>

                    <span
                        className={`inline-block text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                            restaurant.is_open
                                ? "text-success bg-success-bg"
                                : "text-error bg-error-bg"
                        }`}
                    >
                        {restaurant.is_open ? "Open" : "Closed"}
                    </span>
                </div>

                {restaurant.description && (
                    <p className="text-muted mt-2 max-w-prose">
                        {restaurant.description}
                    </p>
                )}

                <div className="bg-surface border border-border rounded-lg shadow-card p-6 mt-6 grid gap-1.5">
                    {restaurant.cuisine_type && (
                        <p className="text-sm text-muted">
                            Cuisine: {restaurant.cuisine_type}
                        </p>
                    )}

                    <p className="text-sm">
                        {restaurant.address_line}
                    </p>

                    <p className="text-sm">
                        {restaurant.city}, {restaurant.state} -{" "}
                        {restaurant.pincode}
                    </p>

                    {restaurant.phone && (
                        <p className="text-sm">
                            Phone: {restaurant.phone}
                        </p>
                    )}

                    <p className="text-sm text-muted">
                        Average Rating:{" "}
                        {restaurant.avg_rating ?? "No ratings yet"}
                    </p>
                </div>
            </section>

            {/* Orders — active only. Delivered/cancelled orders have moved
                to the dedicated Order History page so this list only ever
                shows orders that actually need attention. */}
            <section className="mt-10">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-ink">
                        Active Orders
                    </h2>

                    <button
                        type="button"
                        onClick={fetchOrders}
                        className="text-sm text-primary hover:underline"
                    >
                        Refresh
                    </button>
                </div>

                {ordersError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                        {ordersError}
                    </p>
                )}

                {ordersLoading ? (
                    <p className="text-sm text-muted py-4">
                        Loading orders...
                    </p>
                ) : activeOrders.length === 0 ? (
                    <div className="bg-surface border border-border rounded-lg p-6">
                        <p className="text-sm text-muted">
                            No active orders right now.{" "}
                            <Link
                                to="/owner/history"
                                className="text-primary font-medium hover:underline"
                            >
                                View order history
                            </Link>
                            .
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {activeOrders.map((order) => {
                            const nextStatus =
                                NEXT_STATUS[order.order_status];

                            return (
                                <div
                                    key={order.order_id}
                                    className="bg-surface border border-border rounded-lg shadow-card p-5"
                                >
                                    {/* Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold text-ink">
                                                Order #{order.order_id}
                                            </h3>

                                            <p className="text-sm text-muted mt-1">
                                                {formatDate(order.placed_at)}
                                            </p>
                                        </div>

                                        <span
                                            className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                                STATUS_STYLES[
                                                    order.order_status
                                                ] ||
                                                "text-muted bg-gray-100"
                                            }`}
                                        >
                                            {STATUS_LABELS[
                                                order.order_status
                                            ] ||
                                                order.order_status}
                                        </span>
                                    </div>

                                    {/* Customer */}
                                    <div className="mt-4">
                                        <p className="text-sm font-medium text-ink">
                                            Customer
                                        </p>

                                        <p className="text-sm text-muted">
                                            {order.customer_name}
                                            {order.customer_phone
                                                ? ` · ${order.customer_phone}`
                                                : ""}
                                        </p>
                                    </div>

                                    {/* Delivery address */}
                                    {order.address_line && (
                                        <div className="mt-3">
                                            <p className="text-sm font-medium text-ink">
                                                Delivery Address
                                            </p>

                                            <p className="text-sm text-muted">
                                                {order.address_line},{" "}
                                                {order.city},{" "}
                                                {order.state}{" "}
                                                {order.pincode || ""}
                                            </p>
                                        </div>
                                    )}

                                    {/* Delivery Partner */}
                                    <div className="mt-3">
                                        <p className="text-sm font-medium text-ink">
                                            Delivery Partner
                                        </p>

                                        {order.delivery_partner_id ? (
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <span className="text-sm text-ink">
                                                    {order.delivery_partner_name ||
                                                        `Partner #${order.delivery_partner_id}`}
                                                </span>
                                                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-success bg-success-bg">
                                                    Assigned
                                                </span>
                                                {assignDistanceByOrder[
                                                    order.order_id
                                                ] !== undefined && (
                                                    <span className="text-sm text-muted">
                                                        Distance:{" "}
                                                        {
                                                            assignDistanceByOrder[
                                                                order.order_id
                                                            ]
                                                        }{" "}
                                                        km
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-3 mt-1">
                                                <span className="text-sm text-muted">
                                                    Not assigned
                                                </span>

                                                {ASSIGNABLE_STATUSES.includes(
                                                    order.order_status
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleAssignNearestPartner(
                                                                order
                                                            )
                                                        }
                                                        disabled={
                                                            assigningOrderId ===
                                                            order.order_id
                                                        }
                                                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-white disabled:opacity-50"
                                                    >
                                                        {assigningOrderId ===
                                                        order.order_id
                                                            ? "Assigning..."
                                                            : "Assign Nearest Partner"}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {assignSuccessByOrder[
                                            order.order_id
                                        ] && (
                                            <p className="text-sm text-success mt-1.5">
                                                {
                                                    assignSuccessByOrder[
                                                        order.order_id
                                                    ]
                                                }
                                            </p>
                                        )}

                                        {assignErrorByOrder[
                                            order.order_id
                                        ] && (
                                            <p className="text-sm text-error mt-1.5">
                                                {
                                                    assignErrorByOrder[
                                                        order.order_id
                                                    ]
                                                }
                                            </p>
                                        )}
                                    </div>

                                    {/* Items */}
                                    <div className="mt-4">
                                        <p className="text-sm font-medium text-ink mb-2">
                                            Items
                                        </p>

                                        <div className="flex flex-col gap-1">
                                            {order.items?.map((item) => (
                                                <div
                                                    key={
                                                        item.order_item_id
                                                    }
                                                    className="flex justify-between text-sm"
                                                >
                                                    <span className="text-muted">
                                                        {item.name} ×{" "}
                                                        {item.quantity}
                                                    </span>

                                                    <span className="text-ink">
                                                        ₹
                                                        {Number(
                                                            item.item_subtotal
                                                        ).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Total */}
                                    <div className="border-t border-border mt-4 pt-4 flex justify-between">
                                        <span className="font-medium text-ink">
                                            Total
                                        </span>

                                        <span className="font-semibold text-ink">
                                            ₹
                                            {Number(
                                                order.total_amount
                                            ).toFixed(2)}
                                        </span>
                                    </div>

                                    {/* Status action */}
                                    {nextStatus && (
                                        <div className="mt-4">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleStatusUpdate(
                                                        order
                                                    )
                                                }
                                                disabled={
                                                    updatingOrderId ===
                                                    order.order_id
                                                }
                                                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-white disabled:opacity-50"
                                            >
                                                {updatingOrderId ===
                                                order.order_id
                                                    ? "Updating..."
                                                    : `Mark ${STATUS_LABELS[
                                                          nextStatus
                                                      ]}`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

export default OwnerDashboardPage;