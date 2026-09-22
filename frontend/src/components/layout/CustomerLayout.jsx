import CustomerHeader from "./CustomerHeader";

// Wraps a single page element with the shared customer header. Deliberately
// simple (no route nesting/Outlet change) so it drops into AppRouter.jsx as
// a one-line wrap around each existing <ProtectedRoute> element rather than
// restructuring the route tree.
const CustomerLayout = ({ children }) => (
    <div className="min-h-screen flex flex-col bg-background">
        <CustomerHeader />
        <main className="flex-1">{children}</main>
    </div>
);

export default CustomerLayout;