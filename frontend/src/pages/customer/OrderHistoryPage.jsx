import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOrders } from "../../api/orderApi";
import { getRestaurantById } from "../../api/restaurantApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";

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

const OrderHistoryPage = () => {
    const [orders, setOrders] = useState([]);
    const [restaurants, setRestaurants] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getOrders();
                setOrders(data.orders);

                // The order list doesn't include the restaurant's name or
                // image, only its ID — resolve each unique restaurant once
                // via the existing public restaurant endpoint (no backend
                // change).
                const uniqueRestaurantIds = [
                    ...new Set(data.orders.map((o) => o.restaurant_id)),
                ];
                const entries = await Promise.all(
                    uniqueRestaurantIds.map(async (id) => {
                        try {
                            const restaurantData = await getRestaurantById(id);
                            return [id, restaurantData.restaurant];
                        } catch {
                            return [
                                id,
                                { name: `Restaurant #${id}`, image_url: null },
                            ];
                        }
                    })
                );
                setRestaurants(Object.fromEntries(entries));
            } catch (err) {
                setError(
                    err.response?.data?.message ||
                        "Failed to load your orders."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-muted py-4">Loading orders...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
            <Link
                to="/customer"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to restaurants
            </Link>

            <h1 className="text-2xl font-semibold text-ink mt-3 mb-6">
                My Orders
            </h1>

            {orders.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted mb-3">
                        You haven't placed any orders yet.
                    </p>
                    <Link
                        to="/customer"
                        className="inline-flex h-10 items-center px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:bg-primary-hover"
                    >
                        Browse restaurants
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {orders.map((order) => {
                        const restaurant = restaurants[order.restaurant_id];
                        return (
                            <Link
                                key={order.order_id}
                                to={`/customer/orders/${order.order_id}`}
                                className="bg-surface border border-border rounded-lg shadow-card p-4 flex items-center gap-4 transition-shadow hover:shadow-card-hover"
                            >
                                <div className="w-14 h-14 rounded-md overflow-hidden shrink-0">
                                    <ImageWithFallback
                                        src={restaurant?.image_url}
                                        alt={restaurant?.name || "Restaurant"}
                                        className="w-full h-full object-cover"
                                        iconClassName="w-5 h-5"
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink truncate">
                                        Order #{order.order_id} —{" "}
                                        {restaurant?.name || "Restaurant"}
                                    </p>
                                    <p className="text-sm text-muted">
                                        {formatDate(order.placed_at)}
                                    </p>
                                </div>

                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <span
                                        className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                            STATUS_STYLES[
                                                order.order_status
                                            ] || "text-muted bg-background"
                                        }`}
                                    >
                                        {order.order_status.replace(/_/g, " ")}
                                    </span>
                                    <span className="font-bold text-ink">
                                        ₹{order.total_amount}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default OrderHistoryPage;