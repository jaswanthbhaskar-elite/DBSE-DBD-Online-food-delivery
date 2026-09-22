import { useEffect, useState, useCallback } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getCart } from "../../api/cartApi";

// Small brand mark — a fork/plate glyph, no image asset required so it
// never has a broken-image state of its own.
const BrandMark = () => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="w-6 h-6 text-primary"
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 7v5a2 2 0 0 0 4 0V7" strokeLinecap="round" />
        <path d="M16 7v10" strokeLinecap="round" />
        <path d="M16 7c1.5 0 2.5 1.2 2.5 3S17.5 13 16 13" strokeLinecap="round" />
    </svg>
);

const navLinkClass = ({ isActive }) =>
    `text-sm font-semibold transition-colors ${
        isActive ? "text-primary" : "text-ink hover:text-primary"
    }`;

const CustomerHeader = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [cartCount, setCartCount] = useState(0);

    // Read-only cart count for the badge — no cart mutation lives here, so
    // this can't drift from the actual cart logic in CartPage/menu pages.
    // Re-fetched on every route change so leaving the cart page (after
    // adding/removing items) keeps the badge accurate without a shared
    // cart context or any change to the existing cart endpoints.
    const refreshCartCount = useCallback(async () => {
        try {
            const data = await getCart();
            const count = (data.items || []).reduce(
                (sum, item) => sum + item.quantity,
                0
            );
            setCartCount(count);
        } catch {
            // Not logged in yet, no cart, or a transient error — the badge
            // simply stays at its last known value rather than surfacing
            // an error in the header.
        }
    }, []);

    useEffect(() => {
        refreshCartCount();
    }, [location.pathname, refreshCartCount]);

    return (
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
                <Link to="/customer" className="flex items-center gap-2 shrink-0">
                    <BrandMark />
                    <span className="text-lg font-bold text-ink tracking-tight">
                        
                    </span>
                </Link>

                <nav className="hidden sm:flex items-center gap-6">
                    <NavLink to="/customer" end className={navLinkClass}>
                        Restaurants
                    </NavLink>
                    <NavLink to="/customer/smart-food" className={navLinkClass}>
                        Smart Finder
                    </NavLink>
                    <NavLink to="/customer/orders" className={navLinkClass}>
                        Orders
                    </NavLink>
                </nav>

                <div className="flex items-center gap-4 sm:gap-5">
                    <Link
                        to="/customer/cart"
                        className="relative flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-primary transition-colors"
                        aria-label={`Cart, ${cartCount} item${
                            cartCount === 1 ? "" : "s"
                        }`}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="w-5 h-5"
                        >
                            <circle cx="9" cy="20" r="1.4" />
                            <circle cx="18" cy="20" r="1.4" />
                            <path
                                d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <span className="hidden sm:inline">Cart</span>
                        {cartCount > 0 && (
                            <span className="absolute -top-2 -right-2.5 sm:static sm:top-auto sm:right-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
                                {cartCount}
                            </span>
                        )}
                    </Link>

                    <div className="hidden md:flex items-center gap-3 pl-4 border-l border-border">
                        <span className="text-sm text-muted truncate max-w-[120px]">
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

                    <button
                        type="button"
                        onClick={logout}
                        className="md:hidden text-sm font-semibold text-muted hover:text-error transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Restaurants / Smart Finder / Orders links, visible below the sm breakpoint */}
            <nav className="sm:hidden flex items-center gap-5 px-6 h-11 border-t border-border">
                <NavLink to="/customer" end className={navLinkClass}>
                    Restaurants
                </NavLink>
                <NavLink to="/customer/smart-food" className={navLinkClass}>
                    Smart Finder
                </NavLink>
                <NavLink to="/customer/orders" className={navLinkClass}>
                    Orders
                </NavLink>
            </nav>
        </header>
    );
};

export default CustomerHeader;