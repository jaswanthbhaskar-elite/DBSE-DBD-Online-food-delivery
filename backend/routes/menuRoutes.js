const express = require("express");

// mergeParams: true so this router (mounted under /api/restaurants/:restaurantId)
// can read req.params.restaurantId
const restaurantMenuRouter = express.Router({ mergeParams: true });
const menuItemRouter = express.Router();

const menuController = require("../controllers/menuController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// ---- Mounted at /api/restaurants/:restaurantId ----

// Categories
restaurantMenuRouter.get("/categories", menuController.getCategories); // public
restaurantMenuRouter.post(
    "/categories",
    authMiddleware,
    requireRole("restaurant_owner"),
    menuController.createCategory
);

// Items
restaurantMenuRouter.get("/items", menuController.getMenuItems); // public
restaurantMenuRouter.post(
    "/items",
    authMiddleware,
    requireRole("restaurant_owner"),
    menuController.createMenuItem
);

// ---- Mounted at /api/menu-items ----

menuItemRouter.put(
    "/:id",
    authMiddleware,
    requireRole("restaurant_owner"),
    menuController.updateMenuItem
);
menuItemRouter.patch(
    "/:id/availability",
    authMiddleware,
    requireRole("restaurant_owner"),
    menuController.updateAvailability
);

module.exports = { restaurantMenuRouter, menuItemRouter };