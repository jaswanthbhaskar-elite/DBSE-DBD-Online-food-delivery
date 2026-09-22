const express = require("express");
const router = express.Router();

const trackingController = require("../controllers/trackingController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Customer-only, matching requirement #5 (restaurant owners not included
// since nothing in the current project explicitly requires it).
router.get(
    "/orders/:orderId",
    authMiddleware,
    requireRole("customer"),
    trackingController.getOrderTracking
);

module.exports = router;