const { io } = require("socket.io-client");

const socket = io("http://localhost:5000");

socket.on("connect", () => {
    console.log("Connected:", socket.id);

    // Join Order #3 room
    socket.emit("joinOrderRoom", 3);
});

socket.on("delivery:location", (data) => {
    console.log("delivery:location received:", data);
});