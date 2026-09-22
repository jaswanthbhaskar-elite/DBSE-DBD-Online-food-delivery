const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every payment endpoint requires a logged-in customer — same pattern as
// cartRoutes.js/orderRoutes.js.
router.use(authMiddleware, requireRole("customer"));

router.post("/orders/:orderId/create", paymentController.createDemoPayment);
router.post("/verify", paymentController.verifyDemoPayment);

module.exports = router;