import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    getAssignedOrders,
    createDeliveryProfile,
    getAvailableOrders,
    acceptOrder,
} from "../../api/deliveryApi";

const STATUS_STYLES = {
    placed: "text-primary bg-primary/10",
    confirmed: "text-primary bg-primary/10",
    preparing: "text-warning bg-warning-bg",
    out_for_delivery: "text-warning bg-warning-bg",
    delivered: "text-success bg-success-bg",
    cancelled: "text-error bg-error-bg",
};

const VEHICLE_TYPES = ["bike", "scooter", "bicycle"];

const emptyProfileForm = { vehicle_type: "bike", license_number: "" };

const formatDate = (value) =>
    value
        ? new Date(value).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          })
        : "—";

const DeliveryDashboardPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Available (unassigned, eligible) orders this partner could accept.
    const [availableOrders, setAvailableOrders] = useState([]);
    const [loadingAvailable, setLoadingAvailable] = useState(true);
    const [availableError, setAvailableError] = useState(null);
    const [acceptingOrderId, setAcceptingOrderId] = useState(null);
    const [acceptError, setAcceptError] = useState(null);

    // Shown when GET /api/delivery/orders 404s because the logged-in user
    // has no DeliveryPartners row yet — reuses the existing profile-creation
    // endpoint instead of inventing a new one.
    const [needsProfile, setNeedsProfile] = useState(false);
    const [profileForm, setProfileForm] = useState(emptyProfileForm);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState(null);

    const fetchOrders = async () => {
        setLoading(true);
        setError(null);
        setNeedsProfile(false);
        try {
            const data = await getAssignedOrders();
            setOrders(data.orders);
        } catch (err) {
            if (err.response?.status === 404) {
                setNeedsProfile(true);
            } else {
                setError(
                    err.response?.data?.message ||
                        "Failed to load your assigned orders."
                );
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableOrders = async () => {
        setLoadingAvailable(true);
        setAvailableError(null);
        try {
            const data = await getAvailableOrders();
            setAvailableOrders(data.orders);
        } catch (err) {
            // A 404 here means "no profile yet" too, but fetchOrders already
            // surfaces the profile-creation form — no need to duplicate that
            // error, just skip showing anything in this section.
            if (err.response?.status !== 404) {
                setAvailableError(
                    err.response?.data?.message ||
                        "Failed to load available orders."
                );
            }
        } finally {
            setLoadingAvailable(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchAvailableOrders();
    }, []);

    const handleAccept = async (orderId) => {
        setAcceptingOrderId(orderId);
        setAcceptError(null);
        try {
            await acceptOrder(orderId);
            // Refresh both lists — the accepted order moves from
            // "available" to "assigned".
            await Promise.all([fetchOrders(), fetchAvailableOrders()]);
        } catch (err) {
            setAcceptError(
                err.response?.data?.message ||
                    "Failed to accept this order. It may have already been taken."
            );
        } finally {
            setAcceptingOrderId(null);
        }
    };

    const handleProfileFormChange = (field, value) => {
        setProfileForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleCreateProfile = async (e) => {
        e.preventDefault();
        if (!profileForm.license_number.trim()) {
            setProfileError("License number is required.");
            return;
        }

        setSavingProfile(true);
        setProfileError(null);
        try {
            await createDeliveryProfile(profileForm);
            await fetchOrders();
        } catch (err) {
            setProfileError(
                err.response?.data?.message ||
                    "Failed to create delivery partner profile."
            );
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-8">
                <p className="text-sm text-muted py-4">Loading...</p>
            </div>
        );
    }

    if (needsProfile) {
        return (
            <div className="max-w-md mx-auto px-6 py-8">
                <h1 className="text-2xl font-semibold text-ink mb-2">
                    Complete Your Delivery Partner Profile
                </h1>
                <p className="text-sm text-muted mb-6">
                    You need a delivery partner profile before you can view
                    assigned orders.
                </p>

                <form
                    onSubmit={handleCreateProfile}
                    className="bg-surface border border-border rounded-lg shadow-card p-4 flex flex-col gap-3"
                >
                    <div>
                        <label htmlFor="vehicle_type">Vehicle Type</label>
                        <select
                            id="vehicle_type"
                            value={profileForm.vehicle_type}
                            onChange={(e) =>
                                handleProfileFormChange(
                                    "vehicle_type",
                                    e.target.value
                                )
                            }
                            className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                        >
                            {VEHICLE_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type[0].toUpperCase() + type.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="license_number">
                            License Number
                        </label>
                        <input
                            id="license_number"
                            type="text"
                            value={profileForm.license_number}
                            onChange={(e) =>
                                handleProfileFormChange(
                                    "license_number",
                                    e.target.value
                                )
                            }
                            className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                        />
                    </div>

                    {profileError && (
                        <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                            {profileError}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={savingProfile}
                        className="h-10 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {savingProfile ? "Saving..." : "Save Profile"}
                    </button>
                </form>
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

    // Delivered/cancelled deliveries live on the dedicated Delivery History
    // page — "My Deliveries" here only ever shows orders still in progress.
    const activeOrders = orders.filter(
        (order) =>
            order.order_status !== "delivered" &&
            order.order_status !== "cancelled"
    );

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            <section className="mb-10">
                <h1 className="text-2xl font-semibold text-ink mb-1">
                    Available Orders
                </h1>
                <p className="text-sm text-muted mb-4">
                    Orders the restaurant has confirmed or started preparing,
                    with no delivery partner assigned yet.
                </p>

                {acceptError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-3">
                        {acceptError}
                    </p>
                )}

                {loadingAvailable && (
                    <p className="text-sm text-muted py-2">
                        Loading available orders...
                    </p>
                )}
                {availableError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                        {availableError}
                    </p>
                )}

                {!loadingAvailable &&
                    !availableError &&
                    (availableOrders.length === 0 ? (
                        <p className="text-sm text-muted">
                            No available orders right now.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {availableOrders.map((order) => (
                                <div
                                    key={order.order_id}
                                    className="bg-surface border border-border rounded-lg shadow-card p-4 flex items-center justify-between gap-4"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-ink">
                                            Order #{order.order_id} —{" "}
                                            {order.restaurant_name}
                                        </p>
                                        <p className="text-sm text-muted">
                                            Deliver to {order.customer_name} ·{" "}
                                            {order.delivery_city},{" "}
                                            {order.delivery_state}
                                        </p>
                                        <p className="text-xs text-muted mt-1">
                                            {formatDate(order.placed_at)} ·{" "}
                                            <span
                                                className={`font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                                    STATUS_STYLES[
                                                        order.order_status
                                                    ] ||
                                                    "text-muted bg-background"
                                                }`}
                                            >
                                                {order.order_status.replace(
                                                    /_/g,
                                                    " "
                                                )}
                                            </span>
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="font-bold text-ink">
                                            ₹{order.total_amount}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={
                                                acceptingOrderId ===
                                                order.order_id
                                            }
                                            onClick={() =>
                                                handleAccept(order.order_id)
                                            }
                                            className="h-9 px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {acceptingOrderId ===
                                            order.order_id
                                                ? "Accepting..."
                                                : "Accept"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
            </section>

            <h2 className="text-2xl font-semibold text-ink mb-6">
                My Deliveries
            </h2>

            {activeOrders.length === 0 ? (
                <p className="text-sm text-muted">
                    No active deliveries right now.{" "}
                    <Link
                        to="/delivery/history"
                        className="text-primary font-medium hover:underline"
                    >
                        View delivery history
                    </Link>
                    .
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {activeOrders.map((order) => (
                        <Link
                            key={order.order_id}
                            to={`/delivery/orders/${order.order_id}`}
                            className="bg-surface border border-border rounded-lg shadow-card p-4 flex items-center justify-between gap-4 transition-shadow hover:shadow-card-hover"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold text-ink">
                                    Order #{order.order_id} —{" "}
                                    {order.restaurant_name}
                                </p>
                                <p className="text-sm text-muted">
                                    Deliver to {order.customer_name} ·{" "}
                                    {order.delivery_city},{" "}
                                    {order.delivery_state}
                                </p>
                                <p className="text-xs text-muted mt-1">
                                    {formatDate(order.placed_at)}
                                </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <span
                                    className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                        STATUS_STYLES[order.order_status] ||
                                        "text-muted bg-background"
                                    }`}
                                >
                                    {order.order_status.replace(/_/g, " ")}
                                </span>
                                <span className="font-bold text-ink">
                                    ₹{order.total_amount}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DeliveryDashboardPage;