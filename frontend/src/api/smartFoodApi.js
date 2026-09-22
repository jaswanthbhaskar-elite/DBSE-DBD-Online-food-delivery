import axios from "axios";

const API_URL = "http://localhost:5000/api/smart-food";

// Public endpoint — no auth header, matching getRestaurants/getMenuItems
// (also public reads). maxTime is optional; omit it entirely from the
// query string rather than sending an empty param when not provided.
export const getSmartFoodRecommendations = async (budget, maxTime) => {
    const params = { budget };
    if (maxTime !== undefined && maxTime !== null && maxTime !== "") {
        params.maxTime = maxTime;
    }

    const response = await axios.get(API_URL, { params });
    return response.data;
};