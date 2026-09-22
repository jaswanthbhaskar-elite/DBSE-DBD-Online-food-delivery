import axios from "axios";

const API_URL = "http://localhost:5000/api/payments";

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

// Starts a demo payment for an existing order. paymentMethod is one of
// "upi" | "qr" | "card" | "cod". Returns a demo transaction_ref and, for
// upi/qr, a upi_payload string to render as a QR code. No real gateway is
// involved anywhere in this call.
export const createDemoPayment = async (orderId, paymentMethod) => {
    const response = await axios.post(
        `${API_URL}/orders/${orderId}/create`,
        { payment_method: paymentMethod },
        getAuthHeaders()
    );
    return response.data;
};

// Completes a demo upi/qr/card payment. Never called for COD — COD has
// nothing to verify online. Only this call can ever mark a payment
// "success" — the frontend never claims success on its own.
export const verifyDemoPayment = async (orderId) => {
    const response = await axios.post(
        `${API_URL}/verify`,
        { order_id: orderId },
        getAuthHeaders()
    );
    return response.data;
};