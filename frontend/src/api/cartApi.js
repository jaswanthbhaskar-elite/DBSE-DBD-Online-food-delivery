import axios from "axios";

const API_URL = "http://localhost:5000/api/cart";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getCart = async () => {
    const response = await axios.get(API_URL, getAuthHeaders());
    return response.data;
};

export const addItemToCart = async (restaurantId, itemId, quantity) => {
    const response = await axios.post(
        `${API_URL}/items`,
        { restaurant_id: restaurantId, item_id: itemId, quantity },
        getAuthHeaders()
    );
    return response.data;
};

export const updateCartItemQuantity = async (itemId, quantity) => {
    const response = await axios.put(
        `${API_URL}/items/${itemId}`,
        { quantity },
        getAuthHeaders()
    );
    return response.data;
};

export const removeCartItem = async (itemId) => {
    const response = await axios.delete(
        `${API_URL}/items/${itemId}`,
        getAuthHeaders()
    );
    return response.data;
};

export const clearCart = async () => {
    const response = await axios.delete(API_URL, getAuthHeaders());
    return response.data;
};