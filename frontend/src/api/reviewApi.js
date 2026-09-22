import axios from "axios";

const API_URL = "http://localhost:5000/api/reviews";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getOrderReviews = async (orderId) => {
    const response = await axios.get(
        `${API_URL}/order/${orderId}`,
        getAuthHeaders()
    );
    return response.data;
};

export const submitRestaurantReview = async (orderId, rating, comment) => {
    const response = await axios.post(
        `${API_URL}/restaurant`,
        { order_id: orderId, rating, comment },
        getAuthHeaders()
    );
    return response.data;
};

export const submitDeliveryPartnerReview = async (orderId, rating, comment) => {
    const response = await axios.post(
        `${API_URL}/delivery-partner`,
        { order_id: orderId, rating, comment },
        getAuthHeaders()
    );
    return response.data;
};