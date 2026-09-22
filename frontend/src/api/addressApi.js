import axios from "axios";

const API_URL = "http://localhost:5000/api/addresses";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getAddresses = async () => {
    const response = await axios.get(API_URL, getAuthHeaders());
    return response.data;
};

export const getAddressById = async (id) => {
    const response = await axios.get(`${API_URL}/${id}`, getAuthHeaders());
    return response.data;
};

export const createAddress = async (data) => {
    const response = await axios.post(API_URL, data, getAuthHeaders());
    return response.data;
};

export const updateAddress = async (id, data) => {
    const response = await axios.put(
        `${API_URL}/${id}`,
        data,
        getAuthHeaders()
    );
    return response.data;
};

export const deleteAddress = async (id) => {
    const response = await axios.delete(`${API_URL}/${id}`, getAuthHeaders());
    return response.data;
};

export const setDefaultAddress = async (id) => {
    const response = await axios.patch(
        `${API_URL}/${id}/default`,
        {},
        getAuthHeaders()
    );
    return response.data;
};