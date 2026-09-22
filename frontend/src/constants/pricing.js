// Single source of truth for the flat delivery fee shown in the cart
// preview and actually charged at checkout. Previously this same value
// (40) was defined separately in CartPage.jsx and CheckoutPage.jsx — the
// numbers happened to match, but nothing enforced that, so a future edit
// to one could silently drift from the other and show the customer a
// different estimate than what they're actually charged. Both now import
// from here instead.
//
// NOTE: the backend does not compute or enforce this value — orderApi.js's
// createOrder() call sends delivery_fee explicitly in the request body, and
// backend/controllers/orderController.js accepts whatever non-negative
// number is provided (defaulting to 0 if omitted). If a real, server-side
// delivery-fee calculation is ever added, it should replace this constant
// as the source of truth on the frontend too.
export const FLAT_DELIVERY_FEE = 40;