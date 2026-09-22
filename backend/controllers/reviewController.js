const db = require("../db");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    console.error("-----------------------------------");
}

// Shared: loads an order, confirms it belongs to the authenticated customer,
// and confirms it's actually delivered — reviews only make sense after the
// order is complete, and this also matches RestaurantReviews/
// DeliveryPartnerReviews.order_id being UNIQUE (one review per order).
function getDeliveredOwnedOrder(orderId, customerId, callback) {
    const query = `
        SELECT order_id, customer_id, restaurant_id, delivery_partner_id, order_status
        FROM Orders
        WHERE order_id = ?
    `;
    db.query(query, [orderId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, { status: 404, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return callback(null, { status: 403, message: "You do not own this order." });
        }
        if (results[0].order_status !== "delivered") {
            return callback(null, { status: 409, message: "You can only review an order after it has been delivered." });
        }
        return callback(null, null, results[0]);
    });
}

function validateRating(rating) {
    const num = Number(rating);
    return Number.isInteger(num) && num >= 1 && num <= 5 ? num : null;
}

// GET /api/reviews/order/:orderId
// Lets the frontend know whether this order already has reviews, so it can
// show "already reviewed" instead of the form. Doesn't require the order to
// be delivered — just owned by the caller.
exports.getOrderReviews = (req, res) => {
    const { orderId } = req.params;
    const customerId = req.user.user_id;

    db.query("SELECT customer_id FROM Orders WHERE order_id = ?", [orderId], (err, results) => {
        if (err) {
            logDbError("fetching order for review lookup", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this order." });
        }

        db.query(
            "SELECT review_id, rating, comment, created_at FROM RestaurantReviews WHERE order_id = ?",
            [orderId],
            (rErr, restaurantRows) => {
                if (rErr) {
                    logDbError("fetching restaurant review", rErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }

                db.query(
                    "SELECT review_id, rating, comment, created_at FROM DeliveryPartnerReviews WHERE order_id = ?",
                    [orderId],
                    (dErr, partnerRows) => {
                        if (dErr) {
                            logDbError("fetching delivery partner review", dErr);
                            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                        }

                        return res.status(200).json({
                            success: true,
                            restaurant_review: restaurantRows[0] || null,
                            delivery_partner_review: partnerRows[0] || null,
                        });
                    }
                );
            }
        );
    });
};

// POST /api/reviews/restaurant   body: { order_id, rating, comment }
exports.createRestaurantReview = (req, res) => {
    const customerId = req.user.user_id;
    const { order_id, rating, comment } = req.body;

    if (!order_id || rating === undefined) {
        return res.status(400).json({ success: false, message: "order_id and rating are required." });
    }
    const numRating = validateRating(rating);
    if (numRating === null) {
        return res.status(400).json({ success: false, message: "rating must be an integer between 1 and 5." });
    }

    getDeliveredOwnedOrder(order_id, customerId, (err, blocked, order) => {
        if (err) {
            logDbError("fetching order for restaurant review", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const insertQuery = `
            INSERT INTO RestaurantReviews (order_id, customer_id, restaurant_id, rating, comment)
            VALUES (?, ?, ?, ?, ?)
        `;
        db.query(insertQuery, [order_id, customerId, order.restaurant_id, numRating, comment || null], (insertErr, result) => {
            if (insertErr) {
                if (insertErr.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({ success: false, message: "You have already reviewed this order's restaurant." });
                }
                logDbError("inserting restaurant review", insertErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            // Recompute the restaurant's average rating from all its reviews.
            // Not fatal if this fails — the review itself already saved.
            const avgQuery = `
                UPDATE Restaurants
                SET avg_rating = (SELECT ROUND(AVG(rating), 2) FROM RestaurantReviews WHERE restaurant_id = ?)
                WHERE restaurant_id = ?
            `;
            db.query(avgQuery, [order.restaurant_id, order.restaurant_id], (avgErr) => {
                if (avgErr) logDbError("updating restaurant avg_rating", avgErr);

                return res.status(201).json({
                    success: true,
                    message: "Review submitted.",
                    review: { review_id: result.insertId, order_id, rating: numRating, comment: comment || null },
                });
            });
        });
    });
};

// POST /api/reviews/delivery-partner   body: { order_id, rating, comment }
exports.createDeliveryPartnerReview = (req, res) => {
    const customerId = req.user.user_id;
    const { order_id, rating, comment } = req.body;

    if (!order_id || rating === undefined) {
        return res.status(400).json({ success: false, message: "order_id and rating are required." });
    }
    const numRating = validateRating(rating);
    if (numRating === null) {
        return res.status(400).json({ success: false, message: "rating must be an integer between 1 and 5." });
    }

    getDeliveredOwnedOrder(order_id, customerId, (err, blocked, order) => {
        if (err) {
            logDbError("fetching order for delivery partner review", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }
        if (!order.delivery_partner_id) {
            return res.status(400).json({ success: false, message: "This order has no delivery partner to review." });
        }

        const insertQuery = `
            INSERT INTO DeliveryPartnerReviews (order_id, customer_id, partner_id, rating, comment)
            VALUES (?, ?, ?, ?, ?)
        `;
        db.query(insertQuery, [order_id, customerId, order.delivery_partner_id, numRating, comment || null], (insertErr, result) => {
            if (insertErr) {
                if (insertErr.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({ success: false, message: "You have already reviewed this order's delivery partner." });
                }
                logDbError("inserting delivery partner review", insertErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            const avgQuery = `
                UPDATE DeliveryPartners
                SET avg_rating = (SELECT ROUND(AVG(rating), 2) FROM DeliveryPartnerReviews WHERE partner_id = ?)
                WHERE partner_id = ?
            `;
            db.query(avgQuery, [order.delivery_partner_id, order.delivery_partner_id], (avgErr) => {
                if (avgErr) logDbError("updating delivery partner avg_rating", avgErr);

                return res.status(201).json({
                    success: true,
                    message: "Review submitted.",
                    review: { review_id: result.insertId, order_id, rating: numRating, comment: comment || null },
                });
            });
        });
    });
};