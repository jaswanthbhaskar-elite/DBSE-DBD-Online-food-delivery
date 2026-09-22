const crypto = require("crypto");
const db = require("../db");

function logDbError(context, err) {
    console.error(`--- Database error: ${context} ---`);
    console.error("message:   ", err.message);
    if (err.code) console.error("code:      ", err.code);
    if (err.sqlMessage) console.error("sqlMessage:", err.sqlMessage);
    if (err.sqlState) console.error("sqlState:  ", err.sqlState);
    console.error("-----------------------------------");
}

// This is a DEMO payment system for a college project. There is no real
// payment gateway integration, no money moves, and nothing here should be
// mistaken for a production payment flow.
const ALLOWED_METHODS = ["upi", "qr", "card", "cod"];

// Payments.payment_method only has 'card' | 'upi' | 'netbanking' | 'cod'
// (see schema.sql) — there's no 'qr' value, so QR is stored as 'upi' since
// it's the same underlying demo rail, just a different UI presentation.
function toDbMethod(method) {
    return method === "qr" ? "upi" : method;
}

// Generates a realistic-looking but clearly-fake reference, e.g.
// "DEMO_UPI_8F42A91C". Reused for both the pre-payment session reference
// and the final transaction id.
function generateReference(prefix) {
    return `DEMO_${prefix.toUpperCase()}_${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;
}

// Shared helper: loads an order and confirms it belongs to the authenticated
// customer, same ownership pattern used by every other controller here.
function getOwnedOrder(orderId, customerId, callback) {
    const query = `
        SELECT o.order_id, o.customer_id, o.total_amount, r.name AS restaurant_name
        FROM Orders o
        JOIN Restaurants r ON o.restaurant_id = r.restaurant_id
        WHERE o.order_id = ?
    `;
    db.query(query, [orderId], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) {
            return callback(null, { status: 404, message: "Order not found." });
        }
        if (results[0].customer_id !== customerId) {
            return callback(null, { status: 403, message: "You do not own this order." });
        }
        return callback(null, null, results[0]);
    });
}

// POST /api/payments/orders/:orderId/create
// Starts a demo payment for an existing order. For UPI/QR this returns a
// demo UPI payload to render as a QR code. For COD this immediately records
// a pending Payments row and needs no further verification step at all.
exports.createDemoPayment = (req, res) => {
    const { orderId } = req.params;
    const customerId = req.user.user_id;
    const { payment_method } = req.body;

    if (!payment_method || !ALLOWED_METHODS.includes(payment_method)) {
        return res.status(400).json({
            success: false,
            message: `payment_method must be one of: ${ALLOWED_METHODS.join(", ")}`,
        });
    }

    getOwnedOrder(orderId, customerId, (err, blocked, order) => {
        if (err) {
            logDbError("fetching order for demo payment creation", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        // Authoritative amount — always read from the database, never from
        // the request body. The frontend never supplies an amount anywhere
        // in this flow.
        const amount = order.total_amount;
        const dbMethod = toDbMethod(payment_method);
        const sessionRef = generateReference(dbMethod);

        const buildResponse = () => {
            const isUpiLike = payment_method === "upi" || payment_method === "qr";
            const upiPayload = isUpiLike
                ? `upi://pay?pa=fooddelivery@demo&pn=${encodeURIComponent(order.restaurant_name)}&am=${amount}&cu=INR&tr=${sessionRef}`
                : null;

            return res.status(200).json({
                success: true,
                demo: true,
                order_id: order.order_id,
                amount,
                payment_method, // echoes back exactly what was requested (upi/qr/card/cod)
                transaction_ref: sessionRef,
                upi_payload: upiPayload,
                payment_status: "pending",
            });
        };

        // Upsert on the existing UNIQUE(order_id) constraint — same pattern
        // as the earlier Razorpay implementation, just without any external
        // gateway call.
        const findExistingQuery = "SELECT payment_id FROM Payments WHERE order_id = ?";
        db.query(findExistingQuery, [order.order_id], (findErr, existing) => {
            if (findErr) {
                logDbError("checking existing payment row", findErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }

            if (existing.length > 0) {
                const updateQuery = `
                    UPDATE Payments
                    SET amount = ?, payment_method = ?, payment_status = 'pending',
                        razorpay_order_id = ?, razorpay_payment_id = NULL, paid_at = NULL
                    WHERE order_id = ?
                `;
                db.query(updateQuery, [amount, dbMethod, sessionRef, order.order_id], (updateErr) => {
                    if (updateErr) {
                        logDbError("updating existing demo payment row", updateErr);
                        return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                    }
                    return buildResponse();
                });
            } else {
                const insertQuery = `
                    INSERT INTO Payments (order_id, amount, payment_method, payment_status, razorpay_order_id)
                    VALUES (?, ?, ?, 'pending', ?)
                `;
                db.query(insertQuery, [order.order_id, amount, dbMethod, sessionRef], (insertErr) => {
                    if (insertErr) {
                        logDbError("creating demo payment row", insertErr);
                        return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                    }
                    return buildResponse();
                });
            }
        });
    });
};

// POST /api/payments/verify
// Completes a demo UPI/QR/card payment (never called for COD — COD has
// nothing to verify, it's collected at delivery). This is what actually
// flips payment_status to 'success' and stamps paid_at — never the
// createDemoPayment step above, and never anything the frontend claims on
// its own.
exports.verifyDemoPayment = (req, res) => {
    const customerId = req.user.user_id;
    const { order_id } = req.body;

    if (!order_id) {
        return res.status(400).json({ success: false, message: "order_id is required." });
    }

    getOwnedOrder(order_id, customerId, (err, blocked) => {
        if (err) {
            logDbError("fetching order for demo payment verification", err);
            return res.status(500).json({ success: false, message: "Database error. Please try again later." });
        }
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const paymentQuery = "SELECT payment_id, payment_method, payment_status FROM Payments WHERE order_id = ?";
        db.query(paymentQuery, [order_id], (payErr, payResults) => {
            if (payErr) {
                logDbError("fetching payment row for verification", payErr);
                return res.status(500).json({ success: false, message: "Database error. Please try again later." });
            }
            if (payResults.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No payment record found for this order. Start a payment first.",
                });
            }

            const payment = payResults[0];

            if (payment.payment_method === "cod") {
                return res.status(400).json({
                    success: false,
                    message: "Cash on Delivery orders do not require payment verification.",
                });
            }

            if (payment.payment_status === "success") {
                return res.status(200).json({
                    success: true,
                    message: "Payment already verified.",
                    payment_status: "success",
                });
            }

            const transactionId = generateReference(payment.payment_method);
            const updateQuery = `
                UPDATE Payments
                SET payment_status = 'success', razorpay_payment_id = ?, paid_at = NOW()
                WHERE order_id = ?
            `;
            db.query(updateQuery, [transactionId, order_id], (updateErr, result) => {
                if (updateErr) {
                    logDbError("marking demo payment success", updateErr);
                    return res.status(500).json({ success: false, message: "Database error. Please try again later." });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: "No payment record found for this order." });
                }

                return res.status(200).json({
                    success: true,
                    message: "Payment verified successfully (demo).",
                    transaction_id: transactionId,
                    payment_status: "success",
                });
            });
        });
    });
};