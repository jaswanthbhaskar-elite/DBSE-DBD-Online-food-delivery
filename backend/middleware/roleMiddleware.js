// Reusable role-check middleware.
// Must run AFTER authMiddleware, since it depends on req.user being populated.
//
// Usage:
//   router.post("/restaurants", authMiddleware, requireRole("restaurant_owner"), controller.create);
//   router.post("/x", authMiddleware, requireRole("restaurant_owner", "admin"), controller.create);

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action."
            });
        }

        next();
    };
}

module.exports = requireRole;