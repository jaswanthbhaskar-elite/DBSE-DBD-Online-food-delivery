const db = require("../db");

// Runs multiple queries as a single transaction on the shared callback-based
// connection. Used only where two writes must succeed or fail together
// (clearing an old default + setting a new one).
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

// POST /api/addresses
exports.createAddress = (req, res) => {
    const { label, address_line, city, state, pincode, latitude, longitude, is_default } = req.body;

    if (!label || !address_line || !city || !state || !pincode) {
        return res.status(400).json({
            success: false,
            message: "label, address_line, city, state, and pincode are required."
        });
    }

    const userId = req.user.user_id; // never trust a client-supplied user_id
    const shouldBeDefault = is_default === true;

    const insertNewAddress = (callback) => {
        const insertQuery = `
            INSERT INTO Addresses (user_id, label, address_line, city, state, pincode, latitude, longitude, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            userId, label, address_line, city, state, pincode,
            latitude || null, longitude || null, shouldBeDefault ? 1 : 0
        ];
        db.query(insertQuery, params, (err, result) => callback(err, result));
    };

    if (!shouldBeDefault) {
        // No default handling needed — plain insert.
        return insertNewAddress((err, result) => {
            if (err) {
                console.error("Database error while creating address:", err.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(201).json({
                success: true,
                message: "Address created successfully.",
                address: {
                    address_id: result.insertId,
                    user_id: userId,
                    label, address_line, city, state, pincode,
                    latitude: latitude || null,
                    longitude: longitude || null,
                    is_default: false
                }
            });
        });
    }

    // is_default = true: unset the existing default first, then insert, atomically.
    let newAddressId;
    withTransaction((next) => {
        const clearDefaultQuery = "UPDATE Addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1";
        db.query(clearDefaultQuery, [userId], (clearErr) => {
            if (clearErr) return next(clearErr);

            insertNewAddress((insertErr, result) => {
                if (insertErr) return next(insertErr);
                newAddressId = result.insertId;
                next(null);
            });
        });
    }, (txErr) => {
        if (txErr) {
            console.error("Database error while creating default address:", txErr.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }

        return res.status(201).json({
            success: true,
            message: "Address created successfully.",
            address: {
                address_id: newAddressId,
                user_id: userId,
                label, address_line, city, state, pincode,
                latitude: latitude || null,
                longitude: longitude || null,
                is_default: true
            }
        });
    });
};

// GET /api/addresses
exports.getAddresses = (req, res) => {
    const query = `
        SELECT address_id, user_id, label, address_line, city, state, pincode, latitude, longitude, is_default
        FROM Addresses
        WHERE user_id = ?
        ORDER BY is_default DESC, address_id DESC
    `;
    db.query(query, [req.user.user_id], (err, addresses) => {
        if (err) {
            console.error("Database error while listing addresses:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        return res.status(200).json({ success: true, count: addresses.length, addresses });
    });
};

// GET /api/addresses/:id
exports.getAddressById = (req, res) => {
    const { id } = req.params;

    const query = `
        SELECT address_id, user_id, label, address_line, city, state, pincode, latitude, longitude, is_default
        FROM Addresses
        WHERE address_id = ?
    `;
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error("Database error while fetching address:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Address not found." });
        }
        if (results[0].user_id !== req.user.user_id) {
            return res.status(403).json({ success: false, message: "You do not own this address." });
        }
        return res.status(200).json({ success: true, address: results[0] });
    });
};

// Shared helper: confirms the address exists and belongs to req.user.user_id.
function verifyAddressOwnership(addressId, userId, callback) {
    const query = "SELECT user_id, is_default FROM Addresses WHERE address_id = ?";
    db.query(query, [addressId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, { status: 404, message: "Address not found." });
        }
        if (results[0].user_id !== userId) {
            return callback(null, { status: 403, message: "You do not own this address." });
        }
        return callback(null, null, results[0]);
    });
}

// PUT /api/addresses/:id
exports.updateAddress = (req, res) => {
    const { id } = req.params;

    verifyAddressOwnership(id, req.user.user_id, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying address ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        // is_default is intentionally excluded here — handled only by the
        // dedicated PATCH /:id/default endpoint, to keep "only one default"
        // logic in one place.
        const allowedFields = ["label", "address_line", "city", "state", "pincode", "latitude", "longitude"];
        const updates = [];
        const values = [];

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
        const updateQuery = `UPDATE Addresses SET ${updates.join(", ")} WHERE address_id = ?`;

        db.query(updateQuery, values, (updateErr) => {
            if (updateErr) {
                console.error("Database error while updating address:", updateErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Address updated successfully." });
        });
    });
};

// DELETE /api/addresses/:id
exports.deleteAddress = (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;

    verifyAddressOwnership(id, userId, (err, blocked, address) => {
        if (err) {
            console.error("Database error while verifying address ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const wasDefault = address.is_default === 1;

        withTransaction((next) => {
            db.query("DELETE FROM Addresses WHERE address_id = ?", [id], (deleteErr) => {
                if (deleteErr) return next(deleteErr);

                if (!wasDefault) return next(null);

                // Promote another remaining address (if any) to default.
                const findReplacementQuery = `
                    SELECT address_id FROM Addresses
                    WHERE user_id = ?
                    ORDER BY address_id DESC
                    LIMIT 1
                `;
                db.query(findReplacementQuery, [userId], (findErr, remaining) => {
                    if (findErr) return next(findErr);
                    if (remaining.length === 0) return next(null); // no addresses left

                    db.query(
                        "UPDATE Addresses SET is_default = 1 WHERE address_id = ?",
                        [remaining[0].address_id],
                        (promoteErr) => next(promoteErr)
                    );
                });
            });
        }, (txErr) => {
            if (txErr) {
                console.error("Database error while deleting address:", txErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Address deleted successfully." });
        });
    });
};

// PATCH /api/addresses/:id/default
exports.setDefaultAddress = (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;

    verifyAddressOwnership(id, userId, (err, blocked) => {
        if (err) {
            console.error("Database error while verifying address ownership:", err.message);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        withTransaction((next) => {
            db.query("UPDATE Addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1", [userId], (clearErr) => {
                if (clearErr) return next(clearErr);

                db.query("UPDATE Addresses SET is_default = 1 WHERE address_id = ?", [id], (setErr) => next(setErr));
            });
        }, (txErr) => {
            if (txErr) {
                console.error("Database error while setting default address:", txErr.message);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            return res.status(200).json({ success: true, message: "Default address updated successfully." });
        });
    });
};