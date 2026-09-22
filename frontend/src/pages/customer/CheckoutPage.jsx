import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { getCart } from "../../api/cartApi";
import { getAddresses, createAddress } from "../../api/addressApi";
import { createOrder } from "../../api/orderApi";
import { geocodeAddress } from "../../api/geocodingApi";
import { createDemoPayment, verifyDemoPayment } from "../../api/paymentApi";
import ImageWithFallback from "../../components/common/ImageWithFallback";
import AddressLocationPicker from "../../components/map/AddressLocationPicker";
import { FLAT_DELIVERY_FEE } from "../../constants/pricing";

const emptyAddressForm = {
    label: "",
    address_line: "",
    city: "",
    state: "",
    pincode: "",
};

const emptyCardForm = { number: "", expiry: "", cvv: "", name: "" };

const PAYMENT_METHODS = [
    { id: "upi", label: "UPI" },
    { id: "qr", label: "QR Code" },
    { id: "card", label: "Card" },
    { id: "cod", label: "Cash on Delivery" },
];

const CHECKOUT_STEPS = ["Address", "Order Summary", "Payment", "Confirmation"];

// Purely presentational — highlights how far along the checkout flow the
// customer is. Doesn't drive any logic; each render branch below just
// passes in which step index applies to that branch.
const CheckoutSteps = ({ activeIndex }) => (
    <div className="flex items-center mb-8">
        {CHECKOUT_STEPS.map((label, index) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                    <div
                        className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            index <= activeIndex
                                ? "bg-primary text-white"
                                : "bg-background border border-border text-muted"
                        }`}
                    >
                        {index < activeIndex ? "✓" : index + 1}
                    </div>
                    <span
                        className={`hidden sm:inline text-xs font-semibold whitespace-nowrap ${
                            index <= activeIndex ? "text-ink" : "text-muted"
                        }`}
                    >
                        {label}
                    </span>
                </div>
                {index < CHECKOUT_STEPS.length - 1 && (
                    <div
                        className={`h-px flex-1 mx-3 transition-colors ${
                            index < activeIndex ? "bg-primary" : "bg-border"
                        }`}
                    />
                )}
            </div>
        ))}
    </div>
);

const CheckoutPage = () => {
    const [cart, setCart] = useState(null);
    const [items, setItems] = useState([]);
    const [subtotal, setSubtotal] = useState(0);

    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [showAddressForm, setShowAddressForm] = useState(false);
    const [addressForm, setAddressForm] = useState(emptyAddressForm);
    const [pickedLocation, setPickedLocation] = useState(null); // [lat, lng] | null
    const [locationSource, setLocationSource] = useState(null); // "auto" | "manual" | null
    const [locationPrecision, setLocationPrecision] = useState(null); // "exact" | "area" | "city" | null (only meaningful when locationSource === "auto")
    const [geocoding, setGeocoding] = useState(false);
    const [savingAddress, setSavingAddress] = useState(false);
    const [addressFormError, setAddressFormError] = useState(null);

    // Auto-geocodes the typed address as the customer fills in the form, so
    // they never have to manually tap the map — it just points to the
    // right place once enough of the address is typed. Debounced (900ms
    // after the last keystroke) so it doesn't fire on every character, and
    // only overwrites the pin if the customer hasn't manually adjusted it
    // for the current form session (a manual tap always wins).
    //
    // geocodeAddress tries progressively broader queries (see
    // geocodingApi.js) and reports back how precise the match was.
    // Informal home addresses often only resolve at "area" or "city"
    // precision — Nominatim/OpenStreetMap simply doesn't have structured
    // street-level data for many of them, especially in India, the same
    // way it does for named places like malls and hotels. Rather than
    // silently presenting a rough city-level guess as if it were the exact
    // address, the precision is surfaced to the customer so they know to
    // fine-tune it with a tap when it isn't exact.
    useEffect(() => {
        if (!showAddressForm) return undefined;
        if (locationSource === "manual") return undefined;

        const hasEnoughToSearch =
            addressForm.address_line.trim() || addressForm.city.trim();
        if (!hasEnoughToSearch) {
            setPickedLocation(null);
            setLocationSource(null);
            setLocationPrecision(null);
            return undefined;
        }

        setGeocoding(true);
        const timeoutId = setTimeout(async () => {
            const result = await geocodeAddress(addressForm);
            setGeocoding(false);
            if (result) {
                setPickedLocation([result.latitude, result.longitude]);
                setLocationSource("auto");
                setLocationPrecision(result.precision);
            }
            // A failed/empty geocode intentionally leaves any existing pin
            // in place rather than clearing it — the map (with its
            // tap-to-adjust fallback) is always the source of truth for
            // what actually gets saved.
        }, 900);

        return () => {
            clearTimeout(timeoutId);
            setGeocoding(false);
        };
    }, [
        showAddressForm,
        addressForm.address_line,
        addressForm.city,
        addressForm.state,
        addressForm.pincode,
        locationSource,
    ]);

    const [placingOrder, setPlacingOrder] = useState(false);
    const [orderError, setOrderError] = useState(null);
    const [placedOrder, setPlacedOrder] = useState(null);

    // Demo payment state. unpaidOrder holds an order that's been created but
    // not yet paid for — kept separate from placedOrder, which only becomes
    // set once a payment is actually confirmed (verified for upi/qr/card,
    // or recorded pending for cod).
    const [unpaidOrder, setUnpaidOrder] = useState(null);
    const [selectedMethod, setSelectedMethod] = useState(null);
    const [paymentSession, setPaymentSession] = useState(null); // {transaction_ref, upi_payload, amount}
    const [creatingPayment, setCreatingPayment] = useState(false);
    const [verifyingPayment, setVerifyingPayment] = useState(false);
    const [paymentError, setPaymentError] = useState(null);
    const [cardForm, setCardForm] = useState(emptyCardForm);
    const [cardFormError, setCardFormError] = useState(null);

    const loadCheckoutData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [cartData, addressData] = await Promise.all([
                getCart(),
                getAddresses(),
            ]);

            setCart(cartData.cart);
            setItems(cartData.items);
            setSubtotal(cartData.subtotal);
            setAddresses(addressData.addresses);

            const defaultAddress = addressData.addresses.find(
                (a) => a.is_default
            );
            setSelectedAddressId(
                defaultAddress?.address_id ||
                    addressData.addresses[0]?.address_id ||
                    null
            );
        } catch (err) {
            setError(
                err.response?.data?.message ||
                    "Failed to load checkout information."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCheckoutData();
    }, []);

    const handleAddressFormChange = (field, value) => {
        setAddressForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveAddress = async (e) => {
        e.preventDefault();
        const { label, address_line, city, state, pincode } = addressForm;
        if (!label.trim() || !address_line.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
            setAddressFormError("All fields are required.");
            return;
        }
        if (!pickedLocation) {
            setAddressFormError(
                "We couldn't automatically locate this address. Please tap the map below to set your delivery location manually."
            );
            return;
        }

        setSavingAddress(true);
        setAddressFormError(null);
        try {
            const data = await createAddress({
                ...addressForm,
                latitude: pickedLocation[0],
                longitude: pickedLocation[1],
            });
            setAddressForm(emptyAddressForm);
            setPickedLocation(null);
            setLocationSource(null);
            setLocationPrecision(null);
            setShowAddressForm(false);

            const refreshed = await getAddresses();
            setAddresses(refreshed.addresses);
            setSelectedAddressId(data.address.address_id);
        } catch (err) {
            setAddressFormError(
                err.response?.data?.message || "Failed to save address."
            );
        } finally {
            setSavingAddress(false);
        }
    };

    const handlePlaceOrder = async () => {
        if (!selectedAddressId) {
            setOrderError("Please select a delivery address.");
            return;
        }

        setPlacingOrder(true);
        setOrderError(null);
        try {
            const data = await createOrder({
                address_id: selectedAddressId,
                delivery_fee: FLAT_DELIVERY_FEE,
            });
            // Order now exists in the database — cart is already cleared by
            // the backend. The demo payment step happens next.
            setUnpaidOrder(data.order);
        } catch (err) {
            setOrderError(
                err.response?.data?.message || "Failed to place order."
            );
        } finally {
            setPlacingOrder(false);
        }
    };

    // ---- Demo payment handlers ----

    const handleSelectMethod = async (methodId) => {
        setSelectedMethod(methodId);
        setPaymentError(null);
        setPaymentSession(null);
        setCardForm(emptyCardForm);
        setCardFormError(null);

        if (methodId === "upi" || methodId === "qr") {
            setCreatingPayment(true);
            try {
                const data = await createDemoPayment(
                    unpaidOrder.order_id,
                    methodId
                );
                setPaymentSession(data);
            } catch (err) {
                setPaymentError(
                    err.response?.data?.message ||
                        "Failed to start payment. Please try again."
                );
            } finally {
                setCreatingPayment(false);
            }
        }
        // Card: wait for the form to be submitted before calling the API.
        // COD: wait for explicit confirmation click before calling the API.
    };

    // "I've Paid" — used for both UPI and QR.
    const handleConfirmUpiPayment = async () => {
        setVerifyingPayment(true);
        setPaymentError(null);
        try {
            const data = await verifyDemoPayment(unpaidOrder.order_id);
            setPlacedOrder({
                ...unpaidOrder,
                payment_method: selectedMethod,
                transaction_id: data.transaction_id,
                payment_status_label: "SUCCESS",
            });
            setUnpaidOrder(null);
        } catch (err) {
            setPaymentError(
                err.response?.data?.message ||
                    "Payment verification failed. Please try again."
            );
        } finally {
            setVerifyingPayment(false);
        }
    };

    const handleCardFormChange = (field, value) => {
        setCardForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleCardPay = async (e) => {
        e.preventDefault();

        const digitsOnly = cardForm.number.replace(/\s/g, "");
        if (!/^\d{16}$/.test(digitsOnly)) {
            setCardFormError("Enter a 16-digit demo card number.");
            return;
        }
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardForm.expiry)) {
            setCardFormError("Enter expiry as MM/YY.");
            return;
        }
        if (!/^\d{3,4}$/.test(cardForm.cvv)) {
            setCardFormError("Enter a 3 or 4 digit CVV.");
            return;
        }
        if (!cardForm.name.trim()) {
            setCardFormError("Enter the cardholder name.");
            return;
        }
        setCardFormError(null);
        setPaymentError(null);

        // Card details never leave this component — only used for the
        // format checks above. Nothing card-related is sent to the backend.
        setCreatingPayment(true);
        try {
            await createDemoPayment(unpaidOrder.order_id, "card");
            setCreatingPayment(false);
            setVerifyingPayment(true);

            // Simulated processing delay — purely cosmetic realism, no data
            // involved beyond the already-created pending Payments row.
            setTimeout(async () => {
                try {
                    const data = await verifyDemoPayment(unpaidOrder.order_id);
                    setPlacedOrder({
                        ...unpaidOrder,
                        payment_method: "card",
                        transaction_id: data.transaction_id,
                        payment_status_label: "SUCCESS",
                    });
                    setUnpaidOrder(null);
                } catch (err) {
                    setPaymentError(
                        err.response?.data?.message ||
                            "Payment failed. Please try again."
                    );
                } finally {
                    setVerifyingPayment(false);
                }
            }, 1200);
        } catch (err) {
            setCreatingPayment(false);
            setPaymentError(
                err.response?.data?.message ||
                    "Failed to process payment. Please try again."
            );
        }
    };

    const handleConfirmCod = async () => {
        setCreatingPayment(true);
        setPaymentError(null);
        try {
            const data = await createDemoPayment(unpaidOrder.order_id, "cod");
            setPlacedOrder({
                ...unpaidOrder,
                payment_method: "cod",
                transaction_id: data.transaction_ref,
                payment_status_label: "PENDING — pay at delivery",
            });
            setUnpaidOrder(null);
        } catch (err) {
            setPaymentError(
                err.response?.data?.message ||
                    "Failed to place Cash on Delivery order."
            );
        } finally {
            setCreatingPayment(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-muted py-4">
                    Loading checkout...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                    {error}
                </p>
            </div>
        );
    }

    // Order created AND payment confirmed (verified for upi/qr/card, or
    // recorded pending for cod) — show confirmation.
    if (placedOrder) {
        const isCod = placedOrder.payment_method === "cod";
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <CheckoutSteps activeIndex={3} />
                <div className="bg-surface border border-border rounded-lg shadow-card p-6 text-center">
                    <p
                        className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                            isCod ? "text-warning" : "text-success"
                        }`}
                    >
                        {isCod ? "Order Confirmed" : "Payment Successful ✓"}
                    </p>
                    <h1 className="text-2xl font-semibold text-ink mb-4">
                        Order #{placedOrder.order_id}
                    </h1>

                    <div className="bg-background border border-border rounded-lg p-4 text-left text-sm flex flex-col gap-1.5 mb-6">
                        <div className="flex items-center justify-between">
                            <span className="text-muted">
                                {isCod ? "Amount Due" : "Amount Paid"}
                            </span>
                            <span className="font-semibold text-ink">
                                ₹{placedOrder.total_amount}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">
                                Payment Method
                            </span>
                            <span className="font-semibold text-ink uppercase">
                                {placedOrder.payment_method}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">
                                Transaction ID
                            </span>
                            <span className="font-semibold text-ink">
                                {placedOrder.transaction_id}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Status</span>
                            <span className="font-semibold text-ink">
                                {placedOrder.payment_status_label}
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-muted mb-6">
                        This is a demo payment for a college project. No real
                        money was transferred.
                    </p>

                    <div className="flex items-center justify-center gap-3">
                        <Link
                            to="/customer"
                            className="h-10 px-4 flex items-center rounded-sm font-semibold text-sm text-ink bg-surface border border-border transition-colors hover:border-primary hover:text-primary"
                        >
                            Continue Shopping
                        </Link>
                        <Link
                            to={`/customer/orders/${placedOrder.order_id}`}
                            className="h-10 px-4 flex items-center rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:bg-primary-hover"
                        >
                            View Order
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Order exists in the database but no payment has been confirmed yet.
    // Checked BEFORE the empty-cart check below, since the backend already
    // clears the cart once the order is created — an empty cart here
    // doesn't mean anything went wrong.
    if (unpaidOrder) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <CheckoutSteps activeIndex={2} />
                <div className="bg-surface border border-border rounded-lg shadow-card p-6">
                    <div className="text-center mb-6">
                        <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2">
                            Demo Payment
                        </p>
                        <h1 className="text-2xl font-semibold text-ink mb-1">
                            Order #{unpaidOrder.order_id}
                        </h1>
                        <p className="text-3xl font-bold text-ink mt-3">
                            ₹{unpaidOrder.total_amount}
                        </p>
                        <p className="text-xs text-muted mt-2">
                            Demo/test payment only — no real money is
                            transferred.
                        </p>
                    </div>

                    {paymentError && (
                        <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                            {paymentError}
                        </p>
                    )}

                    {/* Method selector */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                        {PAYMENT_METHODS.map((method) => (
                            <button
                                key={method.id}
                                type="button"
                                onClick={() => handleSelectMethod(method.id)}
                                className={`h-11 rounded-sm text-sm font-semibold border transition-colors ${
                                    selectedMethod === method.id
                                        ? "bg-primary text-white border-primary"
                                        : "bg-surface text-ink border-border hover:border-primary hover:text-primary"
                                }`}
                            >
                                {method.label}
                            </button>
                        ))}
                    </div>

                    {/* UPI / QR panel */}
                    {(selectedMethod === "upi" || selectedMethod === "qr") && (
                        <div className="flex flex-col items-center gap-4 border-t border-border pt-6">
                            {creatingPayment && (
                                <p className="text-sm text-muted">
                                    Starting payment session...
                                </p>
                            )}

                            {paymentSession?.upi_payload && (
                                <>
                                    <div className="bg-white p-4 rounded-lg border border-border">
                                        <QRCodeSVG
                                            value={paymentSession.upi_payload}
                                            size={180}
                                        />
                                    </div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                        Demo UPI QR — not a real payment
                                        channel
                                    </p>
                                    <p className="text-xs text-muted text-center max-w-xs">
                                        Ref: {paymentSession.transaction_ref}
                                    </p>

                                    <div className="flex items-center gap-2 text-sm text-warning">
                                        <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                                        Waiting for payment...
                                    </div>

                                    <button
                                        type="button"
                                        disabled={verifyingPayment}
                                        onClick={handleConfirmUpiPayment}
                                        className="h-10 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {verifyingPayment
                                            ? "Verifying..."
                                            : "I've Paid"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Card panel */}
                    {selectedMethod === "card" && (
                        <form
                            onSubmit={handleCardPay}
                            className="border-t border-border pt-6 flex flex-col gap-2"
                        >
                            <p className="text-xs text-muted mb-1">
                                Demo card only — do not enter real card
                                details. Nothing you type here is sent to the
                                server.
                            </p>
                            <input
                                type="text"
                                placeholder="Card number (demo, 16 digits)"
                                value={cardForm.number}
                                onChange={(e) =>
                                    handleCardFormChange(
                                        "number",
                                        e.target.value
                                    )
                                }
                                maxLength={19}
                                className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    placeholder="MM/YY"
                                    value={cardForm.expiry}
                                    onChange={(e) =>
                                        handleCardFormChange(
                                            "expiry",
                                            e.target.value
                                        )
                                    }
                                    maxLength={5}
                                    className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                                />
                                <input
                                    type="text"
                                    placeholder="CVV"
                                    value={cardForm.cvv}
                                    onChange={(e) =>
                                        handleCardFormChange(
                                            "cvv",
                                            e.target.value
                                        )
                                    }
                                    maxLength={4}
                                    className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Cardholder name"
                                value={cardForm.name}
                                onChange={(e) =>
                                    handleCardFormChange(
                                        "name",
                                        e.target.value
                                    )
                                }
                                className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                            />

                            {cardFormError && (
                                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                    {cardFormError}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={creatingPayment || verifyingPayment}
                                className="h-10 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {verifyingPayment
                                    ? "Processing..."
                                    : creatingPayment
                                    ? "Starting..."
                                    : `Pay ₹${unpaidOrder.total_amount}`}
                            </button>
                        </form>
                    )}

                    {/* COD panel */}
                    {selectedMethod === "cod" && (
                        <div className="border-t border-border pt-6 text-center">
                            <p className="text-sm text-muted mb-4">
                                Pay ₹{unpaidOrder.total_amount} in cash when
                                your order is delivered. No payment is
                                collected now.
                            </p>
                            <button
                                type="button"
                                disabled={creatingPayment}
                                onClick={handleConfirmCod}
                                className="h-10 px-6 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {creatingPayment
                                    ? "Confirming..."
                                    : "Confirm Cash on Delivery"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (!cart || items.length === 0) {
        return (
            <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
                <p className="text-sm text-muted">
                    Your cart is empty.{" "}
                    <Link to="/customer" className="text-primary font-medium">
                        Browse restaurants
                    </Link>
                    .
                </p>
            </div>
        );
    }

    const total = subtotal + FLAT_DELIVERY_FEE;

    return (
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
            <Link
                to="/customer/cart"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to cart
            </Link>

            <h1 className="text-2xl font-semibold text-ink mt-3 mb-6">
                Checkout
            </h1>

            <CheckoutSteps activeIndex={1} />

            {/* Cart summary */}
            <section className="mb-6">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Order Summary
                </h2>
                <div className="bg-surface border border-border rounded-lg shadow-card p-4">
                    <p className="text-sm font-semibold text-ink mb-3">
                        {cart.restaurant_name}
                    </p>
                    <div className="flex flex-col gap-3 mb-3">
                        {items.map((item) => (
                            <div
                                key={item.cart_item_id}
                                className="flex items-center gap-3 text-sm"
                            >
                                <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
                                    <ImageWithFallback
                                        src={item.image_url}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                        iconClassName="w-4 h-4"
                                    />
                                </div>
                                <span className="text-muted flex-1">
                                    {item.name} × {item.quantity}
                                </span>
                                <span className="text-ink font-medium">
                                    ₹{item.item_subtotal}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-border pt-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-sm text-muted">
                            <span>Subtotal</span>
                            <span>₹{subtotal}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted">
                            <span>Delivery fee</span>
                            <span>₹{FLAT_DELIVERY_FEE}</span>
                        </div>
                        <div className="flex items-center justify-between text-base font-bold text-ink mt-1">
                            <span>Total</span>
                            <span>₹{total}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Address selection */}
            <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-ink">
                        Delivery Address
                    </h2>
                    <button
                        type="button"
                        onClick={() => {
                            setShowAddressForm((prev) => !prev);
                            setAddressForm(emptyAddressForm);
                            setPickedLocation(null);
                            setLocationSource(null);
                            setLocationPrecision(null);
                            setAddressFormError(null);
                        }}
                        className="text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
                    >
                        {showAddressForm ? "Cancel" : "+ Add New Address"}
                    </button>
                </div>

                {showAddressForm && (
                    <form
                        onSubmit={handleSaveAddress}
                        className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-2 mb-4"
                    >
                        <input
                            type="text"
                            placeholder="Label (e.g. Home, Work)"
                            value={addressForm.label}
                            onChange={(e) =>
                                handleAddressFormChange("label", e.target.value)
                            }
                            className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                        />
                        <input
                            type="text"
                            placeholder="Address line"
                            value={addressForm.address_line}
                            onChange={(e) =>
                                handleAddressFormChange(
                                    "address_line",
                                    e.target.value
                                )
                            }
                            className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                        />
                        <div className="grid grid-cols-3 gap-2">
                            <input
                                type="text"
                                placeholder="City"
                                value={addressForm.city}
                                onChange={(e) =>
                                    handleAddressFormChange(
                                        "city",
                                        e.target.value
                                    )
                                }
                                className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                            />
                            <input
                                type="text"
                                placeholder="State"
                                value={addressForm.state}
                                onChange={(e) =>
                                    handleAddressFormChange(
                                        "state",
                                        e.target.value
                                    )
                                }
                                className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                            />
                            <input
                                type="text"
                                placeholder="Pincode"
                                value={addressForm.pincode}
                                onChange={(e) =>
                                    handleAddressFormChange(
                                        "pincode",
                                        e.target.value
                                    )
                                }
                                className="w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                            />
                        </div>

                        <AddressLocationPicker
                            value={pickedLocation}
                            onChange={(coords) => {
                                setPickedLocation(coords);
                                setLocationSource("manual");
                                setLocationPrecision(null);
                            }}
                            geocoding={geocoding}
                            locationSource={locationSource}
                            locationPrecision={locationPrecision}
                        />

                        {addressFormError && (
                            <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                {addressFormError}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={savingAddress}
                            className="self-start h-10 px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {savingAddress ? "Saving..." : "Save Address"}
                        </button>
                    </form>
                )}

                {addresses.length === 0 ? (
                    <p className="text-sm text-muted">
                        No saved addresses yet. Add one above to continue.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {addresses.map((address) => (
                            <label
                                key={address.address_id}
                                className={`flex items-start gap-3 bg-surface border rounded-lg p-4 cursor-pointer transition-colors ${
                                    selectedAddressId === address.address_id
                                        ? "border-primary ring-3 ring-primary/15"
                                        : "border-border hover:border-primary/50"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="address"
                                    checked={
                                        selectedAddressId ===
                                        address.address_id
                                    }
                                    onChange={() =>
                                        setSelectedAddressId(
                                            address.address_id
                                        )
                                    }
                                    className="mt-1 w-4 h-4"
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink">
                                        {address.label}
                                        {address.is_default ? (
                                            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-primary">
                                                Default
                                            </span>
                                        ) : null}
                                    </p>
                                    <p className="text-sm text-muted">
                                        {address.address_line},{" "}
                                        {address.city}, {address.state} -{" "}
                                        {address.pincode}
                                    </p>
                                    {(address.latitude == null ||
                                        address.longitude == null) && (
                                        <p className="text-xs text-warning mt-1">
                                            No exact location set — live
                                            tracking won't work accurately
                                            for this address. Add a new
                                            address to set one.
                                        </p>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </section>

            {orderError && (
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-4">
                    {orderError}
                </p>
            )}

            <button
                type="button"
                disabled={placingOrder || !selectedAddressId}
                onClick={handlePlaceOrder}
                className="w-full h-11 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {placingOrder ? "Placing Order..." : `Place Order — ₹${total}`}
            </button>
        </div>
    );
};

export default CheckoutPage;