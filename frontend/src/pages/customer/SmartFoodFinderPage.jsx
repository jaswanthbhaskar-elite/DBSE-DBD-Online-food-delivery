import { useState } from "react";
import { Link } from "react-router-dom";
import { getSmartFoodRecommendations } from "../../api/smartFoodApi";
import { addItemToCart, clearCart } from "../../api/cartApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";

const MAX_TIME_OPTIONS = [
    { label: "Any time", value: "" },
    { label: "15 mins", value: "15" },
    { label: "20 mins", value: "20" },
    { label: "30 mins", value: "30" },
    { label: "45 mins", value: "45" },
    { label: "60 mins", value: "60" },
];

const comboKey = (combo) =>
    `${combo.restaurant_id}-${combo.items.map((i) => i.item_id).join("-")}`;

const SmartFoodFinderPage = () => {
    const [budget, setBudget] = useState("");
    const [maxTime, setMaxTime] = useState("");

    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [recommendations, setRecommendations] = useState([]);

    const [cartError, setCartError] = useState(null);
    const [addingKey, setAddingKey] = useState(null);
    const [addedKey, setAddedKey] = useState(null);

    const handleSearch = async (e) => {
        e.preventDefault();

        const numericBudget = Number(budget);
        if (!budget || Number.isNaN(numericBudget) || numericBudget <= 0) {
            setSearchError("Enter a valid budget greater than ₹0.");
            return;
        }

        setLoading(true);
        setSearchError(null);
        setCartError(null);
        try {
            const data = await getSmartFoodRecommendations(numericBudget, maxTime);
            setRecommendations(data.recommendations || []);
            setSearched(true);
        } catch (err) {
            setSearchError(
                err.response?.data?.message ||
                    "Failed to fetch recommendations. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    const addComboToCart = async (combo) => {
        const key = comboKey(combo);
        setAddingKey(key);
        setCartError(null);

        const addAllItems = async () => {
            for (const item of combo.items) {
                await addItemToCart(combo.restaurant_id, item.item_id, 1);
            }
        };

        try {
            await addAllItems();
            setAddedKey(key);
            setTimeout(() => setAddedKey(null), 1500);
        } catch (err) {
            if (err.response?.status === 409) {
                const confirmed = window.confirm(
                    "Your cart contains items from another restaurant. Clear cart and add this combo instead?"
                );
                if (confirmed) {
                    try {
                        await clearCart();
                        await addAllItems();
                        setAddedKey(key);
                        setTimeout(() => setAddedKey(null), 1500);
                    } catch (retryErr) {
                        setCartError(
                            retryErr.response?.data?.message ||
                                "Failed to add this combo to your cart."
                        );
                    }
                }
            } else {
                setCartError(
                    err.response?.data?.message ||
                        "Failed to add this combo to your cart."
                );
            }
        } finally {
            setAddingKey(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <Link
                to="/customer"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to restaurants
            </Link>

            <div className="mt-3 mb-6">
                <h1 className="text-2xl font-semibold text-ink mb-1">
                    Smart Food Finder
                </h1>
                <p className="text-sm text-muted max-w-prose">
                    Tell us your budget and how soon you'd like your food, and
                    we'll put together meal combinations across restaurants
                    that fit both.
                </p>
            </div>

            <form
                onSubmit={handleSearch}
                className="bg-surface border border-border rounded-lg shadow-card p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-end mb-8"
            >
                <div className="flex-1">
                    <label className="block text-sm font-semibold text-muted mb-1">
                        Maximum budget (₹)
                    </label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 200"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
                </div>

                <div className="flex-1">
                    <label className="block text-sm font-semibold text-muted mb-1">
                        Maximum delivery time
                    </label>
                    <select
                        value={maxTime}
                        onChange={(e) => setMaxTime(e.target.value)}
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    >
                        {MAX_TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="h-10 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                >
                    {loading ? "Searching..." : "Find Combos"}
                </button>
            </form>

            {searchError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {searchError}
                </p>
            )}
            {cartError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {cartError}
                </p>
            )}

            {loading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-40 rounded-lg bg-surface border border-border animate-pulse"
                        />
                    ))}
                </div>
            ) : searched && recommendations.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted">
                        No combinations found within that budget
                        {maxTime ? ` and ${maxTime}-minute delivery limit` : ""}.
                        Try raising your budget or allowing more delivery
                        time.
                    </p>
                </div>
            ) : recommendations.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {recommendations.map((combo) => {
                        const key = comboKey(combo);
                        return (
                            <div
                                key={key}
                                className="bg-surface border border-border rounded-lg shadow-card p-4 flex flex-col transition-shadow hover:shadow-card-hover"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <h2 className="text-base font-semibold text-ink">
                                        {combo.restaurant_name}
                                    </h2>
                                    {combo.estimated_delivery_time_minutes != null && (
                                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full text-warning bg-warning-bg">
                                            ~{combo.estimated_delivery_time_minutes} min
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 mb-3">
                                    {combo.items.map((item) => (
                                        <div
                                            key={item.item_id}
                                            className="flex items-center gap-2.5 text-sm"
                                        >
                                            <div className="w-9 h-9 rounded-md overflow-hidden shrink-0">
                                                <ImageWithFallback
                                                    src={item.image_url}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                    iconClassName="w-3.5 h-3.5"
                                                />
                                            </div>
                                            <span
                                                className={`shrink-0 w-2 h-2 rounded-full border-2 ${
                                                    item.is_veg
                                                        ? "border-success"
                                                        : "border-error"
                                                }`}
                                                title={
                                                    item.is_veg
                                                        ? "Vegetarian"
                                                        : "Non-vegetarian"
                                                }
                                            />
                                            <span className="text-muted flex-1 truncate">
                                                {item.name}
                                            </span>
                                            <span className="text-ink font-medium shrink-0">
                                                ₹{item.price}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-3 mt-auto border-t border-border mb-3">
                                    <span className="text-sm font-semibold text-muted">
                                        Total
                                    </span>
                                    <span className="text-lg font-bold text-ink">
                                        ₹{combo.total_price}
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    disabled={addingKey === key}
                                    onClick={() => addComboToCart(combo)}
                                    className="h-10 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {addingKey === key
                                        ? "Adding..."
                                        : addedKey === key
                                        ? "Added to Cart ✓"
                                        : "Add Combo to Cart"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted">
                        Enter your budget above and hit "Find Combos" to see
                        recommendations.
                    </p>
                </div>
            )}
        </div>
    );
};

export default SmartFoodFinderPage;