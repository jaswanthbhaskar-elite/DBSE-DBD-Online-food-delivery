const express = require("express");
const router = express.Router();

const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every review endpoint requires a logged-in customer.
router.use(authMiddleware, requireRole("customer"));

router.get("/order/:orderId", reviewController.getOrderReviews);
router.post("/restaurant", reviewController.createRestaurantReview);
router.post("/delivery-partner", reviewController.createDeliveryPartnerReview);

module.exports = router;