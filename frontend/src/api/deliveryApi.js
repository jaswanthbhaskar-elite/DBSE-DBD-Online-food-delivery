import axios from "axios";

const API_URL = "http://localhost:5000/api/delivery";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getAssignedOrders = async () => {
    const response = await axios.get(`${API_URL}/orders`, getAuthHeaders());
    return response.data;
};

export const getAssignedOrderById = async (id) => {
    const response = await axios.get(
        `${API_URL}/orders/${id}`,
        getAuthHeaders()
    );
    return response.data;
};

export const createDeliveryProfile = async (data) => {
    const response = await axios.post(
        `${API_URL}/profile`,
        data,
        getAuthHeaders()
    );
    return response.data;
};

export const getAvailableOrders = async () => {
    const response = await axios.get(
        `${API_URL}/available-orders`,
        getAuthHeaders()
    );
    return response.data;
};

export const acceptOrder = async (id) => {
    const response = await axios.patch(
        `${API_URL}/orders/${id}/accept`,
        {},
        getAuthHeaders()
    );
    return response.data;
};

export const updateDeliveryOrderStatus = async (id, status) => {
    const response = await axios.patch(
        `${API_URL}/orders/${id}/status`,
        { status },
        getAuthHeaders()
    );
    return response.data;
};

// Reuses the existing PATCH /api/delivery/location — backend already
// rejects this (409) unless the partner has an active current_order_id, and
// already emits the update over the existing order_${orderId} Socket.io
// room on success.
export const updateLocation = async (latitude, longitude) => {
    const response = await axios.patch(
        `${API_URL}/location`,
        { latitude, longitude },
        getAuthHeaders()
    );
    return response.data;
};

// Toggles the logged-in delivery partner's online/offline status. Going
// online has no restrictions; going offline is rejected by the backend
// (409) if the partner currently has an active order — the caller should
// surface that error message, not attempt to force it through.
export const updateOnlineStatus = async (isOnline) => {
    const response = await axios.patch(
        `${API_URL}/online-status`,
        { is_online: isOnline },
        getAuthHeaders()
    );
    return response.data;
};