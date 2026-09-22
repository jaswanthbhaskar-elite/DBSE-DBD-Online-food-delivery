import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../routes/AppRouter";

// Customer signup only — role is fixed, not exposed as a selector, since
// this button is specifically for new customers (per the request). Owner
// and delivery-partner accounts aren't created through this page.
const CUSTOMER_ROLE = "customer";

function RegisterPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.");
            return;
        }

        setLoading(true);
        try {
            await registerUser({
                name,
                email,
                phone,
                password,
                role: CUSTOMER_ROLE,
            });

            // registerUser doesn't return a token (only login does), so log
            // the customer in immediately with the credentials they just
            // set, rather than sending them back to a blank login form
            // right after they finished filling one out.
            const data = await login(email, password);
            navigate(ROLE_HOME[data.user.role] || "/customer", {
                replace: true,
            });
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    "Registration failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-card p-6 flex flex-col gap-4"
            >
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Online Food Delivery
                </p>
                <h1 className="text-center text-2xl font-semibold text-ink -mt-1">
                    Create your account
                </h1>

                <div>
                    <label htmlFor="name">Full name</label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
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
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
                </div>

                <div>
                    <label htmlFor="phone">Phone number</label>
                    <input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter your phone number"
                        required
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
                </div>

                <div>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
                </div>

                <div>
                    <label htmlFor="confirmPassword">Confirm password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="h-10 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? "Creating account..." : "Register"}
                </button>

                {error && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                        {error}
                    </p>
                )}

                <p className="text-center text-sm text-muted">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="font-semibold text-primary hover:text-primary-hover transition-colors"
                    >
                        Login
                    </Link>
                </p>
            </form>
        </div>
    );
}

export default RegisterPage;