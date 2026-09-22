const express = require("express");
const router = express.Router();

const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every order endpoint requires a logged-in customer.
router.use(authMiddleware, requireRole("customer"));

router.post("/", orderController.createOrder);
router.get("/", orderController.getOrders);
router.get("/:id", orderController.getOrderById);
router.patch("/:id/cancel", orderController.cancelOrder);
router.patch("/:id/confirm", orderController.confirmDelivery);

module.exports = router;