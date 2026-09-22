const db = require("../db");
const socket = require("../socket");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    console.error("-----------------------------------");
}

function withTransaction(actions, done) {
    db.beginTransaction((beginErr) => {
        if (beginErr) return done(beginErr);
        actions((actionErr) => {
            if (actionErr) return db.rollback(() => done(actionErr));
            db.commit((commitErr) => {
                if (commitErr) return db.rollback(() => done(commitErr));
                done(null);
            });
        });
    });
}

// Resolves DeliveryPartners.partner_id for the logged-in user.
function getOwnPartnerId(userId, callback) {
    db.query("SELECT partner_id FROM DeliveryPartners WHERE user_id = ?", [userId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) return callback(null, null);
        return callback(null, results[0].partner_id);
    });
}

// Shared SELECT used by both the list and single-order endpoints, joining in
// everything a delivery partner needs to actually make the delivery — including
// restaurant/address coordinates already present in the schema (no map API involved).
const ORDER_SELECT = `
    SELECT o.order_id, o.customer_id, o.restaurant_id, o.delivery_partner_id,
           o.delivery_address_id, o.order_status, o.subtotal, o.delivery_fee,
           o.discount_amount, o.tax_amount, o.total_amount, o.placed_at, o.delivered_at,
           r.name AS restaurant_name, r.address_line AS restaurant_address_line,
           r.city AS restaurant_city, r.state AS restaurant_state,
           r.latitude AS restaurant_latitude, r.longitude AS restaurant_longitude,
           r.phone AS restaurant_phone,
           u.name AS customer_name, u.phone AS customer_phone,
           a.address_line AS delivery_address_line, a.city AS delivery_city,
           a.state AS delivery_state, a.pincode AS delivery_pincode,
           a.latitude AS delivery_latitude, a.longitude AS delivery_longitude
    FROM Orders o
    JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
    JOIN Users u ON o.customer_id = u.user_id
    JOIN Addresses a ON o.delivery_address_id = a.address_id
`;

function attachOrderItems(orders, callback) {
    if (orders.length === 0) return callback(null, orders);

    const orderIds = orders.map((o) => o.order_id);
    const itemsQuery = `
        SELECT oi.order_id, oi.order_item_id, oi.item_id, oi.quantity, oi.unit_price, oi.item_subtotal, mi.name
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

// GET /api/delivery/orders
exports.getAssignedOrders = (req, res) => {
    const userId = req.user.user_id;

    getOwnPartnerId(userId, (partnerErr, partnerId) => {
        if (partnerErr) {
            logDbError("resolving delivery partner profile", partnerErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (!partnerId) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const query = `${ORDER_SELECT} WHERE o.delivery_partner_id = ? ORDER BY o.placed_at DESC`;
        db.query(query, [partnerId], (err, orders) => {
            if (err) {
                logDbError("listing assigned orders", err);
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

// GET /api/delivery/orders/:id
exports.getAssignedOrderById = (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;

    getOwnPartnerId(userId, (partnerErr, partnerId) => {
        if (partnerErr) {
            logDbError("resolving delivery partner profile", partnerErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (!partnerId) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const query = `${ORDER_SELECT} WHERE o.order_id = ?`;
        db.query(query, [id], (err, results) => {
            if (err) {
                logDbError("fetching assigned order", err);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Order not found." });
            }
            if (results[0].delivery_partner_id !== partnerId) {
                return res.status(403).json({ success: false, message: "This order is not assigned to you." });
            }

            attachOrderItems([results[0]], (itemsErr, ordersWithItems) => {
                if (itemsErr) {
                    logDbError("attaching order items", itemsErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(200).json({ success: true, order: ordersWithItems[0] });
            });
        });
    });
};

// PATCH /api/delivery/orders/:id/assign  (restaurant_owner only)
// ---------------------------------------------------------------------
// 10 km proximity assignment — Haversine distance, no external/paid API.
// ---------------------------------------------------------------------
const MAX_ASSIGNMENT_DISTANCE_KM = 10;

// Great-circle distance between two lat/lng points, in kilometers.
// Standard Haversine formula.
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

exports.assignDeliveryPartner = (req, res) => {
    const { id } = req.params;
    const ownerId = req.user.user_id;
    // delivery_partner_id is now OPTIONAL: if provided, it's validated
    // against the same 10 km/online/coordinates eligibility rules as
    // auto-assignment (see requirement 13). If omitted, the nearest
    // eligible partner within MAX_ASSIGNMENT_DISTANCE_KM is selected
    // automatically.
    let { delivery_partner_id } = req.body;

    // 1. Confirm this order belongs to a restaurant owned by req.user.user_id,
    // and grab the restaurant's coordinates — needed for the proximity
    // check below regardless of whether a partner was explicitly chosen or
    // needs to be auto-selected.
    const orderQuery = `
        SELECT o.order_id, o.order_status, o.delivery_partner_id, r.owner_id,
               r.latitude AS restaurant_latitude, r.longitude AS restaurant_longitude
        FROM Orders o
        JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
        WHERE o.order_id = ?
    `;
    db.query(orderQuery, [id], (orderErr, orderResults) => {
        if (orderErr) {
            logDbError("fetching order for assignment", orderErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (orderResults.length === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        if (orderResults[0].owner_id !== ownerId) {
            return res.status(403).json({ success: false, message: "This order does not belong to your restaurant." });
        }

        const order = orderResults[0];
        if (order.order_status === "delivered" || order.order_status === "cancelled") {
            return res.status(409).json({
                success: false,
                message: `Cannot assign a delivery partner to an order that is already '${order.order_status}'.`
            });
        }

        const restaurantLat = order.restaurant_latitude != null ? Number(order.restaurant_latitude) : null;
        const restaurantLng = order.restaurant_longitude != null ? Number(order.restaurant_longitude) : null;

        // Shared by both the manual (explicit delivery_partner_id) and
        // auto-assign paths — everything from here down is EXACTLY the
        // original assignment logic, untouched, just invoked with
        // whichever partner id was chosen.
        const proceedWithPartnerId = (partnerId) => {
            // 2. Confirm the chosen user is a real, valid delivery partner,
            // and pull their online status + coordinates for the proximity
            // check.
            const partnerQuery = `
                SELECT dp.partner_id, dp.current_order_id, dp.is_online,
                       dp.current_latitude, dp.current_longitude, u.role
                FROM DeliveryPartners dp
                JOIN Users u ON dp.user_id = u.user_id
                WHERE dp.partner_id = ?
            `;
            db.query(partnerQuery, [partnerId], (partnerErr, partnerResults) => {
                if (partnerErr) {
                    logDbError("validating delivery partner", partnerErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                if (partnerResults.length === 0 || partnerResults[0].role !== "delivery_partner") {
                    return res.status(400).json({ success: false, message: "delivery_partner_id does not refer to a valid delivery partner." });
                }

                const partner = partnerResults[0];
                if (partner.current_order_id && partner.current_order_id !== order.order_id) {
                    return res.status(409).json({
                        success: false,
                        message: "This delivery partner is already handling another active order."
                    });
                }

                // 10 km proximity + online + coordinates eligibility gate.
                // Applies whether the partner was picked manually or is
                // about to be auto-selected (in the auto path, the
                // candidate was already filtered to satisfy this before
                // reaching here, so this simply re-confirms it).
                if (restaurantLat == null || restaurantLng == null) {
                    return res.status(422).json({
                        success: false,
                        message: "Cannot verify delivery partner proximity — this restaurant has no location coordinates set."
                    });
                }
                if (!partner.is_online) {
                    return res.status(409).json({
                        success: false,
                        message: "This delivery partner is currently offline."
                    });
                }
                if (partner.current_latitude == null || partner.current_longitude == null) {
                    return res.status(409).json({
                        success: false,
                        message: "This delivery partner's current location is not available."
                    });
                }
                const distanceKm = haversineDistanceKm(
                    restaurantLat,
                    restaurantLng,
                    Number(partner.current_latitude),
                    Number(partner.current_longitude)
                );
                if (distanceKm > MAX_ASSIGNMENT_DISTANCE_KM) {
                    return res.status(409).json({
                        success: false,
                        message: `This delivery partner is ${distanceKm.toFixed(1)} km away — outside the ${MAX_ASSIGNMENT_DISTANCE_KM} km assignment radius.`
                    });
                }

                const previousPartnerId = order.delivery_partner_id;

                withTransaction((next) => {
                    const freeOldPartner = (cb) => {
                        // If this order was previously assigned to a different partner,
                        // free that partner up before assigning the new one.
                        if (!previousPartnerId || previousPartnerId === partnerId) {
                            return cb();
                        }
                        db.query(
                            "UPDATE DeliveryPartners SET current_order_id = NULL WHERE partner_id = ? AND current_order_id = ?",
                            [previousPartnerId, id],
                            (freeErr) => cb(freeErr)
                        );
                    };

                    freeOldPartner((freeErr) => {
                        if (freeErr) return next(freeErr);

                        db.query(
                            "UPDATE Orders SET delivery_partner_id = ? WHERE order_id = ?",
                            [partnerId, id],
                            (updateOrderErr) => {
                                if (updateOrderErr) return next(updateOrderErr);

                                db.query(
                                    "UPDATE DeliveryPartners SET current_order_id = ? WHERE partner_id = ?",
                                    [id, partnerId],
                                    (updatePartnerErr) => next(updatePartnerErr)
                                );
                            }
                        );
                    });
                }, (txErr) => {
                    if (txErr) {
                        logDbError("assigning delivery partner", txErr);
                        return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                    }
                    return res.status(200).json({
                        success: true,
                        message: "Delivery partner assigned successfully.",
                        delivery_partner_id: partnerId,
                        distance_km: Math.round(distanceKm * 10) / 10
                    });
                });
            });
        };

        if (delivery_partner_id) {
            return proceedWithPartnerId(delivery_partner_id);
        }

        // AUTO-ASSIGN: no delivery_partner_id given — find the nearest
        // eligible (online, has coordinates, within MAX_ASSIGNMENT_DISTANCE_KM)
        // delivery partner and assign them.
        if (restaurantLat == null || restaurantLng == null) {
            return res.status(422).json({
                success: false,
                message: "Cannot auto-assign — this restaurant has no location coordinates set."
            });
        }

        const candidatesQuery = `
            SELECT partner_id, current_latitude, current_longitude
            FROM DeliveryPartners
            WHERE is_online = TRUE
              AND current_order_id IS NULL
              AND current_latitude IS NOT NULL
              AND current_longitude IS NOT NULL
        `;
        db.query(candidatesQuery, (candidatesErr, candidates) => {
            if (candidatesErr) {
                logDbError("finding nearby delivery partners for auto-assignment", candidatesErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            const eligible = candidates
                .map((c) => ({
                    partner_id: c.partner_id,
                    distanceKm: haversineDistanceKm(
                        restaurantLat,
                        restaurantLng,
                        Number(c.current_latitude),
                        Number(c.current_longitude)
                    )
                }))
                .filter((c) => c.distanceKm <= MAX_ASSIGNMENT_DISTANCE_KM)
                .sort((a, b) => a.distanceKm - b.distanceKm);

            if (eligible.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `No online delivery partners are currently available within ${MAX_ASSIGNMENT_DISTANCE_KM} km of this restaurant.`
                });
            }

            delivery_partner_id = eligible[0].partner_id;
            proceedWithPartnerId(delivery_partner_id);
        });
    });
};

// PATCH /api/delivery/orders/:id/status  (delivery_partner only)
// Two forward transitions a delivery partner may perform, one step at a
// time: preparing -> out_for_delivery ("picked up from the restaurant, now
// en route") and out_for_delivery -> delivered. There is no separate
// "picked_up" value in the order_status enum (see schema.sql) — picking up
// is represented as the move into out_for_delivery, just now triggerable by
// the delivery partner instead of only the restaurant owner.
const PARTNER_TRANSITIONS = {
    preparing: "out_for_delivery",
    out_for_delivery: "delivered",
};

exports.updateDeliveryStatus = (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;
    const { status: requestedStatus } = req.body;

    if (!requestedStatus || !Object.values(PARTNER_TRANSITIONS).includes(requestedStatus)) {
        return res.status(400).json({
            success: false,
            message: "status must be 'out_for_delivery' (picked up) or 'delivered'."
        });
    }

    getOwnPartnerId(userId, (partnerErr, partnerId) => {
        if (partnerErr) {
            logDbError("resolving delivery partner profile", partnerErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (!partnerId) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const findQuery = "SELECT order_status, delivery_partner_id FROM Orders WHERE order_id = ?";
        db.query(findQuery, [id], (findErr, results) => {
            if (findErr) {
                logDbError("fetching order for delivery status update", findErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Order not found." });
            }
            if (results[0].delivery_partner_id !== partnerId) {
                return res.status(403).json({ success: false, message: "This order is not assigned to you." });
            }

            const currentStatus = results[0].order_status;
            const allowedNext = PARTNER_TRANSITIONS[currentStatus];

            if (!allowedNext || requestedStatus !== allowedNext) {
                return res.status(409).json({
                    success: false,
                    message: allowedNext
                        ? `Invalid transition from '${currentStatus}' to '${requestedStatus}'. The next allowed status is '${allowedNext}'.`
                        : `Order is '${currentStatus}' and cannot be moved forward by a delivery partner.`
                });
            }

            const isDelivered = requestedStatus === "delivered";

            withTransaction((next) => {
                const updateOrderQuery = isDelivered
                    ? "UPDATE Orders SET order_status = 'delivered', delivered_at = NOW() WHERE order_id = ?"
                    : "UPDATE Orders SET order_status = 'out_for_delivery' WHERE order_id = ?";

                db.query(updateOrderQuery, [id], (orderUpdateErr) => {
                    if (orderUpdateErr) return next(orderUpdateErr);

                    if (!isDelivered) {
                        // Picked up, but still their active delivery — current_order_id stays set.
                        return next(null);
                    }

                    // Delivered — free the partner up for new assignments.
                    db.query(
                        "UPDATE DeliveryPartners SET current_order_id = NULL WHERE partner_id = ? AND current_order_id = ?",
                        [partnerId, id],
                        (freeErr) => next(freeErr)
                    );
                });
            }, (txErr) => {
                if (txErr) {
                    logDbError("updating delivery order status", txErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }

                if (isDelivered) {
                    // Notify anyone watching this order in real time — the
                    // customer's tracking session is already subscribed to
                    // this exact room while out_for_delivery. Not fatal to
                    // the request if Socket.io isn't initialized for some
                    // reason; the order is already saved either way.
                    try {
                        socket.getIO().to(`order_${id}`).emit("order:delivered", { order_id: id });
                    } catch (socketErr) {
                        console.error("Socket.io emit failed:", socketErr.message);
                    }
                }

                return res.status(200).json({
                    success: true,
                    message: isDelivered ? "Order marked as delivered." : "Order marked as picked up / out for delivery."
                });
            });
        });
    });
};

// GET /api/delivery/available-orders  (delivery_partner only)
// Orders the restaurant has confirmed or started preparing, with no
// delivery partner assigned yet — eligible for self-accept.
exports.getAvailableOrders = (req, res) => {
    const query = `${ORDER_SELECT} WHERE o.delivery_partner_id IS NULL AND o.order_status IN ('confirmed', 'preparing') ORDER BY o.placed_at ASC`;

    db.query(query, (err, orders) => {
        if (err) {
            logDbError("listing available orders", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        attachOrderItems(orders, (itemsErr, ordersWithItems) => {
            if (itemsErr) {
                logDbError("attaching order items to available orders", itemsErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, count: ordersWithItems.length, orders: ordersWithItems });
        });
    });
};

// PATCH /api/delivery/orders/:id/accept  (delivery_partner only)
// Concurrency-safe self-accept: the claiming UPDATE includes
// "AND delivery_partner_id IS NULL" in its WHERE clause, so if two partners
// race for the same order, MySQL's row locking during the transaction
// ensures only the first UPDATE actually matches a row — the second gets
// affectedRows = 0 and is correctly rejected with 409, never silently
// overwriting the first partner's claim.
exports.acceptOrder = (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;

    getOwnPartnerId(userId, (partnerErr, partnerId) => {
        if (partnerErr) {
            logDbError("resolving delivery partner profile", partnerErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (!partnerId) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const busyCheckQuery = "SELECT current_order_id FROM DeliveryPartners WHERE partner_id = ?";
        db.query(busyCheckQuery, [partnerId], (busyErr, busyResults) => {
            if (busyErr) {
                logDbError("checking delivery partner availability", busyErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            if (busyResults.length > 0 && busyResults[0].current_order_id) {
                return res.status(409).json({
                    success: false,
                    message: "You already have an active delivery. Complete it before accepting another."
                });
            }

            withTransaction((next) => {
                const claimQuery = `
                    UPDATE Orders
                    SET delivery_partner_id = ?
                    WHERE order_id = ?
                      AND delivery_partner_id IS NULL
                      AND order_status IN ('confirmed', 'preparing')
                `;
                db.query(claimQuery, [partnerId, id], (claimErr, claimResult) => {
                    if (claimErr) return next(claimErr);
                    if (claimResult.affectedRows === 0) {
                        // Either it never existed, or someone else claimed it first.
                        return next({ alreadyClaimed: true });
                    }

                    db.query(
                        "UPDATE DeliveryPartners SET current_order_id = ? WHERE partner_id = ?",
                        [id, partnerId],
                        (partnerUpdateErr) => next(partnerUpdateErr)
                    );
                });
            }, (txErr) => {
                if (txErr) {
                    if (txErr.alreadyClaimed) {
                        return res.status(409).json({
                            success: false,
                            message: "This order is no longer available — another delivery partner may have already accepted it."
                        });
                    }
                    logDbError("accepting order", txErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                return res.status(200).json({ success: true, message: "Order accepted successfully." });
            });
        });
    });
};

// PATCH /api/delivery/location  (delivery_partner only)
// Updates the authenticated partner's own current_latitude/current_longitude.
// Only permitted while they have an active current_order_id — a partner with
// no active delivery has nothing to broadcast a live position for.
exports.updateLocation = (req, res) => {
    const userId = req.user.user_id;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, message: "latitude and longitude are required." });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ success: false, message: "latitude and longitude must be numeric." });
    }
    if (lat < -90 || lat > 90) {
        return res.status(400).json({ success: false, message: "latitude must be between -90 and 90." });
    }
    if (lng < -180 || lng > 180) {
        return res.status(400).json({ success: false, message: "longitude must be between -180 and 180." });
    }

    // Look up the partner's OWN row via req.user.user_id — never accept a
    // partner_id or delivery_partner_id from the client for this endpoint,
    // so a partner can only ever update their own coordinates.
    const findQuery = "SELECT partner_id, current_order_id, is_online FROM DeliveryPartners WHERE user_id = ?";
    db.query(findQuery, [userId], (findErr, results) => {
        if (findErr) {
            logDbError("resolving delivery partner profile for location update", findErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const { partner_id: partnerId, current_order_id: currentOrderId, is_online: isOnline } = results[0];

        // MINIMAL CHANGE (required for 10 km proximity assignment): a
        // partner's location must be known BEFORE they're ever assigned an
        // order, not just during one — otherwise no idle/available partner
        // could ever be found as a nearby candidate. Previously this only
        // accepted updates while an order was already active; now it also
        // accepts them whenever the partner is online, active order or
        // not. Everything else about this endpoint (ownership resolution,
        // lat/lng validation, the update query, the response shape) is
        // unchanged.
        if (!currentOrderId && !isOnline) {
            return res.status(409).json({
                success: false,
                message: "Location updates require you to be online or have an active delivery."
            });
        }

        const updateQuery = "UPDATE DeliveryPartners SET current_latitude = ?, current_longitude = ? WHERE partner_id = ?";
        db.query(updateQuery, [lat, lng, partnerId], (updateErr) => {
            if (updateErr) {
                logDbError("updating delivery partner location", updateErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            // Notify anyone watching this specific order in real time —
            // only meaningful when there IS an active order to notify
            // about. An idle-but-online location update (no order yet)
            // has no room to emit to, and shouldn't try to.
            if (currentOrderId) {
                try {
                    socket.getIO().to(`order_${currentOrderId}`).emit("delivery:location", {
                        order_id: currentOrderId,
                        delivery_partner_id: partnerId,
                        latitude: lat,
                        longitude: lng
                    });
                } catch (socketErr) {
                    // Socket.io not initialized shouldn't fail the HTTP request —
                    // the location is already saved; just log it.
                    console.error("Socket.io emit failed:", socketErr.message);
                }
            }

            return res.status(200).json({
                success: true,
                message: "Location updated.",
                location: { order_id: currentOrderId, delivery_partner_id: partnerId, latitude: lat, longitude: lng }
            });
        });
    });
};

// PATCH /api/delivery/online-status  (delivery_partner only)
// Lets the logged-in delivery partner go online/offline. This is the
// minimal missing piece needed for the 10 km proximity assignment feature
// to have any eligible candidates at all — previously is_online could
// only ever be set to FALSE (by createProfile's initial insert) and had
// no endpoint to ever become TRUE.
//
// Going online has no restrictions — a partner can go online at any time,
// with or without an active order (requirement 5).
// Going offline is blocked while the partner has an active order
// (current_order_id set) — they must finish or hand off that delivery
// first (requirement 6).
exports.updateOnlineStatus = (req, res) => {
    const userId = req.user.user_id;
    const { is_online } = req.body;

    if (typeof is_online !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "is_online must be true or false."
        });
    }

    // Same ownership pattern as updateLocation — resolve the partner's
    // OWN row via req.user.user_id, never trust a client-supplied id.
    const findQuery = "SELECT partner_id, current_order_id FROM DeliveryPartners WHERE user_id = ?";
    db.query(findQuery, [userId], (findErr, results) => {
        if (findErr) {
            logDbError("resolving delivery partner profile for online-status update", findErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "No delivery partner profile found for this account." });
        }

        const { partner_id: partnerId, current_order_id: currentOrderId } = results[0];

        if (!is_online && currentOrderId) {
            return res.status(409).json({
                success: false,
                message: "You have an active order in progress. Complete it before going offline."
            });
        }

        const updateQuery = "UPDATE DeliveryPartners SET is_online = ? WHERE partner_id = ?";
        db.query(updateQuery, [is_online, partnerId], (updateErr) => {
            if (updateErr) {
                logDbError("updating delivery partner online status", updateErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(200).json({
                success: true,
                message: is_online ? "You are now online." : "You are now offline.",
                is_online
            });
        });
    });
};

// POST /api/delivery/profile  (delivery_partner only)
// Creates the DeliveryPartners row for the authenticated user. Previously
// this had to be done with a manual SQL insert during testing.
exports.createProfile = (req, res) => {
    const userId = req.user.user_id;
    const { vehicle_type, license_number } = req.body;

    const VALID_VEHICLE_TYPES = ["bike", "scooter", "bicycle"];

    if (!vehicle_type || !license_number) {
        return res.status(400).json({
            success: false,
            message: "vehicle_type and license_number are required."
        });
    }

    if (!VALID_VEHICLE_TYPES.includes(vehicle_type)) {
        return res.status(400).json({
            success: false,
            message: `vehicle_type must be one of: ${VALID_VEHICLE_TYPES.join(", ")}`
        });
    }

    // Prevent duplicate profiles for the same user (DeliveryPartners.user_id is UNIQUE
    // in the schema, but checking first gives a clean 409 instead of a raw DB error).
    const checkQuery = "SELECT partner_id FROM DeliveryPartners WHERE user_id = ?";
    db.query(checkQuery, [userId], (checkErr, existing) => {
        if (checkErr) {
            logDbError("checking existing delivery partner profile", checkErr);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "A delivery partner profile already exists for this account."
            });
        }

        const insertQuery = `
            INSERT INTO DeliveryPartners (user_id, vehicle_type, license_number, is_online)
            VALUES (?, ?, ?, FALSE)
        `;
        db.query(insertQuery, [userId, vehicle_type, license_number], (insertErr, result) => {
            if (insertErr) {
                logDbError("creating delivery partner profile", insertErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            return res.status(201).json({
                success: true,
                message: "Delivery partner profile created successfully.",
                profile: {
                    partner_id: result.insertId,
                    user_id: userId,
                    vehicle_type,
                    license_number,
                    is_online: false,
                    current_order_id: null
                }
            });
        });
    });
};

// Exported for unit testing — pure function, no DB access required.
exports._internal = {
    haversineDistanceKm,
    MAX_ASSIGNMENT_DISTANCE_KM,
};