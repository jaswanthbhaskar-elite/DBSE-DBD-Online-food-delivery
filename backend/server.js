require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");                                   // NEW
const db = require("./db");
const socket = require("./socket");                              // NEW

const authRoutes = require("./routes/authRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const { restaurantMenuRouter, menuItemRouter } = require("./routes/menuRoutes");
const addressRoutes = require("./routes/addressRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const restaurantOrderRoutes = require("./routes/restaurantOrderRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const trackingRoutes = require("./routes/trackingRoutes");       // NEW
const paymentRoutes = require("./routes/paymentRoutes");         // NEW
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/restaurants/:restaurantId", restaurantMenuRouter);
app.use("/api/menu-items", menuItemRouter);
app.use("/api/addresses", addressRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/restaurant/orders", restaurantOrderRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/tracking", trackingRoutes);                        // NEW
app.use("/api/payments", paymentRoutes);                         // NEW
app.use("/api/reviews", reviewRoutes);
app.use("/api/smart-food", require("./routes/smartFoodRoutes"));
const PORT = 5000;

app.get("/", (req, res) => {
    res.json({ message: "Online Food Delivery API is running!" });
});

// NEW: Express alone can't host Socket.io — it needs the raw http.Server
// instance, so app.listen(...) is replaced with an explicit http.createServer(app)
// that both Express and Socket.io attach to.
const server = http.createServer(app);                           // NEW
socket.init(server);                                              // NEW

server.listen(PORT, () => {                                       // CHANGED (was app.listen)
    console.log(`Server running on http://localhost:${PORT}`);
});