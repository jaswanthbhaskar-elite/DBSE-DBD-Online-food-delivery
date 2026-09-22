import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAssignedOrders } from "../../api/deliveryApi";

const STATUS_STYLES = {
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

// Shows every order this delivery partner has finished — delivered or
// cancelled while assigned to them — separated out from
// DeliveryDashboardPage's active-deliveries list. Reuses the exact same
// GET /api/delivery/orders endpoint the dashboard already uses; no backend
// change needed for this page.
const DeliveryHistoryPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAssignedOrders();
            const completed = (data.orders || []).filter(
                (order) =>
                    order.order_status === "delivered" ||
                    order.order_status === "cancelled"
            );
            setOrders(completed);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    "Failed to load delivery history."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <Link
                to="/delivery"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to dashboard
            </Link>

            <div className="flex items-center justify-between mt-3 mb-6">
                <h1 className="text-2xl font-semibold text-ink">
                    Delivery History
                </h1>
                <button
                    type="button"
                    onClick={fetchHistory}
                    className="text-sm text-primary hover:underline"
                >
                    Refresh
                </button>
            </div>

            {error && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {error}
                </p>
            )}

            {loading ? (
                <p className="text-sm text-muted py-4">
                    Loading delivery history...
                </p>
            ) : orders.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-6">
                    <p className="text-sm text-muted">
                        You haven't completed any deliveries yet.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {orders.map((order) => (
                        <div
                            key={order.order_id}
                            className="bg-surface border border-border rounded-lg shadow-card p-4"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-ink">
                                        Order #{order.order_id} —{" "}
                                        {order.restaurant_name}
                                    </p>
                                    <p className="text-sm text-muted mt-0.5">
                                        Delivered to {order.customer_name} ·{" "}
                                        {order.delivery_city},{" "}
                                        {order.delivery_state}
                                    </p>
                                </div>
                                <span
                                    className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                        STATUS_STYLES[order.order_status] ||
                                        "text-muted bg-background"
                                    }`}
                                >
                                    {order.order_status}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border text-sm">
                                <div className="text-muted">
                                    <p>Placed {formatDate(order.placed_at)}</p>
                                    {order.order_status === "delivered" && (
                                        <p>
                                            Delivered{" "}
                                            {formatDate(order.delivered_at)}
                                        </p>
                                    )}
                                </div>
                                <span className="font-bold text-ink">
                                    ₹{order.total_amount}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DeliveryHistoryPage;