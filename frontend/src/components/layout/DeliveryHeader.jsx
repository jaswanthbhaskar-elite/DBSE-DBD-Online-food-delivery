import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const navLinkClass = ({ isActive }) =>
    `text-sm font-semibold transition-colors ${
        isActive ? "text-primary" : "text-ink hover:text-primary"
    }`;

// Previously, delivery-partner pages had no way to log out anywhere in
// the UI, and navigation back to the dashboard from an order-detail page
// relied on an inline text link. This header fixes both in one place,
// present on every delivery route.
const DeliveryHeader = () => {
    const { user, logout } = useAuth();

    return (
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border">
            <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
                <nav className="flex items-center gap-6">
                    <NavLink to="/delivery" end className={navLinkClass}>
                        Dashboard
                    </NavLink>
                    <NavLink to="/delivery/history" className={navLinkClass}>
                        Delivery History
                    </NavLink>
                </nav>

                <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline text-sm text-muted truncate max-w-[140px]">
                        {user?.name}
                    </span>
                    <button
                        type="button"
                        onClick={logout}
                        className="text-sm font-semibold text-muted hover:text-error transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
};

export default DeliveryHeader;