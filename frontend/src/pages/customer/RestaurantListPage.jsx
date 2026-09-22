import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRestaurants } from "../../api/restaurantApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";
import HygieneScoreBadge from "../../components/common/HygieneScoreBadge";

const RestaurantListPage = () => {
    const navigate = useNavigate();

    const [restaurants, setRestaurants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Search/filter are frontend-only — the full restaurant list is
    // already fetched in one call, so filtering client-side avoids adding
    // any new backend query parameters for a college-demo dataset size.
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCuisine, setSelectedCuisine] = useState("");

    useEffect(() => {
        const fetchRestaurants = async () => {
            try {
                const data = await getRestaurants();
                setRestaurants(data.restaurants);
            } catch (err) {
                setError(
                    err.response?.data?.message ||
                        "Failed to load restaurants."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurants();
    }, []);

    const cuisines = useMemo(() => {
        const unique = new Set(
            restaurants
                .map((r) => r.cuisine_type)
                .filter((c) => c && c.trim().length > 0)
        );
        return Array.from(unique).sort();
    }, [restaurants]);

    const filteredRestaurants = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return restaurants.filter((restaurant) => {
            const matchesSearch =
                !term ||
                restaurant.name.toLowerCase().includes(term) ||
                (restaurant.cuisine_type || "")
                    .toLowerCase()
                    .includes(term) ||
                (restaurant.city || "").toLowerCase().includes(term);
            const matchesCuisine =
                !selectedCuisine ||
                restaurant.cuisine_type === selectedCuisine;
            return matchesSearch && matchesCuisine;
        });
    }, [restaurants, searchTerm, selectedCuisine]);

    const heroSearchClass =
        "w-full h-12 pl-11 pr-4 text-sm text-ink bg-surface border border-border rounded-md shadow-card focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15";
    const heroSelectClass =
        "w-full sm:w-56 h-12 px-4 text-sm text-ink bg-surface border border-border rounded-md shadow-card focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15";

    return (
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-8">
            {/* Hero */}
            <section className="relative overflow-hidden rounded-xl bg-primary/6 border border-primary/15 px-6 sm:px-10 py-10 sm:py-14 mb-10">
                <div className="relative max-w-xl">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-3">
                        Hyderabad's favorite kitchens, delivered
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight mb-3">
                        Delicious food, delivered to your door.
                    </h1>
                    <p className="text-muted mb-6 max-w-md">
                        Browse local restaurants, pick your favorites, and
                        track your order every step of the way.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            >
                                <circle cx="11" cy="11" r="7" />
                                <path
                                    d="M21 21l-4.3-4.3"
                                    strokeLinecap="round"
                                />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search restaurants, cuisines, or areas..."
                                value={searchTerm}
                                onChange={(e) =>
                                    setSearchTerm(e.target.value)
                                }
                                className={heroSearchClass}
                            />
                        </div>
                        {cuisines.length > 0 && (
                            <select
                                value={selectedCuisine}
                                onChange={(e) =>
                                    setSelectedCuisine(e.target.value)
                                }
                                className={heroSelectClass}
                            >
                                <option value="">All cuisines</option>
                                {cuisines.map((cuisine) => (
                                    <option key={cuisine} value={cuisine}>
                                        {cuisine}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </section>

            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-ink">
                    {searchTerm || selectedCuisine
                        ? `${filteredRestaurants.length} restaurant${
                              filteredRestaurants.length === 1 ? "" : "s"
                          } found`
                        : "All restaurants"}
                </h2>
            </div>

            {loading ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="bg-surface border border-border rounded-lg shadow-card overflow-hidden animate-pulse"
                        >
                            <div className="h-40 bg-background" />
                            <div className="p-4 flex flex-col gap-2">
                                <div className="h-4 w-2/3 bg-background rounded" />
                                <div className="h-3 w-1/3 bg-background rounded" />
                                <div className="h-9 w-full bg-background rounded-sm mt-2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            ) : restaurants.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted">
                        No restaurants are open right now. Check back soon.
                    </p>
                </div>
            ) : filteredRestaurants.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-10 text-center">
                    <p className="text-sm text-muted">
                        No restaurants match your search.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                    {filteredRestaurants.map((restaurant) => (
                        <div
                            key={restaurant.restaurant_id}
                            onClick={() =>
                                navigate(
                                    `/customer/restaurants/${restaurant.restaurant_id}`
                                )
                            }
                            className="group bg-surface border border-border rounded-lg shadow-card overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-card-hover hover:-translate-y-0.5"
                        >
                            <div className="relative h-40 overflow-hidden">
                                <ImageWithFallback
                                    src={restaurant.image_url}
                                    alt={restaurant.name}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    iconClassName="w-10 h-10"
                                />
                                <span
                                    className={`absolute top-2.5 right-2.5 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm ${
                                        restaurant.is_open
                                            ? "text-success bg-white/95"
                                            : "text-error bg-white/95"
                                    }`}
                                >
                                    {restaurant.is_open ? "Open" : "Closed"}
                                </span>
                            </div>

                            <div className="p-4 flex flex-col flex-1">
                                <h2 className="text-base font-semibold text-ink mb-1">
                                    {restaurant.name}
                                </h2>

                                {restaurant.cuisine_type && (
                                    <p className="text-sm text-muted mb-1">
                                        {restaurant.cuisine_type}
                                    </p>
                                )}

                                {restaurant.hygiene_score !== null &&
                                    restaurant.hygiene_score !== undefined && (
                                        <div className="mb-2">
                                            <HygieneScoreBadge
                                                score={restaurant.hygiene_score}
                                            />
                                        </div>
                                    )}

                                {restaurant.description && (
                                    <p className="text-sm text-muted mb-3 line-clamp-2">
                                        {restaurant.description}
                                    </p>
                                )}

                                <div className="mt-auto flex items-center justify-between pt-1">
                                    <span className="text-xs text-muted">
                                        {restaurant.city}, {restaurant.state}
                                    </span>
                                    <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            className="w-3.5 h-3.5 text-primary"
                                        >
                                            <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3 5.7 20.8l1.7-6.9L2 9.2l7.1-.6z" />
                                        </svg>
                                        {restaurant.avg_rating ?? "New"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RestaurantListPage;