const express = require("express");
const router = express.Router();

const deliveryController = require("../controllers/deliveryController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every route needs a valid JWT; the required ROLE differs per route below,
// so authMiddleware is applied globally but requireRole is applied per-route
// instead of once via router.use().
router.use(authMiddleware);

// Delivery partner endpoints
router.post("/profile", requireRole("delivery_partner"), deliveryController.createProfile);
router.get("/available-orders", requireRole("delivery_partner"), deliveryController.getAvailableOrders);
router.get("/orders", requireRole("delivery_partner"), deliveryController.getAssignedOrders);
router.get("/orders/:id", requireRole("delivery_partner"), deliveryController.getAssignedOrderById);
router.patch("/orders/:id/accept", requireRole("delivery_partner"), deliveryController.acceptOrder);
router.patch("/orders/:id/status", requireRole("delivery_partner"), deliveryController.updateDeliveryStatus);
router.patch("/location", requireRole("delivery_partner"), deliveryController.updateLocation);
router.patch("/online-status", requireRole("delivery_partner"), deliveryController.updateOnlineStatus);

// Restaurant owner endpoint
router.patch("/orders/:id/assign", requireRole("restaurant_owner"), deliveryController.assignDeliveryPartner);

module.exports = router;