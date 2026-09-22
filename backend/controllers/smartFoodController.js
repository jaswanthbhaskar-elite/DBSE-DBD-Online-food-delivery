const db = require("../db");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    console.error("-----------------------------------");
}

// Tuning constants for the recommendation engine. Kept small and fixed for
// a college-project-scale dataset (a handful of restaurants, a handful of
// items each) — no need for these to be configurable via the API.
const MAX_COMBO_SIZE = 3; // e.g. main + side + drink, not an exhaustive powerset
const MAX_COMBOS_PER_RESTAURANT = 2; // keep variety across restaurants
const MAX_TOTAL_RESULTS = 15;

// ---------------------------------------------------------------------
// Pure combination-generation logic — no DB access, no req/res. Exported
// separately (see bottom of file) so it can be unit-tested in isolation
// from the database.
// ---------------------------------------------------------------------

// Generates every non-empty combination (up to maxSize items) of `items`
// whose total price is <= budget. Items are sorted by price ascending
// first, which enables a real pruning optimization: once adding the
// current item would push the running total over budget, every later item
// in this loop (all more expensive, since the list is sorted) would also
// overflow it, so the loop can `break` immediately instead of just
// skipping that one item and continuing to check the rest. This keeps the
// search fast without ever generating and then discarding the full
// powerset.
function generateCombinationsWithinBudget(items, budget, maxSize = MAX_COMBO_SIZE) {
    const sorted = [...items].sort((a, b) => a.price - b.price);
    const combos = [];

    function backtrack(startIndex, currentItems, currentTotal) {
        if (currentItems.length > 0) {
            combos.push({
                items: [...currentItems],
                total: Math.round(currentTotal * 100) / 100,
            });
        }
        if (currentItems.length >= maxSize) return;

        for (let i = startIndex; i < sorted.length; i += 1) {
            const candidate = sorted[i];
            const newTotal = currentTotal + Number(candidate.price);
            if (newTotal > budget) break; // pruning — see comment above
            currentItems.push(candidate);
            backtrack(i + 1, currentItems, newTotal);
            currentItems.pop();
        }
    }

    backtrack(0, [], 0);
    return combos;
}

// Ranks combos by how much of the budget they use (higher total = better
// value, without ever exceeding budget — generateCombinationsWithinBudget
// already guarantees that), with item count as a tiebreaker so a fuller
// combo wins a tie over a single expensive item.
function rankCombosByBudgetUsage(combos) {
    return [...combos].sort(
        (a, b) => b.total - a.total || b.items.length - a.items.length
    );
}

// ---------------------------------------------------------------------
// GET /api/smart-food?budget=200&maxTime=30
// Public — no auth required, matching getRestaurants/getMenuItems (both
// public reads). maxTime is optional; when omitted, delivery time isn't
// filtered on at all.
// ---------------------------------------------------------------------
exports.getSmartFoodRecommendations = (req, res) => {
    const { budget, maxTime } = req.query;

    // 1. Validate input.
    const numericBudget = Number(budget);
    if (
        budget === undefined ||
        budget === "" ||
        Number.isNaN(numericBudget) ||
        numericBudget <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "budget is required and must be a positive number.",
        });
    }

    let numericMaxTime = null;
    if (maxTime !== undefined && maxTime !== "") {
        numericMaxTime = Number(maxTime);
        if (Number.isNaN(numericMaxTime) || numericMaxTime <= 0) {
            return res.status(400).json({
                success: false,
                message: "maxTime must be a positive number of minutes when provided.",
            });
        }
    }

    // 2. Retrieve open restaurants from MySQL, filtering by estimated
    // delivery time directly in SQL when a limit was requested. A
    // restaurant with no avg_delivery_time_minutes set is excluded in that
    // case — there's no way to confirm it meets the limit, so it's left
    // out rather than guessed at.
    let restaurantQuery = `
        SELECT restaurant_id, name, avg_delivery_time_minutes
        FROM Restaurants
        WHERE is_open = TRUE
    `;
    const restaurantParams = [];
    if (numericMaxTime !== null) {
        restaurantQuery +=
            " AND avg_delivery_time_minutes IS NOT NULL AND avg_delivery_time_minutes <= ?";
        restaurantParams.push(numericMaxTime);
    }

    db.query(restaurantQuery, restaurantParams, (restaurantErr, restaurants) => {
        if (restaurantErr) {
            logDbError("fetching restaurants for smart food finder", restaurantErr);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later.",
            });
        }

        if (restaurants.length === 0) {
            return res.status(200).json({
                success: true,
                budget: numericBudget,
                max_delivery_time_minutes: numericMaxTime,
                count: 0,
                recommendations: [],
            });
        }

        // 3. Retrieve available menu items for those restaurants. The
        // price <= budget clause here is only a cheap SQL-side pre-filter
        // (an item pricier than the whole budget can't be part of ANY
        // valid combination) — it does not generate combinations itself.
        const restaurantIds = restaurants.map((r) => r.restaurant_id);
        const itemsQuery = `
            SELECT item_id, restaurant_id, name, price, is_veg, image_url
            FROM MenuItems
            WHERE restaurant_id IN (?) AND is_available = TRUE AND price <= ?
        `;

        db.query(itemsQuery, [restaurantIds, numericBudget], (itemsErr, items) => {
            if (itemsErr) {
                logDbError("fetching menu items for smart food finder", itemsErr);
                return res.status(500).json({
                    success: false,
                    message: "Database error. Please try again later.",
                });
            }

            const itemsByRestaurant = {};
            items.forEach((item) => {
                if (!itemsByRestaurant[item.restaurant_id]) {
                    itemsByRestaurant[item.restaurant_id] = [];
                }
                itemsByRestaurant[item.restaurant_id].push({
                    item_id: item.item_id,
                    name: item.name,
                    price: Number(item.price),
                    is_veg: !!item.is_veg,
                    image_url: item.image_url,
                });
            });

            // 4 & 5. Generate valid combinations per restaurant and return
            // them as JSON.
            let recommendations = [];

            restaurants.forEach((restaurant) => {
                const restaurantItems =
                    itemsByRestaurant[restaurant.restaurant_id] || [];
                if (restaurantItems.length === 0) return;

                const combos = generateCombinationsWithinBudget(
                    restaurantItems,
                    numericBudget,
                    MAX_COMBO_SIZE
                );
                const bestCombos = rankCombosByBudgetUsage(combos).slice(
                    0,
                    MAX_COMBOS_PER_RESTAURANT
                );

                bestCombos.forEach((combo) => {
                    recommendations.push({
                        restaurant_id: restaurant.restaurant_id,
                        restaurant_name: restaurant.name,
                        estimated_delivery_time_minutes:
                            restaurant.avg_delivery_time_minutes,
                        items: combo.items,
                        total_price: combo.total,
                    });
                });
            });

            recommendations.sort(
                (a, b) =>
                    b.total_price - a.total_price ||
                    b.items.length - a.items.length
            );
            recommendations = recommendations.slice(0, MAX_TOTAL_RESULTS);

            return res.status(200).json({
                success: true,
                budget: numericBudget,
                max_delivery_time_minutes: numericMaxTime,
                count: recommendations.length,
                recommendations,
            });
        });
    });
};

// Exported for unit testing — pure functions, no DB access.
exports._internal = {
    generateCombinationsWithinBudget,
    rankCombosByBudgetUsage,
};