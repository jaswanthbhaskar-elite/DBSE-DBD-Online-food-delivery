import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import CustomerLayout from "../components/layout/CustomerLayout";
import OwnerLayout from "../components/layout/OwnerLayout";
import DeliveryLayout from "../components/layout/DeliveryLayout";
import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import OwnerDashboardPage from "../pages/owner/OwnerDashboardPage";
import MenuManagementPage from "../pages/owner/MenuManagementPage";
import OwnerOrderHistoryPage from "../pages/owner/OwnerOrderHistoryPage";
import RestaurantListPage from "../pages/customer/RestaurantListPage";
import RestaurantMenuPage from "../pages/customer/RestaurantMenuPage";
import SmartFoodFinderPage from "../pages/customer/SmartFoodFinderPage";
import CartPage from "../pages/customer/CartPage";
import CheckoutPage from "../pages/customer/CheckoutPage";
import OrderHistoryPage from "../pages/customer/OrderHistoryPage";
import OrderDetailPage from "../pages/customer/OrderDetailPage";
import DeliveryDashboardPage from "../pages/delivery/DeliveryDashboardPage";
import DeliveryOrderDetailPage from "../pages/delivery/DeliveryOrderDetailPage";
import DeliveryHistoryPage from "../pages/delivery/DeliveryHistoryPage";
const UnauthorizedPage = () => (
    <h1>You are not authorized to access this page.</h1>
);

// Exported so LoginPage can redirect to the correct dashboard right after a
// successful login, without duplicating this mapping in two files.
export const ROLE_HOME = {
    restaurant_owner: "/owner",
    customer: "/customer",
    delivery_partner: "/delivery",
};

const AppRouter = () => {
    return (
        <BrowserRouter>
            <Routes>
                {/* Root route */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                {/* Authentication */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Restaurant Owner */}
                {/* Restaurant Owner — each page wrapped in OwnerLayout for a
                    consistent nav bar and logout, present on every owner
                    route (previously MenuManagementPage had no navigation
                    at all, and no owner page had a way to log out). */}
                <Route
                    path="/owner"
                    element={
                        <ProtectedRoute allowedRole="restaurant_owner">
                            <OwnerLayout>
                                <OwnerDashboardPage />
                            </OwnerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/owner/menu"
                    element={
                        <ProtectedRoute allowedRole="restaurant_owner">
                            <OwnerLayout>
                                <MenuManagementPage />
                            </OwnerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/owner/history"
                    element={
                        <ProtectedRoute allowedRole="restaurant_owner">
                            <OwnerLayout>
                                <OwnerOrderHistoryPage />
                            </OwnerLayout>
                        </ProtectedRoute>
                    }
                />

                {/* Customer — each page is wrapped in CustomerLayout for the
                    shared header/nav/cart-count bar. Route paths, guards,
                    and the page components themselves are unchanged. */}
                <Route
                    path="/customer"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <RestaurantListPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/restaurants/:restaurantId"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <RestaurantMenuPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/smart-food"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <SmartFoodFinderPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/cart"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <CartPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/checkout"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <CheckoutPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/orders"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <OrderHistoryPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/customer/orders/:orderId"
                    element={
                        <ProtectedRoute allowedRole="customer">
                            <CustomerLayout>
                                <OrderDetailPage />
                            </CustomerLayout>
                        </ProtectedRoute>
                    }
                />

                {/* Delivery Partner — each page wrapped in DeliveryLayout for a
                    consistent nav bar and logout, present on every
                    delivery route (previously no delivery page had a way
                    to log out anywhere in the UI). */}
                <Route
                    path="/delivery"
                    element={
                        <ProtectedRoute allowedRole="delivery_partner">
                            <DeliveryLayout>
                                <DeliveryDashboardPage />
                            </DeliveryLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/delivery/orders/:orderId"
                    element={
                        <ProtectedRoute allowedRole="delivery_partner">
                            <DeliveryLayout>
                                <DeliveryOrderDetailPage />
                            </DeliveryLayout>
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/delivery/history"
                    element={
                        <ProtectedRoute allowedRole="delivery_partner">
                            <DeliveryLayout>
                                <DeliveryHistoryPage />
                            </DeliveryLayout>
                        </ProtectedRoute>
                    }
                />

                {/* Unauthorized */}
                <Route path="/unauthorized" element={<UnauthorizedPage />} />
            </Routes>
        </BrowserRouter>
    );
};

export default AppRouter;