import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    getCart,
    updateCartItemQuantity,
    removeCartItem,
    clearCart,
} from "../../api/cartApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";
import { FLAT_DELIVERY_FEE } from "../../constants/pricing";

const DELIVERY_FEE_PREVIEW = FLAT_DELIVERY_FEE;

const CartPage = () => {
    const navigate = useNavigate();

    const [cart, setCart] = useState(null);
    const [items, setItems] = useState([]);
    const [subtotal, setSubtotal] = useState(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyItemId, setBusyItemId] = useState(null);
    const [clearing, setClearing] = useState(false);

    const fetchCart = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCart();
            setCart(data.cart);
            setItems(data.items);
            setSubtotal(data.subtotal);
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to load your cart."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCart();
    }, []);

    const handleIncrease = async (item) => {
        setBusyItemId(item.item_id);
        setError(null);
        try {
            await updateCartItemQuantity(item.item_id, item.quantity + 1);
            await fetchCart();
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to update quantity."
            );
        } finally {
            setBusyItemId(null);
        }
    };

    const handleDecrease = async (item) => {
        setBusyItemId(item.item_id);
        setError(null);
        try {
            if (item.quantity <= 1) {
                await removeCartItem(item.item_id);
            } else {
                await updateCartItemQuantity(item.item_id, item.quantity - 1);
            }
            await fetchCart();
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to update quantity."
            );
        } finally {
            setBusyItemId(null);
        }
    };

    const handleRemove = async (item) => {
        setBusyItemId(item.item_id);
        setError(null);
        try {
            await removeCartItem(item.item_id);
            await fetchCart();
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to remove item."
            );
        } finally {
            setBusyItemId(null);
        }
    };

    const handleClearCart = async () => {
        setClearing(true);
        setError(null);
        try {
            await clearCart();
            await fetchCart();
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to clear cart."
            );
        } finally {
            setClearing(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-muted py-4">Loading your cart...</p>
            </div>
        );
    }

    const estimatedTotal = subtotal + (items.length > 0 ? DELIVERY_FEE_PREVIEW : 0);

    return (
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
            <Link
                to="/customer"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to restaurants
            </Link>

            <h1 className="text-2xl font-semibold text-ink mt-3 mb-6">
                Your Cart
            </h1>

            {error && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {error}
                </p>
            )}

            {!cart || items.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted mb-3">
                        Your cart is empty.
                    </p>
                    <Link
                        to="/customer"
                        className="inline-flex h-10 items-center px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:bg-primary-hover"
                    >
                        Browse restaurants
                    </Link>
                </div>
            ) : (
                <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
                    {/* Cart items */}
                    <div>
                        <p className="text-sm text-muted mb-4">
                            Ordering from{" "}
                            <span className="font-semibold text-ink">
                                {cart.restaurant_name}
                            </span>
                        </p>

                        <div className="flex flex-col gap-3">
                            {items.map((item) => (
                                <div
                                    key={item.cart_item_id}
                                    className="bg-surface border border-border rounded-lg shadow-card p-3 flex items-center gap-4"
                                >
                                    <div className="w-16 h-16 rounded-md overflow-hidden shrink-0">
                                        <ImageWithFallback
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                            iconClassName="w-5 h-5"
                                        />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-ink truncate">
                                            {item.name}
                                        </p>
                                        <p className="text-sm text-muted">
                                            ₹{item.price} × {item.quantity} = ₹
                                            {item.item_subtotal}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            disabled={busyItemId === item.item_id}
                                            onClick={() => handleDecrease(item)}
                                            className="w-8 h-8 rounded-sm border border-border text-ink font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            −
                                        </button>
                                        <span className="w-6 text-center text-sm font-medium text-ink">
                                            {item.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={busyItemId === item.item_id}
                                            onClick={() => handleIncrease(item)}
                                            className="w-8 h-8 rounded-sm border border-border text-ink font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            +
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busyItemId === item.item_id}
                                            onClick={() => handleRemove(item)}
                                            className="ml-2 text-sm text-error hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            disabled={clearing}
                            onClick={handleClearCart}
                            className="mt-4 h-10 px-4 rounded-sm font-semibold text-sm text-ink bg-surface border border-border transition-colors hover:border-error hover:text-error disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {clearing ? "Clearing..." : "Clear Cart"}
                        </button>
                    </div>

                    {/* Order summary */}
                    <div className="bg-surface border border-border rounded-lg shadow-card p-5 lg:sticky lg:top-24">
                        <h2 className="text-base font-semibold text-ink mb-4">
                            Order Summary
                        </h2>
                        <div className="flex flex-col gap-2 text-sm">
                            <div className="flex items-center justify-between text-muted">
                                <span>Subtotal</span>
                                <span>₹{subtotal}</span>
                            </div>
                            <div className="flex items-center justify-between text-muted">
                                <span>Delivery fee</span>
                                <span>₹{DELIVERY_FEE_PREVIEW}</span>
                            </div>
                            <div className="border-t border-border pt-2 mt-1 flex items-center justify-between text-base font-bold text-ink">
                                <span>Total</span>
                                <span>₹{estimatedTotal}</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted mt-2">
                            Taxes calculated at checkout.
                        </p>

                        <button
                            type="button"
                            onClick={() => navigate("/customer/checkout")}
                            className="mt-5 w-full h-11 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:bg-primary-hover active:scale-[0.98]"
                        >
                            Proceed to Checkout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartPage;