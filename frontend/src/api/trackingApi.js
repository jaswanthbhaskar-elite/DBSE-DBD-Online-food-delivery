import axios from "axios";

const API_URL = "http://localhost:5000/api/tracking";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

// Reuses the existing GET /api/tracking/orders/:orderId — returns restaurant,
// delivery address, and delivery partner coordinates plus order_status.
export const getOrderTracking = async (orderId) => {
    const response = await axios.get(
        `${API_URL}/orders/${orderId}`,
        getAuthHeaders()
    );
    return response.data;
};