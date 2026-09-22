const express = require("express");
const router = express.Router();

const addressController = require("../controllers/addressController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

// Every address endpoint requires a logged-in customer.
router.use(authMiddleware, requireRole("customer"));

router.post("/", addressController.createAddress);
router.get("/", addressController.getAddresses);
router.get("/:id", addressController.getAddressById);
router.put("/:id", addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);
router.patch("/:id/default", addressController.setDefaultAddress);

module.exports = router;