// Route wiring for the Smart Food Finder feature.
//
// I don't have access to this project's actual routes/ directory or main
// app.js/server.js file (only the controllers were shared), so this file
// is written to the standard Express Router convention that matches how
// every controller in this project exports its handlers
// (exports.someHandler = (req, res) => {...}), but you'll need to confirm
// it matches your actual routes/ file naming and mounting style, and add
// the one line below to your main app file yourself.
//
// In your main app/server file, alongside your other app.use(...) lines
// for /api/restaurants, /api/menu-items, etc., add:
//
//   app.use("/api/smart-food", require("./routes/smartFoodRoutes"));
//
// No auth middleware is applied here — this matches the public read
// endpoints already in this project (GET /api/restaurants,
// GET /api/restaurants/:id/items), since Smart Food Finder is a read-only
// recommendation lookup with no user-specific data.

const express = require("express");
const router = express.Router();
const smartFoodController = require("../controllers/smartFoodController");

// GET /api/smart-food?budget=200&maxTime=30
router.get("/", smartFoodController.getSmartFoodRecommendations);

module.exports = router;