const db = require("../db");

// Small reusable helper: confirms the restaurant exists and is owned by
// req.user.user_id. Calls back with (err, statusCodeIfBlocked, message).
function verifyRestaurantOwnership(restaurantId, userId, callback) {
    const query = "SELECT owner_id FROM Restaurants WHERE restaurant_id = ?";
    db.query(query, [restaurantId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, { status: 404, message: "Restaurant not found." });
        }
        if (results[0].owner_id !== userId) {
            return callback(null, { status: 403, message: "You do not own this restaurant." });
        }
        return callback(null, null); // ownership confirmed
    });
}

// ---------- MENU CATEGORIES ----------

// POST /api/restaurants/:restaurantId/categories
exports.createCategory = (req, res) => {
    const { restaurantId } = req.params;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Category name is required."
        });
    }

    verifyRestaurantOwnership(restaurantId, req.user.user_id, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const insertQuery = "INSERT INTO MenuCategories (restaurant_id, name) VALUES (?, ?)";
        db.query(insertQuery, [restaurantId, name], (insertErr, result) => {
            if (insertErr) {
                console.error("Database error while creating category:", insertErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(201).json({
                success: true,
                message: "Category created successfully.",
                category: {
                    category_id: result.insertId,
                    restaurant_id: Number(restaurantId),
                    name
                }
            });
        });
    });
};

// GET /api/restaurants/:restaurantId/categories
// Public — no auth required.
exports.getCategories = (req, res) => {
    const { restaurantId } = req.params;

    const query = "SELECT category_id, restaurant_id, name FROM MenuCategories WHERE restaurant_id = ?";
    db.query(query, [restaurantId], (err, categories) => {
        if (err) {
            console.error("Database error while fetching categories:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        return res.status(200).json({
            success: true,
            count: categories.length,
            categories
        });
    });
};

// ---------- MENU ITEMS ----------

// POST /api/restaurants/:restaurantId/items
exports.createMenuItem = (req, res) => {
    const { restaurantId } = req.params;
    const { category_id, name, description, price, is_veg, image_url } = req.body;

    if (!name || price === undefined) {
        return res.status(400).json({
            success: false,
            message: "name and price are required."
        });
    }

    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({
            success: false,
            message: "price must be a positive number."
        });
    }

    verifyRestaurantOwnership(restaurantId, req.user.user_id, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        // If a category_id was supplied, confirm it actually belongs to this restaurant
        // (prevents attaching an item to another restaurant's category).
        const proceedToInsert = () => {
            const insertQuery = `
                INSERT INTO MenuItems (restaurant_id, category_id, name, description, price, is_veg, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                restaurantId,
                category_id || null,
                name,
                description || null,
                numericPrice,
                is_veg === undefined ? false : Boolean(is_veg),
                image_url || null
            ];

            db.query(insertQuery, params, (insertErr, result) => {
                if (insertErr) {
                    console.error("Database error while creating menu item:", insertErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }

                return res.status(201).json({
                    success: true,
                    message: "Menu item created successfully.",
                    item: {
                        item_id: result.insertId,
                        restaurant_id: Number(restaurantId),
                        category_id: category_id || null,
                        name,
                        description: description || null,
                        price: numericPrice,
                        is_veg: is_veg === undefined ? false : Boolean(is_veg),
                        is_available: true,
                        image_url: image_url || null
                    }
                });
            });
        };

        if (category_id) {
            const checkCategoryQuery = "SELECT restaurant_id FROM MenuCategories WHERE category_id = ?";
            db.query(checkCategoryQuery, [category_id], (catErr, catResults) => {
                if (catErr) {
                    console.error("Database error while checking category:", catErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                if (catResults.length === 0) {
                    return res.status(400).json({ success: false, message: "category_id does not exist." });
                }
                if (String(catResults[0].restaurant_id) !== String(restaurantId)) {
                    return res.status(400).json({ success: false, message: "category_id does not belong to this restaurant." });
                }
                proceedToInsert();
            });
        } else {
            proceedToInsert();
        }
    });
};

// GET /api/restaurants/:restaurantId/items
// Public — no auth required.
exports.getMenuItems = (req, res) => {
    const { restaurantId } = req.params;

    const query = `
        SELECT item_id, restaurant_id, category_id, name, description,
               price, is_veg, is_available, image_url
        FROM MenuItems
        WHERE restaurant_id = ?
    `;
    db.query(query, [restaurantId], (err, items) => {
        if (err) {
            console.error("Database error while fetching menu items:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        return res.status(200).json({
            success: true,
            count: items.length,
            items
        });
    });
};

// Shared helper for PUT/PATCH on a single item: confirms the item exists AND
// that its parent restaurant is owned by req.user.user_id.
function verifyItemOwnership(itemId, userId, callback) {
    const query = `
        SELECT mi.item_id, mi.restaurant_id, r.owner_id
        FROM MenuItems mi
        JOIN Restaurants r ON mi.restaurant_id = r.restaurant_id
        WHERE mi.item_id = ?
    `;
    db.query(query, [itemId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, { status: 404, message: "Menu item not found." });
        }
        if (results[0].owner_id !== userId) {
            return callback(null, { status: 403, message: "You do not own this menu item." });
        }
        return callback(null, null);
    });
}

// PUT /api/menu-items/:id
exports.updateMenuItem = (req, res) => {
    const { id } = req.params;

    verifyItemOwnership(id, req.user.user_id, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying item ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const allowedFields = ["category_id", "name", "description", "price", "is_veg", "image_url"];
        const updates = [];
        const values = [];

        if (req.body.price !== undefined) {
            const numericPrice = Number(req.body.price);
            if (Number.isNaN(numericPrice) || numericPrice <= 0) {
                return res.status(400).json({ success: false, message: "price must be a positive number." });
            }
        }

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields provided to update." });
        }

        values.push(id);
        const updateQuery = `UPDATE MenuItems SET ${updates.join(", ")} WHERE item_id = ?`;

        db.query(updateQuery, values, (updateErr) => {
            if (updateErr) {
                console.error("Database error while updating menu item:", updateErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(200).json({
                success: true,
                message: "Menu item updated successfully."
            });
        });
    });
};

// PATCH /api/menu-items/:id/availability
exports.updateAvailability = (req, res) => {
    const { id } = req.params;
    const { is_available } = req.body;

    if (typeof is_available !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "is_available must be true or false."
        });
    }

    verifyItemOwnership(id, req.user.user_id, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying item ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const updateQuery = "UPDATE MenuItems SET is_available = ? WHERE item_id = ?";
        db.query(updateQuery, [is_available, id], (updateErr) => {
            if (updateErr) {
                console.error("Database error while updating availability:", updateErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(200).json({
                success: true,
                message: `Menu item availability set to ${is_available}.`
            });
        });
    });
};