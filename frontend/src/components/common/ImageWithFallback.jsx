import { useState, useEffect } from "react";

// Shared image element for any photo that comes from user/seed data
// (restaurant photos, menu item photos) and might be missing or fail to
// load. Renders a soft placeholder instead of a broken-image icon so the
// grid never looks broken, without touching any data-fetching logic.
//
// - No `src` at all -> placeholder immediately, no network request.
// - `src` present but the request fails (dead link, offline, etc.) ->
//   swaps to the placeholder once the error fires.
// - `src` changes (e.g. navigating between menu items) -> error state
//   resets so a valid new image isn't stuck showing the placeholder.
const ImageWithFallback = ({
    src,
    alt,
    className = "",
    iconClassName = "w-8 h-8",
}) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    if (!src || failed) {
        return (
            <div
                className={`flex items-center justify-center bg-background text-muted ${className}`}
                role="img"
                aria-label={alt || "Image unavailable"}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={iconClassName}
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                </svg>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className={className}
        />
    );
};

export default ImageWithFallback;