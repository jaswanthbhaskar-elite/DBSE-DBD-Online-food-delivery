// Thin wrapper around the Socket.io server instance.
//
// Controllers need to emit events (e.g. from trackingController /
// deliveryController) without requiring server.js directly, which would
// create a circular require (server.js requires the routes, which require
// the controllers, which would require server.js back). This module holds
// the single io instance so any file can call getIO() after init() has run
// once at startup.

let ioInstance = null;

function init(httpServer) {
    const { Server } = require("socket.io");

    ioInstance = new Server(httpServer, {
        cors: {
            origin: "*" // college project — open CORS for the socket connection too
        }
    });

    ioInstance.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        // A customer's frontend calls socket.emit("joinOrderRoom", orderId)
        // after fetching GET /api/tracking/orders/:orderId, so it only
        // receives location events for the order it's actually tracking.
        socket.on("joinOrderRoom", (orderId) => {
            socket.join(`order_${orderId}`);
        });

        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });
    });

    return ioInstance;
}

function getIO() {
    if (!ioInstance) {
        throw new Error("Socket.io has not been initialized. Call init(server) once in server.js before using getIO().");
    }
    return ioInstance;
}

module.exports = { init, getIO };