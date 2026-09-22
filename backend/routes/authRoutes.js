const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);

// Protected test route — used to verify the JWT middleware works.
// Not part of the requested login feature itself, just a way to exercise it.
router.get("/me", authMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid.",
        user: req.user
    });
});

module.exports = router;