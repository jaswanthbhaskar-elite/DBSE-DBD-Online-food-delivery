const express = require("express");
const router = express.Router();

const cartController = require("../controllers/cartController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every cart endpoint requires a logged-in customer.
router.use(authMiddleware, requireRole("customer"));

router.get("/", cartController.getCart);
router.post("/items", cartController.addItemToCart);
router.put("/items/:itemId", cartController.updateCartItem);
router.delete("/items/:itemId", cartController.removeCartItem);
router.delete("/", cartController.clearCart);

module.exports = router;