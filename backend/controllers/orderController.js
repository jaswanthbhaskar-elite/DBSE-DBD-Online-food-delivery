const db = require("../db");

// Same transaction helper pattern used in addressController.js and cartController.js.
function withTransaction(actions, done) {
    db.beginTransaction((beginErr) => {
        if (beginErr) return done(beginErr);

        actions((actionErr) => {
            if (actionErr) {
                return db.rollback(() => done(actionErr));
            }
            db.commit((commitErr) => {
                if (commitErr) {
                    return db.rollback(() => done(commitErr));
                }
                done(null);
            });
        });
    });
}

// Logs the FULL MySQL error server-side (code, sqlMessage, sqlState) so the
// real cause is always visible in the console during development, while the
// client only ever sees the generic message.
function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    if (err.sql) console.error("sql:       ", err.sql);
    console.error("-----------------------------------");
}

// POST /api/orders
exports.createOrder = (req, res) => {
    const customerId = req.user.user_id;
    // API request field is still "address_id" (matches the documented request
    // body) even though the DB column is delivery_address_id.
    const { address_id, delivery_fee, special_instructions } = req.body;

    if (special_instructions !== undefined) {
        // Schema has no column for this yet — accepted but not persisted.
        // Flagging via a response field rather than silently dropping it.
    }

    if (!address_id) {
        return res.status(400).json({ success: false, message: "address_id is required." });
    }

    let deliveryFee = 0;
    if (delivery_fee !== undefined) {
        deliveryFee = Number(delivery_fee);
        if (Number.isNaN(deliveryFee) || deliveryFee < 0) {
            return res.status(400).json({ success: false, message: "delivery_fee must be a non-negative number." });
        }
    }

    // 1. Confirm the address belongs to this customer.
    const addressQuery = "SELECT address_id, user_id FROM Addresses WHERE address_id = ?";
    db.query(addressQuery, [address_id], (addrErr, addrResults) => {
        if (addrErr) {
            logDbError("checking address", addrErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (addrResults.length === 0) {
            return res.status(404).json({ success: false, message: "Address not found." });
        }
        if (addrResults[0].user_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this address." });
        }

        // 2. Find the customer's cart.
        const cartQuery = "SELECT cart_id, restaurant_id FROM Cart WHERE customer_id = ?";
        db.query(cartQuery, [customerId], (cartErr, cartResults) => {
            if (cartErr) {
                logDbError("checking cart", cartErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            if (cartResults.length === 0) {
                return res.status(400).json({ success: false, message: "You have no cart. Add items before checking out." });
            }

            const cart = cartResults[0];

            // 3. Load cart items + their current menu-item data in one go.
            const cartItemsQuery = `
                SELECT ci.cart_item_id, ci.item_id, ci.quantity,
                       mi.restaurant_id, mi.price, mi.is_available
                FROM CartItems ci
                JOIN MenuItems mi ON ci.item_id = mi.item_id
                WHERE ci.cart_id = ?
            `;
            db.query(cartItemsQuery, [cart.cart_id], (itemsErr, cartItems) => {
                if (itemsErr) {
                    logDbError("loading cart items", itemsErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }

                if (cartItems.length === 0) {
                    return res.status(400).json({ success: false, message: "Your cart is empty." });
                }

                // 4. Confirm the restaurant exists and is open.
                const restaurantQuery = "SELECT restaurant_id, is_open FROM Restaurants WHERE restaurant_id = ?";
                db.query(restaurantQuery, [cart.restaurant_id], (restErr, restResults) => {
                    if (restErr) {
                        logDbError("checking restaurant", restErr);
                        return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                    }
                    if (restResults.length === 0) {
                        return res.status(404).json({ success: false, message: "Restaurant not found." });
                    }
                    if (!restResults[0].is_open) {
                        return res.status(409).json({ success: false, message: "This restaurant is currently closed." });
                    }

                    // 5. Re-validate every cart item against LIVE menu data before freezing prices.
                    for (const item of cartItems) {
                        if (String(item.restaurant_id) !== String(cart.restaurant_id)) {
                            return res.status(409).json({
                                success: false,
                                message: `Item ${item.item_id} no longer belongs to this restaurant. Clear your cart and try again.`
                            });
                        }
                        if (!item.is_available) {
                            return res.status(409).json({
                                success: false,
                                message: `Item ${item.item_id} is no longer available. Remove it from your cart and try again.`
                            });
                        }
                        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                            return res.status(400).json({
                                success: false,
                                message: `Item ${item.item_id} has an invalid quantity.`
                            });
                        }
                    }

                    // 6. Freeze prices now — this snapshot is what OrderItems will store.
                    let subtotal = 0;
                    const orderItemsData = cartItems.map((item) => {
                        const unitPrice = Number(item.price);
                        const itemSubtotal = unitPrice * item.quantity;
                        subtotal += itemSubtotal;
                        return {
                            item_id: item.item_id,
                            quantity: item.quantity,
                            unit_price: unitPrice,
                            item_subtotal: itemSubtotal
                        };
                    });

                    const discountAmount = 0; // offers not implemented yet
                    // tax_amount is NOT NULL in the schema with no default and no tax
                    // rules exist yet, so it's explicitly set to 0 rather than omitted.
                    const taxAmount = 0;
                    const totalAmount = subtotal + deliveryFee + taxAmount - discountAmount;

                    let newOrderId;

                    withTransaction((next) => {
                        const insertOrderQuery = `
                            INSERT INTO Orders
                                (customer_id, restaurant_id, delivery_address_id, subtotal, delivery_fee,
                                 discount_amount, tax_amount, total_amount, offer_id, order_status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'placed')
                        `;
                        const orderParams = [
                            customerId, cart.restaurant_id, address_id, subtotal, deliveryFee,
                            discountAmount, taxAmount, totalAmount
                        ];

                        db.query(insertOrderQuery, orderParams, (orderErr, orderResult) => {
                            if (orderErr) return next(orderErr);
                            newOrderId = orderResult.insertId;

                            const insertItemsQuery = `
                                INSERT INTO OrderItems (order_id, item_id, quantity, unit_price, item_subtotal)
                                VALUES ?
                            `;
                            const itemRows = orderItemsData.map((oi) => [
                                newOrderId, oi.item_id, oi.quantity, oi.unit_price, oi.item_subtotal
                            ]);

                            db.query(insertItemsQuery, [itemRows], (itemsInsertErr) => {
                                if (itemsInsertErr) return next(itemsInsertErr);

                                // Delete BOTH CartItems and the parent Cart
                                // row itself — matching cartController.js's
                                // clearCart(). Deleting only CartItems (as
                                // this used to do) left an orphaned, empty
                                // Cart row still pointing at this
                                // restaurant_id, which addItemToCart's
                                // different-restaurant check would then
                                // find on the customer's NEXT order from a
                                // different restaurant and incorrectly
                                // reject with 409 — even though the cart
                                // looked empty on screen, since the empty
                                // Cart row (with zero CartItems) still
                                // "existed" as far as that check was
                                // concerned.
                                db.query("DELETE FROM CartItems WHERE cart_id = ?", [cart.cart_id], (clearItemsErr) => {
                                    if (clearItemsErr) return next(clearItemsErr);

                                    db.query("DELETE FROM Cart WHERE cart_id = ?", [cart.cart_id], (clearCartErr) => {
                                        if (clearCartErr) return next(clearCartErr);
                                        next(null);
                                    });
                                });
                            });
                        });
                    }, (txErr) => {
                        if (txErr) {
                            logDbError("creating order (transaction)", txErr);
                            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                        }

                        return res.status(201).json({
                            success: true,
                            message: "Order placed successfully.",
                            order: {
                                order_id: newOrderId,
                                customer_id: customerId,
                                restaurant_id: cart.restaurant_id,
                                delivery_address_id: address_id,
                                subtotal,
                                delivery_fee: deliveryFee,
                                discount_amount: discountAmount,
                                tax_amount: taxAmount,
                                total_amount: totalAmount,
                                order_status: "placed",
                                special_instructions_received: special_instructions || null,
                                special_instructions_note: special_instructions
                                    ? "Received but not stored — Orders has no special_instructions column in the current schema."
                                    : undefined,
                                items: orderItemsData
                            }
                        });
                    });
                });
            });
        });
    });
};

// GET /api/orders
exports.getOrders = (req, res) => {
    const customerId = req.user.user_id;

    const query = `
        SELECT order_id, restaurant_id, delivery_partner_id, delivery_address_id,
               subtotal, delivery_fee, discount_amount, tax_amount, total_amount,
               order_status, placed_at, delivered_at, customer_confirmed_at
        FROM Orders
        WHERE customer_id = ?
        ORDER BY order_id DESC
    `;
    db.query(query, [customerId], (err, orders) => {
        if (err) {
            logDbError("listing orders", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        return res.status(200).json({ success: true, count: orders.length, orders });
    });
};

// GET /api/orders/:id
exports.getOrderById = (req, res) => {
    const { id } = req.params;
    const customerId = req.user.user_id;

    const orderQuery = `
        SELECT order_id, customer_id, restaurant_id, delivery_partner_id, delivery_address_id,
               offer_id, order_status, subtotal, delivery_fee, discount_amount, tax_amount,
               total_amount, placed_at, delivered_at, customer_confirmed_at
        FROM Orders
        WHERE order_id = ?
    `;
    db.query(orderQuery, [id], (err, orderResults) => {
        if (err) {
            logDbError("fetching order", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (orderResults.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (orderResults[0].customer_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this order." });
        }

        const order = orderResults[0];

        const itemsQuery = `
            SELECT oi.order_item_id, oi.item_id, oi.quantity, oi.unit_price, oi.item_subtotal,
                   mi.name, mi.image_url
            FROM OrderItems oi
            JOIN MenuItems mi ON oi.item_id = mi.item_id
            WHERE oi.order_id = ?
        `;
        db.query(itemsQuery, [id], (itemsErr, items) => {
            if (itemsErr) {
                logDbError("fetching order items", itemsErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(200).json({
                success: true,
                order,
                items
            });
        });
    });
};

// PATCH /api/orders/:id/cancel
exports.cancelOrder = (req, res) => {
    const { id } = req.params;
    const customerId = req.user.user_id;

    const findQuery = "SELECT customer_id, order_status FROM Orders WHERE order_id = ?";
    db.query(findQuery, [id], (findErr, results) => {
        if (findErr) {
            logDbError("fetching order for cancel", findErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this order." });
        }

        const currentStatus = results[0].order_status;
        if (currentStatus !== "placed" && currentStatus !== "confirmed") {
            return res.status(409).json({
                success: false,
                message: `Order cannot be cancelled while its status is '${currentStatus}'.`
            });
        }

        // Schema has no cancelled_at column, so only order_status is updated.
        const updateQuery = "UPDATE Orders SET order_status = 'cancelled' WHERE order_id = ?";
        db.query(updateQuery, [id], (updateErr) => {
            if (updateErr) {
                logDbError("cancelling order", updateErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Order cancelled successfully." });
        });
    });
};

// PATCH /api/orders/:id/confirm
// Customer acknowledges the order actually arrived. Distinct from
// order_status='delivered', which is set by the delivery partner — this
// records the customer's own confirmation as a separate fact via the
// customer_confirmed_at column, never overloading order_status for it.
exports.confirmDelivery = (req, res) => {
    const { id } = req.params;
    const customerId = req.user.user_id;

    const findQuery = "SELECT customer_id, order_status, customer_confirmed_at FROM Orders WHERE order_id = ?";
    db.query(findQuery, [id], (findErr, results) => {
        if (findErr) {
            logDbError("fetching order for delivery confirmation", findErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return res.status(403).json({ success: false, message: "You do not own this order." });
        }
        if (results[0].order_status !== "delivered") {
            return res.status(409).json({
                success: false,
                message: `Order cannot be confirmed while its status is '${results[0].order_status}'.`
            });
        }
        if (results[0].customer_confirmed_at) {
            return res.status(409).json({ success: false, message: "This order has already been confirmed." });
        }

        const updateQuery = "UPDATE Orders SET customer_confirmed_at = NOW() WHERE order_id = ?";
        db.query(updateQuery, [id], (updateErr) => {
            if (updateErr) {
                logDbError("confirming delivery", updateErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Delivery confirmed. Thank you!" });
        });
    });
};