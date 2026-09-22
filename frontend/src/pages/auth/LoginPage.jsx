import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../routes/AppRouter";

// Purely presentational role tabs — they change the page's icon, accent
// color, and subtitle so it doesn't feel like one generic form regardless
// of who's signing in. They do NOT gate or validate login in any way: the
// actual account role is (and always was) determined entirely server-side
// from the email/password, and the existing ROLE_HOME redirect below
// still sends the person to whichever dashboard their real account role
// maps to — even if that doesn't match the tab they happened to have
// selected. This keeps 100% of the original auth behavior unchanged.
//
// Colors reuse the app's existing design tokens (primary/warning/success)
// rather than introducing new ones, since there's no dedicated 4th brand
// color defined anywhere in the project.
const ROLE_THEMES = {
    customer: {
        label: "Customer",
        subtitle: "Sign in to browse restaurants, order food, and track your delivery.",
        accentText: "text-primary",
        accentBg: "bg-primary",
        accentBorder: "border-primary",
        accentSoftBg: "bg-primary/8",
        inputFocusClass: "focus:border-primary",
        showRegister: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <path d="M6 7h12l-1 13H7L6 7z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 7a3 3 0 0 1 6 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    restaurant_owner: {
        label: "Restaurant Owner",
        subtitle: "Sign in to manage your restaurant, menu, and incoming orders.",
        accentText: "text-warning",
        accentBg: "bg-warning",
        accentBorder: "border-warning",
        accentSoftBg: "bg-warning-bg",
        inputFocusClass: "focus:border-warning",
        showRegister: false,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <path d="M3 9l1.5-5h15L21 9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 9v11h16V9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 9a3 3 0 0 0 6 0M9 9a3 3 0 0 0 6 0M15 9a3 3 0 0 0 6 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    delivery_partner: {
        label: "Delivery Partner",
        subtitle: "Sign in to view and deliver your assigned orders.",
        accentText: "text-success",
        accentBg: "bg-success",
        accentBorder: "border-success",
        accentSoftBg: "bg-success-bg",
        inputFocusClass: "focus:border-success",
        showRegister: false,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="17" r="3" />
                <path d="M6 17l3-8h5l3 5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 9h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
};

function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [selectedRole, setSelectedRole] = useState("customer");
    const theme = ROLE_THEMES[selectedRole];

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");
        setLoading(true);

        try {
            const data = await login(email, password);

            // Phase 2 fix: navigate to the role-appropriate dashboard right
            // after a successful login instead of staying on /login. This
            // always uses the account's REAL role from the server, not
            // whichever tab was visually selected above.
            navigate(ROLE_HOME[data.user.role] || "/login", { replace: true });
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Login failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-sm">
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {Object.entries(ROLE_THEMES).map(([key, roleTheme]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedRole(key)}
                            className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-md border text-[11px] font-semibold leading-tight transition-colors ${
                                selectedRole === key
                                    ? `${roleTheme.accentBorder} ${roleTheme.accentSoftBg} ${roleTheme.accentText}`
                                    : "border-border text-muted hover:border-ink/20"
                            }`}
                        >
                            {roleTheme.icon}
                            {roleTheme.label}
                        </button>
                    ))}
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-surface border border-border rounded-lg shadow-card p-6 flex flex-col gap-4"
                >
                    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
                        Online Food Delivery
                    </p>
                    <div className="text-center -mt-1">
                        <div
                            className={`inline-flex items-center justify-center w-10 h-10 rounded-full mb-2 ${theme.accentSoftBg} ${theme.accentText}`}
                        >
                            {theme.icon}
                        </div>
                        <h1 className="text-2xl font-semibold text-ink">
                            {theme.label} Login
                        </h1>
                        <p className="text-sm text-muted mt-1">
                            {theme.subtitle}
                        </p>
                    </div>

                    <div>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            className={`w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none ${theme.inputFocusClass} focus:ring-3 focus:ring-primary/15`}
                        />
                    </div>

                    <div>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            className={`w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none ${theme.inputFocusClass} focus:ring-3 focus:ring-primary/15`}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`h-10 rounded-sm font-semibold text-sm text-white transition-all hover:not-disabled:opacity-90 active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${theme.accentBg}`}
                    >
                        {loading ? "Logging in..." : `Login as ${theme.label}`}
                    </button>

                    {error && (
                        <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                            {error}
                        </p>
                    )}

                    {theme.showRegister ? (
                        <p className="text-center text-sm text-muted">
                            New here?{" "}
                            <Link
                                to="/register"
                                className="font-semibold text-primary hover:text-primary-hover transition-colors"
                            >
                                Register
                            </Link>
                        </p>
                    ) : (
                        <p className="text-center text-xs text-muted">
                            {theme.label} accounts are set up by the platform —
                            contact support if you need access.
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
}

export default LoginPage;