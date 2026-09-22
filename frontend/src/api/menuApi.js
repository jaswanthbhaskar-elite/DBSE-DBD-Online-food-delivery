import axios from "axios";

const RESTAURANTS_URL = "http://localhost:5000/api/restaurants";
const MENU_ITEMS_URL = "http://localhost:5000/api/menu-items";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

// ---- Categories ----

export const getCategories = async (restaurantId) => {
    const response = await axios.get(
        `${RESTAURANTS_URL}/${restaurantId}/categories`
    );
    return response.data;
};

export const createCategory = async (restaurantId, data) => {
    const response = await axios.post(
        `${RESTAURANTS_URL}/${restaurantId}/categories`,
        data,
        getAuthHeaders()
    );
    return response.data;
};

// ---- Menu items ----

export const getMenuItems = async (restaurantId) => {
    const response = await axios.get(
        `${RESTAURANTS_URL}/${restaurantId}/items`
    );
    return response.data;
};

export const createMenuItem = async (restaurantId, data) => {
    const response = await axios.post(
        `${RESTAURANTS_URL}/${restaurantId}/items`,
        data,
        getAuthHeaders()
    );
    return response.data;
};

export const updateMenuItem = async (itemId, data) => {
    const response = await axios.put(
        `${MENU_ITEMS_URL}/${itemId}`,
        data,
        getAuthHeaders()
    );
    return response.data;
};

export const updateItemAvailability = async (itemId, isAvailable) => {
    const response = await axios.patch(
        `${MENU_ITEMS_URL}/${itemId}/availability`,
        { is_available: isAvailable },
        getAuthHeaders()
    );
    return response.data;
};