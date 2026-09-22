const db = require("../db");

// POST /api/restaurants
// Only restaurant_owner (enforced by route middleware). owner_id always comes
// from the JWT (req.user.user_id) — the request body's owner_id, if any, is ignored.
exports.createRestaurant = (req, res) => {
    const {
        name,
        description,
        cuisine_type,
        address_line,
        city,
        state,
        pincode,
        latitude,
        longitude,
        phone,
        image_url
    } = req.body;

    if (!name || !address_line || !city || !state || !pincode || !phone) {
        return res.status(400).json({
            success: false,
            message: "name, address_line, city, state, pincode, and phone are required."
        });
    }

    const owner_id = req.user.user_id; // never trust a client-supplied owner_id

    const insertQuery = `
        INSERT INTO Restaurants
            (owner_id, name, description, cuisine_type, address_line, city, state, pincode, latitude, longitude, phone, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        owner_id,
        name,
        description || null,
        cuisine_type || null,
        address_line,
        city,
        state,
        pincode,
        latitude || null,
        longitude || null,
        phone,
        image_url || null
    ];

    db.query(insertQuery, params, (err, result) => {
        if (err) {
            console.error("Database error while creating restaurant:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Restaurant created successfully.",
            restaurant: {
                restaurant_id: result.insertId,
                owner_id,
                name,
                description: description || null,
                cuisine_type: cuisine_type || null,
                address_line,
                city,
                state,
                pincode,
                latitude: latitude || null,
                longitude: longitude || null,
                phone,
                image_url: image_url || null
            }
        });
    });
};

// GET /api/restaurants
// Public listing — open restaurants only.
exports.getRestaurants = (req, res) => {
    const query = `
        SELECT restaurant_id, owner_id, name, description, cuisine_type,
               address_line, city, state, pincode, latitude, longitude,
               phone, is_open, avg_rating, image_url, avg_delivery_time_minutes, hygiene_score, created_at
        FROM Restaurants
        WHERE is_open = TRUE
        ORDER BY created_at DESC
    `;

    db.query(query, (err, restaurants) => {
        if (err) {
            console.error("Database error while listing restaurants:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        return res.status(200).json({
            success: true,
            count: restaurants.length,
            restaurants
        });
    });
};

// GET /api/restaurants/:id
// Public — returns one restaurant regardless of open/closed status.
exports.getRestaurantById = (req, res) => {
    const { id } = req.params;

    const query = `
        SELECT restaurant_id, owner_id, name, description, cuisine_type,
               address_line, city, state, pincode, latitude, longitude,
               phone, commission_rate, is_open, avg_rating, image_url, avg_delivery_time_minutes, hygiene_score, created_at
        FROM Restaurants
        WHERE restaurant_id = ?
    `;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error("Database error while fetching restaurant:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Restaurant not found."
            });
        }

        return res.status(200).json({
            success: true,
            restaurant: results[0]
        });
    });
};

// PUT /api/restaurants/:id
// Only the owner of THIS restaurant can update it. Ownership is verified
// against the database (Restaurants.owner_id), never assumed from the URL.
// owner_id itself can never be changed through this endpoint.
exports.updateRestaurant = (req, res) => {
    const { id } = req.params;

    const findQuery = "SELECT owner_id FROM Restaurants WHERE restaurant_id = ?";
    db.query(findQuery, [id], (findErr, results) => {
        if (findErr) {
            console.error("Database error while checking restaurant ownership:", findErr.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Restaurant not found."
            });
        }

        if (results[0].owner_id !== req.user.user_id) {
            return res.status(403).json({
                success: false,
                message: "You do not own this restaurant."
            });
        }

        // Only these fields may be updated. owner_id, commission_rate, and
        // hygiene_score are deliberately excluded — all three are
        // admin/inspector-controlled, not something a restaurant owner
        // should be able to set on their own listing (a self-assignable
        // food safety score would defeat its entire purpose).
        const allowedFields = [
            "name", "description", "cuisine_type", "address_line",
            "city", "state", "pincode", "latitude", "longitude",
            "phone", "is_open", "image_url", "avg_delivery_time_minutes"
        ];

        const updates = [];
        const values = [];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided to update."
            });
        }

        values.push(id);
        const updateQuery = `UPDATE Restaurants SET ${updates.join(", ")} WHERE restaurant_id = ?`;

        db.query(updateQuery, values, (updateErr) => {
            if (updateErr) {
                console.error("Database error while updating restaurant:", updateErr.message);
                return res.status(500).json({
                    success: false,
                    message: "Database error. Please try again later."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Restaurant updated successfully."
            });
        });
    });
};

// GET /api/restaurants/mine
// Returns the restaurant owned by the authenticated restaurant_owner.
// Restaurants.owner_id is UNIQUE, so there is at most one match.
exports.getMyRestaurant = (req, res) => {
    const ownerId = req.user.user_id;

    const query = `
        SELECT restaurant_id, owner_id, name, description, cuisine_type,
               address_line, city, state, pincode, latitude, longitude,
               phone, commission_rate, is_open, avg_rating, image_url, avg_delivery_time_minutes, hygiene_score, created_at
        FROM Restaurants
        WHERE owner_id = ?
    `;

    db.query(query, [ownerId], (err, results) => {
        if (err) {
            console.error("Database error while fetching own restaurant:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "You do not have a restaurant yet. Create one first."
            });
        }

        return res.status(200).json({
            success: true,
            restaurant: results[0]
        });
    });
};