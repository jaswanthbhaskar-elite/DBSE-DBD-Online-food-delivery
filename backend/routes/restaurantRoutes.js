const express = require("express");
const router = express.Router();

const restaurantController = require("../controllers/restaurantController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Public
router.get("/", restaurantController.getRestaurants);

// restaurant_owner only — must be registered BEFORE "/:id" below, otherwise
// Express would match "mine" as the :id parameter and this route would
// never be reached.
router.get("/mine", authMiddleware, requireRole("restaurant_owner"), restaurantController.getMyRestaurant);

router.get("/:id", restaurantController.getRestaurantById);

// restaurant_owner only
router.post("/", authMiddleware, requireRole("restaurant_owner"), restaurantController.createRestaurant);
router.put("/:id", authMiddleware, requireRole("restaurant_owner"), restaurantController.updateRestaurant);

module.exports = router;