import axios from "axios";

const API_URL = "http://localhost:5000/api/restaurants";

// Small local helper so the Bearer header isn't rebuilt by hand in every
// function below. Reads the token the same way AuthContext stores it
// (localStorage key "token") — not a separate auth system, just avoids
// repeating this object literal five times.
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getRestaurants = async () => {
    const response = await axios.get(API_URL);
    return response.data;
};

export const getRestaurantById = async (id) => {
    const response = await axios.get(`${API_URL}/${id}`);
    return response.data;
};

export const getMyRestaurant = async () => {
    const response = await axios.get(`${API_URL}/mine`, getAuthHeaders());
    return response.data;
};

export const createRestaurant = async (data) => {
    const response = await axios.post(API_URL, data, getAuthHeaders());
    return response.data;
};

export const updateRestaurant = async (id, data) => {
    const response = await axios.put(`${API_URL}/${id}`, data, getAuthHeaders());
    return response.data;
};
export const getRestaurantOrders = async (status) => {
    const url = status
        ? `http://localhost:5000/api/restaurant/orders?status=${status}`
        : "http://localhost:5000/api/restaurant/orders";

    const response = await axios.get(url, getAuthHeaders());
    return response.data;
};

export const updateOrderStatus = async (id, status) => {
    const response = await axios.patch(
        `http://localhost:5000/api/restaurant/orders/${id}/status`,
        { status },
        getAuthHeaders()
    );

    return response.data;
};