const db = require("../db");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    console.error("-----------------------------------");
}

// Actual enum values from schema.sql — do not add/remove without a matching
// ALTER TABLE. Note: there is no 'ready' status in this schema.
const VALID_STATUSES = ["placed", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];

// Only forward transitions are allowed, one step at a time. 'cancelled' is
// intentionally not a target here — this endpoint only moves orders forward
// through fulfillment; cancellation stays on the customer-facing endpoint.
//
// The restaurant owner's role ends at 'preparing'. Both
// preparing -> out_for_delivery ("picked up") and out_for_delivery ->
// delivered are deliberately NOT included here — those are the delivery
// partner's actions alone (see deliveryController.js's
// PARTNER_TRANSITIONS), matching the documented order lifecycle: the owner
// hands the order off once it's ready, and has no way to actually know
// when a partner picks it up or when it reaches the customer.
const NEXT_STATUS = {
    placed: "confirmed",
    confirmed: "preparing"
};

// Resolves the restaurant owned by req.user.user_id.
// Restaurants.owner_id is UNIQUE, so an owner has at most one restaurant.
function getOwnedRestaurantId(ownerId, callback) {
    db.query("SELECT restaurant_id FROM Restaurants WHERE owner_id = ?", [ownerId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, null);
        }
        return callback(null, results[0].restaurant_id);
    });
}

function attachOrderItems(orders, callback) {
    if (orders.length === 0) return callback(null, orders);

    const orderIds = orders.map((o) => o.order_id);
    const itemsQuery = `
        SELECT oi.order_id, oi.order_item_id, oi.item_id, oi.quantity, oi.unit_price, oi.item_subtotal,
               mi.name
        FROM OrderItems oi
        JOIN MenuItems mi ON oi.item_id = mi.item_id
        WHERE oi.order_id IN (?)
    `;
    db.query(itemsQuery, [orderIds], (err, itemRows) => {
        if (err) return callback(err);

        const itemsByOrder = {};
        itemRows.forEach((row) => {
            if (!itemsByOrder[row.order_id]) itemsByOrder[row.order_id] = [];
            itemsByOrder[row.order_id].push({
                order_item_id: row.order_item_id,
                item_id: row.item_id,
                name: row.name,
                quantity: row.quantity,
                unit_price: row.unit_price,
                item_subtotal: row.item_subtotal
            });
        });

        orders.forEach((order) => {
            order.items = itemsByOrder[order.order_id] || [];
        });

        return callback(null, orders);
    });
}

// GET /api/restaurant/orders
// Optional ?status= filter.
exports.getRestaurantOrders = (req, res) => {
    const ownerId = req.user.user_id;
    const { status } = req.query;

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`
        });
    }

    getOwnedRestaurantId(ownerId, (ownerErr, restaurantId) => {
        if (ownerErr) {
            logDbError("resolving owned restaurant", ownerErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (!restaurantId) {
            return res.status(404).json({ success: false, message: "You do not own a restaurant." });
        }

        // delivery_partner_name/phone are display-only additions (LEFT JOIN,
        // same pattern as trackingController.js) so the owner dashboard can
        // show who an order is assigned to. This does not touch assignment
        // eligibility, validation, or the auto-assign algorithm in
        // deliveryController.js in any way.
        let query = `
            SELECT o.order_id, o.customer_id, o.restaurant_id, o.delivery_partner_id,
                   o.delivery_address_id, o.offer_id, o.order_status, o.subtotal,
                   o.delivery_fee, o.discount_amount, o.tax_amount, o.total_amount,
                   o.placed_at, o.delivered_at,
                   u.name AS customer_name, u.phone AS customer_phone,
                   a.address_line, a.city, a.state, a.pincode,
                   pu.name AS delivery_partner_name, pu.phone AS delivery_partner_phone
            FROM Orders o
            JOIN Users u ON o.customer_id = u.user_id
            JOIN Addresses a ON o.delivery_address_id = a.address_id
            LEFT JOIN DeliveryPartners dp ON o.delivery_partner_id = dp.partner_id
            LEFT JOIN Users pu ON dp.user_id = pu.user_id
            WHERE o.restaurant_id = ?
        `;
        const params = [restaurantId];

        if (status !== undefined) {
            query += " AND o.order_status = ?";
            params.push(status);
        }

        query += " ORDER BY o.placed_at DESC";

        db.query(query, params, (err, orders) => {
            if (err) {
                logDbError("listing restaurant orders", err);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            attachOrderItems(orders, (itemsErr, ordersWithItems) => {
                if (itemsErr) {
                    logDbError("attaching order items", itemsErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(200).json({ success: true, count: ordersWithItems.length, orders: ordersWithItems });
            });
        });
    });
};

// GET /api/restaurant/orders/:id
exports.getRestaurantOrderById = (req, res) => {
    const { id } = req.params;
    const ownerId = req.user.user_id;

    // Same display-only delivery_partner_name/phone addition as
    // getRestaurantOrders above — no assignment logic involved.
    const query = `
        SELECT o.order_id, o.customer_id, o.restaurant_id, o.delivery_partner_id,
               o.delivery_address_id, o.offer_id, o.order_status, o.subtotal,
               o.delivery_fee, o.discount_amount, o.tax_amount, o.total_amount,
               o.placed_at, o.delivered_at, r.owner_id,
               u.name AS customer_name, u.phone AS customer_phone,
               a.address_line, a.city, a.state, a.pincode,
               pu.name AS delivery_partner_name, pu.phone AS delivery_partner_phone
        FROM Orders o
        JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
        JOIN Users u ON o.customer_id = u.user_id
        JOIN Addresses a ON o.delivery_address_id = a.address_id
        LEFT JOIN DeliveryPartners dp ON o.delivery_partner_id = dp.partner_id
        LEFT JOIN Users pu ON dp.user_id = pu.user_id
        WHERE o.order_id = ?
    `;
    db.query(query, [id], (err, results) => {
        if (err) {
            logDbError("fetching restaurant order", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].owner_id !== ownerId) {
            return res.status(403).json({ success: false, message: "This order does not belong to your restaurant." });
        }

        const { owner_id, ...order } = results[0];

        attachOrderItems([order], (itemsErr, ordersWithItems) => {
            if (itemsErr) {
                logDbError("attaching order items", itemsErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, order: ordersWithItems[0] });
        });
    });
};

// PATCH /api/restaurant/orders/:id/status
exports.updateOrderStatus = (req, res) => {
    const { id } = req.params;
    const ownerId = req.user.user_id;
    const { status: requestedStatus } = req.body;

    if (!requestedStatus || !VALID_STATUSES.includes(requestedStatus)) {
        return res.status(400).json({
            success: false,
            message: `status is required and must be one of: ${VALID_STATUSES.join(", ")}`
        });
    }

    const findQuery = `
        SELECT o.order_status, r.owner_id
        FROM Orders o
        JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
        WHERE o.order_id = ?
    `;
    db.query(findQuery, [id], (findErr, results) => {
        if (findErr) {
            logDbError("fetching order for status update", findErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].owner_id !== ownerId) {
            return res.status(403).json({ success: false, message: "This order does not belong to your restaurant." });
        }

        const currentStatus = results[0].order_status;
        const allowedNext = NEXT_STATUS[currentStatus];

        if (!allowedNext) {
            return res.status(409).json({
                success: false,
                message: `Order is '${currentStatus}' and cannot be moved forward any further.`
            });
        }

        if (requestedStatus !== allowedNext) {
            return res.status(409).json({
                success: false,
                message: `Invalid transition from '${currentStatus}' to '${requestedStatus}'. The next allowed status is '${allowedNext}'.`
            });
        }

        // Only order_status (and delivered_at, when reaching 'delivered') is ever
        // written here. total_amount, items, customer, address, delivery_fee,
        // and delivery_partner_id are never touched by this endpoint.
        const isDelivered = requestedStatus === "delivered";
        const updateQuery = isDelivered
            ? "UPDATE Orders SET order_status = ?, delivered_at = NOW() WHERE order_id = ?"
            : "UPDATE Orders SET order_status = ? WHERE order_id = ?";

        db.query(updateQuery, [requestedStatus, id], (updateErr) => {
            if (updateErr) {
                logDbError("updating order status", updateErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({
                success: true,
                message: `Order status updated to '${requestedStatus}'.`
            });
        });
    });
};