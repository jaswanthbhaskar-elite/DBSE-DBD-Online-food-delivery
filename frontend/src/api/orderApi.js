import axios from "axios";

const API_URL = "http://localhost:5000/api/orders";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const createOrder = async (data) => {
    const response = await axios.post(API_URL, data, getAuthHeaders());
    return response.data;
};

export const getOrders = async () => {
    const response = await axios.get(API_URL, getAuthHeaders());
    return response.data;
};

export const getOrderById = async (id) => {
    const response = await axios.get(`${API_URL}/${id}`, getAuthHeaders());
    return response.data;
};

export const cancelOrder = async (id) => {
    const response = await axios.patch(
        `${API_URL}/${id}/cancel`,
        {},
        getAuthHeaders()
    );
    return response.data;
};

export const confirmDelivery = async (id) => {
    const response = await axios.patch(
        `${API_URL}/${id}/confirm`,
        {},
        getAuthHeaders()
    );
    return response.data;
};