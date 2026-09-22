import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getRestaurantById } from "../../api/restaurantApi";
import { getCategories, getMenuItems } from "../../api/menuApi";
import { addItemToCart, clearCart } from "../../api/cartApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";
import HygieneScoreBadge from "../../components/common/HygieneScoreBadge";

const RestaurantMenuPage = () => {
    const { restaurantId } = useParams();

    const [restaurant, setRestaurant] = useState(null);
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            setError(null);
            try {
                const [restaurantData, categoriesData, itemsData] =
                    await Promise.all([
                        getRestaurantById(restaurantId),
                        getCategories(restaurantId),
                        getMenuItems(restaurantId),
                    ]);
                setRestaurant(restaurantData.restaurant);
                setCategories(categoriesData.categories);
                setItems(itemsData.items);
            } catch (err) {
                setError(
                    err.response?.data?.message ||
                        "Failed to load this restaurant's menu."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [restaurantId]);

    const [addingItemId, setAddingItemId] = useState(null);
    const [addedItemId, setAddedItemId] = useState(null);
    const [cartError, setCartError] = useState(null);

    const addToCart = async (item) => {
        setAddingItemId(item.item_id);
        setCartError(null);
        try {
            await addItemToCart(restaurantId, item.item_id, 1);
            setAddedItemId(item.item_id);
            setTimeout(() => setAddedItemId(null), 1500);
        } catch (err) {
            if (err.response?.status === 409) {
                const confirmed = window.confirm(
                    "Your cart contains items from another restaurant. Clear cart and add this item?"
                );
                if (confirmed) {
                    try {
                        await clearCart();
                        await addItemToCart(restaurantId, item.item_id, 1);
                        setAddedItemId(item.item_id);
                        setTimeout(() => setAddedItemId(null), 1500);
                    } catch (retryErr) {
                        setCartError(
                            retryErr.response?.data?.message ||
                                "Failed to add item to cart."
                        );
                    }
                }
            } else {
                setCartError(
                    err.response?.data?.message ||
                        "Failed to add item to cart."
                );
            }
        } finally {
            setAddingItemId(null);
        }
    };

    if (loading) {
        return (
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
                <div className="h-56 rounded-xl bg-surface border border-border animate-pulse mb-6" />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-64 rounded-lg bg-surface border border-border animate-pulse"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    // Group items by category so each category renders as its own section.
    // Items with no category (or a category that doesn't exist in the
    // categories list) fall under "Other".
    const itemsByCategory = {};
    items.forEach((item) => {
        const key = item.category_id || "uncategorized";
        if (!itemsByCategory[key]) itemsByCategory[key] = [];
        itemsByCategory[key].push(item);
    });

    const categorySections = [
        ...categories.map((category) => ({
            key: category.category_id,
            name: category.name,
            items: itemsByCategory[category.category_id] || [],
        })),
        ...(itemsByCategory["uncategorized"]
            ? [
                  {
                      key: "uncategorized",
                      name: "Other",
                      items: itemsByCategory["uncategorized"],
                  },
              ]
            : []),
    ].filter((section) => section.items.length > 0);

    return (
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
            <Link
                to="/customer"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to restaurants
            </Link>

            {cartError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mt-3">
                    {cartError}
                </p>
            )}

            {/* Banner */}
            <div className="relative h-48 sm:h-64 rounded-xl overflow-hidden mt-3 mb-6">
                <ImageWithFallback
                    src={restaurant.image_url}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                    iconClassName="w-12 h-12"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white">
                                {restaurant.name}
                            </h1>
                            {restaurant.cuisine_type && (
                                <p className="text-sm text-white/85 mt-1">
                                    {restaurant.cuisine_type}
                                </p>
                            )}
                        </div>
                        <span
                            className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                                restaurant.is_open
                                    ? "text-success bg-white/95"
                                    : "text-error bg-white/95"
                            }`}
                        >
                            {restaurant.is_open ? "Open" : "Closed"}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-sm text-muted">
                <span className="flex items-center gap-1 font-semibold text-ink">
                    <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-3.5 h-3.5 text-primary"
                    >
                        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3 5.7 20.8l1.7-6.9L2 9.2l7.1-.6z" />
                    </svg>
                    {restaurant.avg_rating ?? "New"}
                </span>
                <span>
                    {restaurant.city}, {restaurant.state}
                </span>
            </div>

            {restaurant.hygiene_score !== null &&
                restaurant.hygiene_score !== undefined && (
                    <div className="mb-3">
                        <HygieneScoreBadge
                            score={restaurant.hygiene_score}
                            variant="detailed"
                        />
                    </div>
                )}

            {restaurant.description && (
                <p className="text-sm text-muted max-w-prose mb-2">
                    {restaurant.description}
                </p>
            )}
            <p className="text-xs text-muted mb-8">
                {restaurant.address_line}, {restaurant.city},{" "}
                {restaurant.state} - {restaurant.pincode}
            </p>

            {categorySections.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted">
                        This restaurant hasn't added any menu items yet.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {categorySections.map((section) => (
                        <section key={section.key}>
                            <h2 className="text-lg font-semibold text-ink mb-3 pb-2 border-b border-border">
                                {section.name}
                            </h2>

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                                {section.items.map((item) => (
                                    <div
                                        key={item.item_id}
                                        className={`bg-surface border border-border rounded-lg shadow-card overflow-hidden flex flex-col transition-shadow ${
                                            item.is_available
                                                ? "hover:shadow-card-hover"
                                                : "opacity-60"
                                        }`}
                                    >
                                        <div className="h-36 shrink-0">
                                            <ImageWithFallback
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                                iconClassName="w-8 h-8"
                                            />
                                        </div>

                                        <div className="p-4 flex flex-col flex-1">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h3 className="text-base font-semibold text-ink">
                                                    {item.name}
                                                </h3>
                                                <span
                                                    className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full border-2 ${
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
                                            </div>

                                            {item.description && (
                                                <p className="text-sm text-muted mb-2 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}

                                            <p className="text-base font-bold text-ink mb-3 mt-auto">
                                                ₹{item.price}
                                            </p>

                                            {item.is_available ? (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        addingItemId ===
                                                        item.item_id
                                                    }
                                                    onClick={() =>
                                                        addToCart(item)
                                                    }
                                                    className="h-10 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {addingItemId ===
                                                    item.item_id
                                                        ? "Adding..."
                                                        : addedItemId ===
                                                          item.item_id
                                                        ? "Added ✓"
                                                        : "Add to Cart"}
                                                </button>
                                            ) : (
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                                    Currently unavailable
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RestaurantMenuPage;