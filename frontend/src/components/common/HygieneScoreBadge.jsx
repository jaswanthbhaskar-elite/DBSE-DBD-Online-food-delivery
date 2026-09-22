// Shared display for a restaurant's hygiene/food-safety score. Renders
// nothing when score is null/undefined — a restaurant that hasn't been
// scored yet simply shows no badge, rather than a misleading "N/A".
//
// IMPORTANT: scores in this project are DEMO/seeded values for a college
// project (see seedDemoData.js), not real inspection results from any
// health authority. Every place this badge renders, it says so — never
// omit or soften that disclaimer, since presenting an unverified number as
// if it were official government data would be actively misleading.
const scoreColorClasses = (score) => {
    if (score >= 85) return "text-success bg-success-bg";
    if (score >= 70) return "text-warning bg-warning-bg";
    return "text-error bg-error-bg";
};

const HygieneScoreBadge = ({ score, variant = "compact" }) => {
    if (score === null || score === undefined) return null;

    if (variant === "detailed") {
        return (
            <div className="inline-flex flex-col gap-1">
                <span
                    className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full w-fit ${scoreColorClasses(
                        score
                    )}`}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="w-4 h-4"
                    >
                        <path
                            d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M9 12l2 2 4-4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    Food Safety Score: {score}/100
                </span>
                <p className="text-[11px] text-muted">
                    Demo score for this project — not verified official
                    health-authority data.
                </p>
            </div>
        );
    }

    // Compact variant, for restaurant cards.
    return (
        <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${scoreColorClasses(
                score
            )}`}
            title="Demo food safety score — not verified official data"
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-3 h-3"
            >
                <path
                    d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
            {score}/100
        </span>
    );
};

export default HygieneScoreBadge;