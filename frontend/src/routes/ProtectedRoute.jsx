import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Wraps a route element. Reads auth state straight from AuthContext (no
// separate auth logic) and redirects based on isAuthenticated/user.role,
// which AuthContext already exposes.
const ProtectedRoute = ({ children, allowedRole }) => {
    const { isAuthenticated, user } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRole && user?.role !== allowedRole) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
};

export default ProtectedRoute;