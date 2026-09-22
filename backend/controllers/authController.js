const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const VALID_ROLES = ["customer", "restaurant_owner", "delivery_partner", "admin"];
const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "1d";

exports.register = (req, res) => {
    const { name, email, password, phone, role } = req.body;

    // 1. Validate all fields are provided
    if (!name || !email || !password || !phone || !role) {
        return res.status(400).json({
            success: false,
            message: "All fields (name, email, password, phone, role) are required."
        });
    }

    // 2. Validate role against allowed ENUM values
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
            success: false,
            message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
        });
    }

    // 3. Check whether email already exists
    const checkEmailQuery = "SELECT user_id FROM Users WHERE email = ?";
    db.query(checkEmailQuery, [email], (err, existingUsers) => {
        if (err) {
            console.error("Database error while checking email:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        // 4. Hash the password (never store plaintext)
        bcrypt.hash(password, SALT_ROUNDS, (hashErr, password_hash) => {
            if (hashErr) {
                console.error("Error hashing password:", hashErr.message);
                return res.status(500).json({
                    success: false,
                    message: "Something went wrong. Please try again later."
                });
            }

            // 5. Insert the new user
            const insertQuery = `
                INSERT INTO Users (name, email, password_hash, phone, role)
                VALUES (?, ?, ?, ?, ?)
            `;
            db.query(insertQuery, [name, email, password_hash, phone, role], (insertErr, result) => {
                if (insertErr) {
                    // Catch duplicate phone (UNIQUE constraint) separately from other DB errors
                    if (insertErr.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({
                            success: false,
                            message: "An account with this phone number already exists."
                        });
                    }

                    console.error("Database error while inserting user:", insertErr.message);
                    return res.status(500).json({
                        success: false,
                        message: "Database error. Please try again later."
                    });
                }

                // 6. Return a clean success response
                return res.status(201).json({
                    success: true,
                    message: "User registered successfully.",
                    user: {
                        user_id: result.insertId,
                        name,
                        email,
                        phone,
                        role
                    }
                });
            });
        });
    });
};

exports.login = (req, res) => {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    // 2. Find the user by email
    const findUserQuery = "SELECT * FROM Users WHERE email = ?";
    db.query(findUserQuery, [email], (err, results) => {
        if (err) {
            console.error("Database error while finding user:", err.message);
            return res.status(500).json({
                success: false,
                message: "Database error. Please try again later."
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = results[0];

        // 3. Check the account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: "This account has been deactivated."
            });
        }

        // 4. Compare supplied password with the stored hash
        bcrypt.compare(password, user.password_hash, (compareErr, isMatch) => {
            if (compareErr) {
                console.error("Error comparing password:", compareErr.message);
                return res.status(500).json({
                    success: false,
                    message: "Something went wrong. Please try again later."
                });
            }

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password."
                });
            }

            // 5. Credentials valid — issue a JWT
            const tokenPayload = {
                user_id: user.user_id,
                role: user.role,
                email: user.email
            };

            jwt.sign(
                tokenPayload,
                process.env.JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN },
                (signErr, token) => {
                    if (signErr) {
                        console.error("Error signing JWT:", signErr.message);
                        return res.status(500).json({
                            success: false,
                            message: "Something went wrong. Please try again later."
                        });
                    }

                    // 6. Return token + safe user info (never password_hash)
                    return res.status(200).json({
                        success: true,
                        message: "Login successful",
                        token,
                        user: {
                            user_id: user.user_id,
                            name: user.name,
                            email: user.email,
                            phone: user.phone,
                            role: user.role
                        }
                    });
                }
            );
        });
    });
};