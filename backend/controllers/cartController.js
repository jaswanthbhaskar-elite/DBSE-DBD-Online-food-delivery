const db = require("../db");

// Same transaction helper pattern used in addressController.js.
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

// GET /api/cart
exports.getCart = (req, res) => {
    const customerId = req.user.user_id;

    const cartQuery = `
        SELECT c.cart_id, c.restaurant_id, c.created_at, c.updated_at,
               r.name AS restaurant_name, r.city, r.state, r.is_open
        FROM Cart c
        JOIN Restaurants r ON c.restaurant_id = r.restaurant_id
        WHERE c.customer_id = ?
    `;

    db.query(cartQuery, [customerId], (err, cartResults) => {
        if (err) {
            console.error("Database error while fetching cart:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        if (cartResults.length === 0) {
            return res.status(200).json({
                success: true,
                cart: null,
                items: [],
                subtotal: 0
            });
        }

        const cart = cartResults[0];

        const itemsQuery = `
            SELECT ci.cart_item_id, ci.item_id, ci.quantity,
                   mi.name, mi.price, mi.is_veg, mi.is_available, mi.image_url
            FROM CartItems ci
            JOIN MenuItems mi ON ci.item_id = mi.item_id
            WHERE ci.cart_id = ?
            ORDER BY ci.cart_item_id ASC
        `;

        db.query(itemsQuery, [cart.cart_id], (itemsErr, itemRows) => {
            if (itemsErr) {
                console.error("Database error while fetching cart items:", itemsErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            let subtotal = 0;
            const items = itemRows.map((row) => {
                const itemSubtotal = Number(row.price) * row.quantity;
                subtotal += itemSubtotal;
                return {
                    cart_item_id: row.cart_item_id,
                    item_id: row.item_id,
                    name: row.name,
                    price: Number(row.price),
                    is_veg: !!row.is_veg,
                    is_available: !!row.is_available,
                    image_url: row.image_url,
                    quantity: row.quantity,
                    item_subtotal: itemSubtotal
                };
            });

            return res.status(200).json({
                success: true,
                cart: {
                    cart_id: cart.cart_id,
                    restaurant_id: cart.restaurant_id,
                    restaurant_name: cart.restaurant_name,
                    restaurant_city: cart.city,
                    restaurant_state: cart.state,
                    restaurant_is_open: !!cart.is_open,
                    created_at: cart.created_at,
                    updated_at: cart.updated_at
                },
                items,
                subtotal
            });
        });
    });
};

// POST /api/cart/items
exports.addItemToCart = (req, res) => {
    const { restaurant_id, item_id, quantity } = req.body;
    const customerId = req.user.user_id;

    if (!restaurant_id || !item_id || quantity === undefined) {
        return res.status(400).json({
            success: false,
            message: "restaurant_id, item_id, and quantity are required."
        });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "quantity must be a positive integer."
        });
    }

    // Confirm the menu item exists, belongs to the given restaurant, and is available.
    const itemQuery = `
        SELECT item_id, restaurant_id, is_available
        FROM MenuItems
        WHERE item_id = ?
    `;
    db.query(itemQuery, [item_id], (itemErr, itemResults) => {
        if (itemErr) {
            console.error("Database error while checking menu item:", itemErr.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (itemResults.length === 0) {
            return res.status(404).json({ success: false, message: "Menu item not found." });
        }

        const menuItem = itemResults[0];
        if (String(menuItem.restaurant_id) !== String(restaurant_id)) {
            return res.status(400).json({ success: false, message: "This menu item does not belong to the given restaurant." });
        }
        if (!menuItem.is_available) {
            return res.status(400).json({ success: false, message: "This menu item is currently unavailable." });
        }

        // Check the customer's existing cart, if any.
        const findCartQuery = "SELECT cart_id, restaurant_id FROM Cart WHERE customer_id = ?";
        db.query(findCartQuery, [customerId], (cartErr, cartResults) => {
            if (cartErr) {
                console.error("Database error while checking cart:", cartErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            const isDifferentRestaurant =
                cartResults.length > 0 &&
                String(cartResults[0].restaurant_id) !== String(restaurant_id);

            if (!isDifferentRestaurant) {
                return proceedToAddItem(cartResults);
            }

            // An existing Cart row for a different restaurant isn't
            // necessarily a real conflict — if it has zero CartItems (e.g.
            // an order was placed and the Cart row itself was never
            // cleaned up, which orderController.js used to do before this
            // fix), it's just orphaned leftover data, not an actual cart
            // the customer needs to be warned about. Only block when that
            // other-restaurant cart genuinely still has items in it.
            const countItemsQuery = "SELECT COUNT(*) AS item_count FROM CartItems WHERE cart_id = ?";
            db.query(countItemsQuery, [cartResults[0].cart_id], (countErr, countRows) => {
                if (countErr) {
                    console.error("Database error while checking cart item count:", countErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }

                const hasItems = countRows[0].item_count > 0;
                if (hasItems) {
                    return res.status(409).json({
                        success: false,
                        message: "Your cart already contains items from a different restaurant. Clear your cart before ordering from a new restaurant."
                    });
                }

                // Orphaned and empty — remove it and start fresh with the
                // new restaurant, silently. Nothing the customer had was
                // actually lost, since there was nothing in it.
                db.query("DELETE FROM Cart WHERE cart_id = ?", [cartResults[0].cart_id], (deleteErr) => {
                    if (deleteErr) {
                        console.error("Database error while removing an empty stale cart:", deleteErr.message);
                        return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                    }
                    return proceedToAddItem([]);
                });
            });
        });

        function proceedToAddItem(cartResults) {
            withTransaction((next) => {
                const proceedWithCartId = (cartId) => {
                    // Item already in cart? Increase quantity instead of duplicating.
                    const findCartItemQuery = "SELECT cart_item_id, quantity FROM CartItems WHERE cart_id = ? AND item_id = ?";
                    db.query(findCartItemQuery, [cartId, item_id], (findErr, existingItems) => {
                        if (findErr) return next(findErr);

                        if (existingItems.length > 0) {
                            const newQuantity = existingItems[0].quantity + quantity;
                            db.query(
                                "UPDATE CartItems SET quantity = ? WHERE cart_item_id = ?",
                                [newQuantity, existingItems[0].cart_item_id],
                                (updateErr) => next(updateErr)
                            );
                        } else {
                            db.query(
                                "INSERT INTO CartItems (cart_id, item_id, quantity) VALUES (?, ?, ?)",
                                [cartId, item_id, quantity],
                                (insertErr) => next(insertErr)
                            );
                        }
                    });
                };

                if (cartResults.length > 0) {
                    proceedWithCartId(cartResults[0].cart_id);
                } else {
                    db.query(
                        "INSERT INTO Cart (customer_id, restaurant_id) VALUES (?, ?)",
                        [customerId, restaurant_id],
                        (createErr, createResult) => {
                            if (createErr) return next(createErr);
                            proceedWithCartId(createResult.insertId);
                        }
                    );
                }
            }, (txErr) => {
                if (txErr) {
                    console.error("Database error while adding item to cart:", txErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(201).json({ success: true, message: "Item added to cart." });
            });
        }
    });
};

// PUT /api/cart/items/:itemId
// :itemId refers to MenuItems.item_id (matches the id the client already knows
// from browsing the menu / from the POST body), not the internal cart_item_id.
exports.updateCartItem = (req, res) => {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const customerId = req.user.user_id;

    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "quantity must be a positive integer."
        });
    }

    const findQuery = `
        SELECT ci.cart_item_id
        FROM CartItems ci
        JOIN Cart c ON ci.cart_id = c.cart_id
        WHERE c.customer_id = ? AND ci.item_id = ?
    `;
    db.query(findQuery, [customerId, itemId], (findErr, results) => {
        if (findErr) {
            console.error("Database error while finding cart item:", findErr.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "This item is not in your cart." });
        }

        db.query(
            "UPDATE CartItems SET quantity = ? WHERE cart_item_id = ?",
            [quantity, results[0].cart_item_id],
            (updateErr) => {
                if (updateErr) {
                    console.error("Database error while updating cart item:", updateErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(200).json({ success: true, message: "Cart item quantity updated." });
            }
        );
    });
};

// DELETE /api/cart/items/:itemId
exports.removeCartItem = (req, res) => {
    const { itemId } = req.params;
    const customerId = req.user.user_id;

    const findQuery = `
        SELECT ci.cart_item_id
        FROM CartItems ci
        JOIN Cart c ON ci.cart_id = c.cart_id
        WHERE c.customer_id = ? AND ci.item_id = ?
    `;
    db.query(findQuery, [customerId, itemId], (findErr, results) => {
        if (findErr) {
            console.error("Database error while finding cart item:", findErr.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "This item is not in your cart." });
        }

        db.query(
            "DELETE FROM CartItems WHERE cart_item_id = ?",
            [results[0].cart_item_id],
            (deleteErr) => {
                if (deleteErr) {
                    console.error("Database error while removing cart item:", deleteErr.message);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(200).json({ success: true, message: "Item removed from cart." });
            }
        );
    });
};

// DELETE /api/cart
exports.clearCart = (req, res) => {
    const customerId = req.user.user_id;

    db.query("SELECT cart_id FROM Cart WHERE customer_id = ?", [customerId], (findErr, results) => {
        if (findErr) {
            console.error("Database error while finding cart:", findErr.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(200).json({ success: true, message: "Cart is already empty." });
        }

        const cartId = results[0].cart_id;

        withTransaction((next) => {
            db.query("DELETE FROM CartItems WHERE cart_id = ?", [cartId], (delItemsErr) => {
                if (delItemsErr) return next(delItemsErr);
                db.query("DELETE FROM Cart WHERE cart_id = ?", [cartId], (delCartErr) => next(delCartErr));
            });
        }, (txErr) => {
            if (txErr) {
                console.error("Database error while clearing cart:", txErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Cart cleared successfully." });
        });
    });
};