const db = require("../db");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    console.error("-----------------------------------");
}

// GET /api/tracking/orders/:orderId  (customer only)
exports.getOrderTracking = (req, res) => {
    const { orderId } = req.params;
    const customerId = req.user.user_id;

    const query = `
        SELECT o.order_id, o.customer_id, o.order_status, o.delivery_partner_id,
               r.latitude AS restaurant_latitude, r.longitude AS restaurant_longitude,
               a.latitude AS delivery_latitude, a.longitude AS delivery_longitude,
               dp.current_latitude AS delivery_partner_latitude,
               dp.current_longitude AS delivery_partner_longitude,
               dp.vehicle_type AS delivery_partner_vehicle_type,
               dp.avg_rating AS delivery_partner_rating,
               pu.name AS delivery_partner_name,
               pu.phone AS delivery_partner_phone
        FROM Orders o
        JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
        JOIN Addresses a ON o.delivery_address_id = a.address_id
        LEFT JOIN DeliveryPartners dp ON o.delivery_partner_id = dp.partner_id
        LEFT JOIN Users pu ON dp.user_id = pu.user_id
        WHERE o.order_id = ?
    `;

    db.query(query, [orderId], (err, results) => {
        if (err) {
            logDbError("fetching order tracking info", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this order." });
        }

        const row = results[0];
        return res.status(200).json({
            success: true,
            tracking: {
                order_id: row.order_id,
                order_status: row.order_status,
                delivery_partner_id: row.delivery_partner_id,
                restaurant_latitude: row.restaurant_latitude,
                restaurant_longitude: row.restaurant_longitude,
                delivery_latitude: row.delivery_latitude,
                delivery_longitude: row.delivery_longitude,
                delivery_partner_latitude: row.delivery_partner_latitude,
                delivery_partner_longitude: row.delivery_partner_longitude,
                delivery_partner_name: row.delivery_partner_name,
                delivery_partner_phone: row.delivery_partner_phone,
                delivery_partner_vehicle_type: row.delivery_partner_vehicle_type,
                delivery_partner_rating: row.delivery_partner_rating
            }
        });
    });
};