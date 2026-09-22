const express = require("express");
const router = express.Router();

const restaurantOrderController = require("../controllers/restaurantOrderController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every endpoint here requires a logged-in restaurant_owner.
router.use(authMiddleware, requireRole("restaurant_owner"));

router.get("/", restaurantOrderController.getRestaurantOrders);
router.get("/:id", restaurantOrderController.getRestaurantOrderById);
router.patch("/:id/status", restaurantOrderController.updateOrderStatus);

module.exports = router;