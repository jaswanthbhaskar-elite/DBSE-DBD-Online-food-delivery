import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

// Creates a fresh Socket.io connection using the already-installed
// socket.io-client. Intentionally not a global/shared singleton — the one
// current caller (the customer order detail page, only while an order is
// out_for_delivery) owns the connection's lifecycle and must call
// .disconnect() itself (in a useEffect cleanup) when tracking stops or the
// page is left, so nothing lingers connected in the background.
export const createSocketConnection = () => io(SOCKET_URL);