// Idempotent demo-data seed script for the Hyderabad restaurant dataset.
// Run with: node scripts/seedDemoData.js  (from the backend/ directory)
//
// Idempotency: each restaurant's owner email is checked against Users
// before anything is inserted.
//   - Owner does NOT exist  -> create owner, restaurant, categories, and
//     menu items (unchanged from the original script).
//   - Owner DOES exist      -> backfillExistingRestaurant() runs instead.
//     It never inserts anything; it only fills in image_url on the
//     existing Restaurants/MenuItems rows where that column is currently
//     NULL or empty, and leaves every other column untouched.
//
// IMAGES: image_url values come from a fixed, local, static mapping — see
// STATIC_IMAGE_BASE and IMAGE_CATALOG below. This script makes NO network
// requests of any kind (no Wikimedia Commons, no other image API). It was
// previously calling the Wikimedia Commons search API at seed time and
// was hitting HTTP 429 rate limits, so that approach was removed entirely
// in favor of these static, checked-in image files. See the bottom of this
// file for the exact list of image files this script expects to exist
// under frontend/public/images/food/.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../db");

function query(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

// ---------------------------------------------------------------------
// Static image resolution — no network calls of any kind.
//
// Every restaurant and menu item below carries a short "image slug"
// (e.g. "biryani", "dosa", "pizza"). resolveStaticImage() turns that slug
// into a fixed, predictable path served by Vite from the frontend's public/
// folder: a file at frontend/public/images/food/<slug>.jpg is served at
// the URL path /images/food/<slug>.jpg, which is exactly what's stored in
// image_url. This is a pure, synchronous string join — it cannot fail,
// rate-limit, time out, or return something unexpected, and it never
// touches the network.
//
// It is expected (and fine) for multiple similar dishes to share a slug —
// see the IMAGE_CATALOG comment at the bottom of this file for the full
// list of image files this implies and exactly where to place them.
// ---------------------------------------------------------------------

const STATIC_IMAGE_BASE = "/images/food/";

function resolveStaticImage(slug) {
    if (!slug) return null;
    return `${STATIC_IMAGE_BASE}${slug}.jpg`;
}

// Backfills image_url for a restaurant (and its menu items) that already
// exists in the database — used when re-running this script against a
// database that was seeded before image support existed. This function
// NEVER inserts an owner, restaurant, category, or menu item, and never
// touches any column other than image_url. It only ever runs:
//   UPDATE Restaurants SET image_url = ? WHERE restaurant_id = ?
//   UPDATE MenuItems   SET image_url = ? WHERE item_id = ?
// and only when the existing image_url is NULL or an empty string —
// leaving name, description, price, category, availability, is_open,
// coordinates, ratings, and everything else completely untouched. Existing
// menu items are matched by name within the restaurant, never by inserting
// a new row. Image paths come from resolveStaticImage() above — no network
// calls happen anywhere in this function.
async function backfillExistingRestaurant(r, ownerId) {
    console.log(`Existing restaurant found: ${r.name}`);

    const restaurantRows = await query(
        "SELECT restaurant_id, image_url, avg_delivery_time_minutes, hygiene_score FROM Restaurants WHERE owner_id = ?",
        [ownerId]
    );

    if (restaurantRows.length === 0) {
        console.log(
            `  No Restaurants row found for this owner — skipping image backfill for "${r.name}".`
        );
        return;
    }

    const restaurantId = restaurantRows[0].restaurant_id;
    const hasRestaurantImage = !!restaurantRows[0].image_url;
    const hasDeliveryTime = restaurantRows[0].avg_delivery_time_minutes != null;
    const hasHygieneScore = restaurantRows[0].hygiene_score != null;

    if (hasRestaurantImage) {
        console.log("  Restaurant image already exists — skipped");
    } else {
        const restaurantImageUrl = resolveStaticImage(r.imageSlug);
        if (restaurantImageUrl) {
            await query(
                "UPDATE Restaurants SET image_url = ? WHERE restaurant_id = ?",
                [restaurantImageUrl, restaurantId]
            );
            console.log("  Restaurant image updated");
        } else {
            console.log("  No image slug configured for this restaurant — left NULL.");
        }
    }

    if (hasDeliveryTime) {
        console.log("  Restaurant delivery time already set — skipped");
    } else if (r.avgDeliveryTimeMinutes != null) {
        await query(
            "UPDATE Restaurants SET avg_delivery_time_minutes = ? WHERE restaurant_id = ?",
            [r.avgDeliveryTimeMinutes, restaurantId]
        );
        console.log(`  Restaurant delivery time updated (${r.avgDeliveryTimeMinutes} min)`);
    }

    if (hasHygieneScore) {
        console.log("  Restaurant hygiene score already set — skipped");
    } else if (r.hygieneScore != null) {
        await query(
            "UPDATE Restaurants SET hygiene_score = ? WHERE restaurant_id = ?",
            [r.hygieneScore, restaurantId]
        );
        console.log(`  Restaurant hygiene score updated (${r.hygieneScore}/100)`);
    }

    // Match existing menu items by name, scoped to this restaurant. Items
    // in r.items that have no matching row (name mismatch, item deleted,
    // etc.) are reported and skipped — never inserted.
    const itemNames = r.items.map(([, name]) => name);
    const existingItems = itemNames.length
        ? await query(
              "SELECT item_id, name, image_url FROM MenuItems WHERE restaurant_id = ? AND name IN (?)",
              [restaurantId, itemNames]
          )
        : [];
    const existingByName = new Map(existingItems.map((row) => [row.name, row]));

    let imagesResolved = 0;
    let itemsMatched = 0;

    for (const [, name, , , , imageSlug] of r.items) {
        const existingItem = existingByName.get(name);
        if (!existingItem) {
            console.log(
                `  No existing menu item named "${name}" found for this restaurant — skipping (not inserting a new one).`
            );
            continue;
        }
        itemsMatched += 1;

        if (existingItem.image_url) {
            imagesResolved += 1;
            console.log(`  Image already exists — skipped ("${name}")`);
            continue;
        }

        const itemImageUrl = resolveStaticImage(imageSlug);
        if (itemImageUrl) {
            await query(
                "UPDATE MenuItems SET image_url = ? WHERE item_id = ?",
                [itemImageUrl, existingItem.item_id]
            );
            imagesResolved += 1;
            console.log(`  Updated image for ${name}`);
        } else {
            console.log(`  No image slug configured for "${name}" — left NULL.`);
        }
    }

    console.log(
        `  ${imagesResolved}/${itemsMatched} menu item images resolved for "${r.name}"\n`
    );
}

// Shared demo password for every seeded owner account — this is throwaway
// demo data for a college project, not real credentials.
const DEMO_OWNER_PASSWORD = "Demo@12345";

// Coordinates are approximate real-world locations for these Hyderabad
// areas, used for realistic demo geography (routing/tracking already rely
// on real-looking lat/long). Restaurants and menu items themselves are
// fictional.
//
// Each restaurant has imageSlug for its own banner photo. Each item tuple
// is [categoryName, name, description, price, isVeg, imageSlug]. Slugs map
// to /images/food/<slug>.jpg — see the IMAGE_CATALOG list at the bottom of
// this file for the full set of files this requires.
const RESTAURANTS = [
    {
        ownerName: "Ravi Teja",
        ownerEmail: "owner.gachibowli@demo.food",
        ownerPhone: "9000000001",
        name: "Spice Trail Gachibowli",
        cuisine_type: "Biryani & North Indian",
        description: "Slow-cooked dum biryanis and rich North Indian curries.",
        address_line: "Plot 12, Nanakramguda Road",
        city: "Gachibowli",
        state: "Telangana",
        pincode: "500032",
        latitude: 17.4401,
        longitude: 78.3489,
        phone: "04022221001",
        imageSlug: "biryani",
        avgDeliveryTimeMinutes: 40,
        hygieneScore: 88,
        categories: ["Biryani", "Starters", "Main Course", "Beverages"],
        items: [
            ["Biryani", "Hyderabadi Chicken Dum Biryani", "Slow-cooked basmati rice layered with spiced chicken.", 249, false, "biryani"],
            ["Biryani", "Mutton Biryani", "Tender mutton dum biryani with saffron rice.", 329, false, "biryani"],
            ["Biryani", "Veg Dum Biryani", "Fragrant basmati rice with mixed vegetables.", 199, true, "biryani"],
            ["Starters", "Chicken 65", "Spicy deep-fried chicken bites.", 219, false, "chicken-65"],
            ["Starters", "Paneer Tikka", "Chargrilled marinated cottage cheese.", 199, true, "paneer-tikka"],
            ["Main Course", "Butter Chicken", "Creamy tomato-based chicken curry.", 269, false, "butter-chicken"],
            ["Main Course", "Dal Makhani", "Slow-cooked black lentils in butter and cream.", 179, true, "dal"],
            ["Beverages", "Masala Chaas", "Spiced buttermilk.", 49, true, "lassi-buttermilk"],
        ],
    },
    {
        ownerName: "Sunitha Reddy",
        ownerEmail: "owner.madhapur@demo.food",
        ownerPhone: "9000000002",
        name: "Wok This Way Madhapur",
        cuisine_type: "Indo-Chinese",
        description: "Sizzling woks, noodles, and Indo-Chinese classics.",
        address_line: "Inorbit Mall Road",
        city: "Madhapur",
        state: "Telangana",
        pincode: "500081",
        latitude: 17.4483,
        longitude: 78.3915,
        phone: "04022221002",
        imageSlug: "noodles",
        avgDeliveryTimeMinutes: 25,
        hygieneScore: 76,
        categories: ["Starters", "Noodles", "Rice", "Main Course"],
        items: [
            ["Starters", "Chilli Paneer", "Crispy paneer tossed in spicy chilli sauce.", 209, true, "chilli-paneer"],
            ["Starters", "Chicken Manchurian", "Deep-fried chicken in tangy Manchurian sauce.", 229, false, "indo-chinese-chicken"],
            ["Noodles", "Veg Hakka Noodles", "Wok-tossed noodles with fresh vegetables.", 169, true, "noodles"],
            ["Noodles", "Chicken Schezwan Noodles", "Spicy Schezwan-style noodles with chicken.", 209, false, "noodles"],
            ["Rice", "Veg Fried Rice", "Classic wok-fried rice with vegetables.", 159, true, "fried-rice"],
            ["Rice", "Egg Fried Rice", "Fried rice tossed with scrambled egg.", 179, false, "fried-rice"],
            ["Main Course", "Kung Pao Chicken", "Spicy stir-fried chicken with peanuts.", 259, false, "indo-chinese-chicken"],
        ],
    },
    {
        ownerName: "Lakshmi Narayana",
        ownerEmail: "owner.kondapur@demo.food",
        ownerPhone: "9000000003",
        name: "Dosa Junction Kondapur",
        cuisine_type: "South Indian",
        description: "Crispy dosas, idlis, and authentic South Indian tiffins.",
        address_line: "Botanical Garden Road",
        city: "Kondapur",
        state: "Telangana",
        pincode: "500084",
        latitude: 17.4615,
        longitude: 78.3487,
        phone: "04022221003",
        imageSlug: "dosa",
        avgDeliveryTimeMinutes: 20,
        hygieneScore: 92,
        categories: ["South Indian", "Starters", "Beverages"],
        items: [
            ["South Indian", "Masala Dosa", "Crispy rice crepe with spiced potato filling.", 99, true, "dosa"],
            ["South Indian", "Plain Dosa", "Classic crispy rice and lentil crepe.", 79, true, "dosa"],
            ["South Indian", "Idli Sambar", "Steamed rice cakes with lentil sambar.", 69, true, "idli-vada"],
            ["South Indian", "Rava Upma", "Semolina cooked with vegetables and spices.", 79, true, "upma-pongal"],
            ["South Indian", "Pongal", "Comforting rice and lentil khichdi with ghee.", 89, true, "upma-pongal"],
            ["Starters", "Medu Vada", "Crispy fried lentil doughnuts.", 59, true, "idli-vada"],
            ["Beverages", "Filter Coffee", "Traditional South Indian filter coffee.", 39, true, "filter-coffee"],
        ],
    },
    {
        ownerName: "Arjun Rao",
        ownerEmail: "owner.hitechcity@demo.food",
        ownerPhone: "9000000004",
        name: "Crust & Co. Hitech City",
        cuisine_type: "Pizza & Italian",
        description: "Wood-fired pizzas and Italian comfort food.",
        address_line: "Cyber Towers Road",
        city: "Hitech City",
        state: "Telangana",
        pincode: "500081",
        latitude: 17.4435,
        longitude: 78.3772,
        phone: "04022221004",
        imageSlug: "pizza",
        avgDeliveryTimeMinutes: 30,
        hygieneScore: 95,
        categories: ["Pizza", "Starters", "Main Course", "Beverages"],
        items: [
            ["Pizza", "Margherita Pizza", "Classic tomato, mozzarella, and basil.", 259, true, "pizza"],
            ["Pizza", "Chicken Tikka Pizza", "Spiced chicken tikka with onions and peppers.", 329, false, "pizza"],
            ["Pizza", "Farmhouse Pizza", "Loaded with fresh vegetables and cheese.", 289, true, "pizza"],
            ["Starters", "Garlic Bread", "Toasted bread with garlic butter and herbs.", 129, true, "garlic-bread"],
            ["Starters", "Cheesy Nachos", "Tortilla chips loaded with cheese and salsa.", 179, true, "garlic-bread"],
            ["Main Course", "Pasta Alfredo", "Creamy white sauce pasta.", 219, true, "pasta"],
            ["Beverages", "Cold Coffee", "Chilled blended coffee with ice cream.", 99, true, "cold-coffee-milkshake"],
        ],
    },
    {
        ownerName: "Farhan Ali",
        ownerEmail: "owner.jubileehills@demo.food",
        ownerPhone: "9000000005",
        name: "Roll Republic Jubilee Hills",
        cuisine_type: "Rolls & Shawarma",
        description: "Street-style rolls, wraps, and shawarma.",
        address_line: "Road No. 36",
        city: "Jubilee Hills",
        state: "Telangana",
        pincode: "500033",
        latitude: 17.4325,
        longitude: 78.4071,
        phone: "04022221005",
        imageSlug: "kathi-roll",
        avgDeliveryTimeMinutes: 20,
        hygieneScore: 70,
        categories: ["Rolls", "Shawarma", "Starters", "Beverages"],
        items: [
            ["Rolls", "Chicken Kathi Roll", "Spiced chicken wrapped in a flaky paratha.", 159, false, "kathi-roll"],
            ["Rolls", "Paneer Kathi Roll", "Grilled paneer wrapped in a flaky paratha.", 139, true, "kathi-roll"],
            ["Shawarma", "Chicken Shawarma", "Layered chicken shawarma with garlic sauce.", 179, false, "shawarma"],
            ["Shawarma", "Veg Shawarma", "Grilled vegetables in a soft pita wrap.", 149, true, "shawarma"],
            ["Starters", "French Fries", "Crispy salted fries.", 99, true, "fries"],
            ["Beverages", "Lemon Mint Cooler", "Refreshing lemon and mint cooler.", 59, true, "lemonade"],
        ],
    },
    {
        ownerName: "Kavitha Sharma",
        ownerEmail: "owner.banjarahills@demo.food",
        ownerPhone: "9000000006",
        name: "Burger Barn Banjara Hills",
        cuisine_type: "Fast Food & Burgers",
        description: "Juicy burgers, crispy fries, and combo meals.",
        address_line: "Road No. 12",
        city: "Banjara Hills",
        state: "Telangana",
        pincode: "500034",
        latitude: 17.4156,
        longitude: 78.4347,
        phone: "04022221006",
        imageSlug: "burger",
        avgDeliveryTimeMinutes: 22,
        hygieneScore: 82,
        categories: ["Burgers", "Starters", "Combos", "Beverages"],
        items: [
            ["Burgers", "Classic Chicken Burger", "Grilled chicken patty with lettuce and mayo.", 149, false, "burger"],
            ["Burgers", "Veg Crunch Burger", "Crispy vegetable patty with tangy sauce.", 119, true, "burger"],
            ["Burgers", "Double Cheese Burger", "Double patty loaded with melted cheese.", 199, false, "burger"],
            ["Starters", "Peri Peri Fries", "Crispy fries tossed in peri peri seasoning.", 109, true, "fries"],
            ["Combos", "Burger + Fries + Coke Combo", "Classic burger meal combo.", 249, false, "burger"],
            ["Beverages", "Chocolate Milkshake", "Thick chocolate milkshake.", 129, true, "cold-coffee-milkshake"],
        ],
    },
    {
        ownerName: "Mohammed Imran",
        ownerEmail: "owner.secunderabad@demo.food",
        ownerPhone: "9000000007",
        name: "Sweet Treats Secunderabad",
        cuisine_type: "Desserts & Beverages",
        description: "Indian sweets, desserts, and specialty beverages.",
        address_line: "SP Road",
        city: "Secunderabad",
        state: "Telangana",
        pincode: "500003",
        latitude: 17.4399,
        longitude: 78.4983,
        phone: "04022221007",
        imageSlug: "indian-sweets",
        avgDeliveryTimeMinutes: 18,
        hygieneScore: 90,
        categories: ["Desserts", "Beverages"],
        items: [
            ["Desserts", "Gulab Jamun (2 pcs)", "Soft milk dumplings soaked in sugar syrup.", 79, true, "indian-sweets"],
            ["Desserts", "Rasmalai (2 pcs)", "Soft cheese dumplings in sweetened milk.", 99, true, "indian-sweets"],
            ["Desserts", "Chocolate Brownie", "Warm fudgy brownie with chocolate sauce.", 119, true, "brownie"],
            ["Desserts", "Gajar Ka Halwa", "Classic carrot halwa with nuts and ghee.", 109, true, "indian-sweets"],
            ["Beverages", "Mango Lassi", "Thick yogurt smoothie with mango pulp.", 89, true, "lassi-buttermilk"],
            ["Beverages", "Rose Falooda", "Layered rose milk with vermicelli and jelly.", 99, true, "falooda"],
        ],
    },
    {
        ownerName: "Priyanka Iyer",
        ownerEmail: "owner.ameerpet@demo.food",
        ownerPhone: "9000000008",
        name: "Thali House Ameerpet",
        cuisine_type: "North Indian & Combos",
        description: "Wholesome North Indian thalis and combo meals.",
        address_line: "SR Nagar Main Road",
        city: "Ameerpet",
        state: "Telangana",
        pincode: "500016",
        latitude: 17.4374,
        longitude: 78.4482,
        phone: "04022221008",
        imageSlug: "thali",
        avgDeliveryTimeMinutes: 35,
        hygieneScore: 85,
        categories: ["Main Course", "Rice", "Combos", "Beverages"],
        items: [
            ["Main Course", "Paneer Butter Masala", "Cottage cheese in a rich tomato-butter gravy.", 229, true, "paneer-butter-masala"],
            ["Main Course", "Chicken Curry", "Home-style spiced chicken curry.", 249, false, "butter-chicken"],
            ["Main Course", "Rajma Chawal", "Kidney bean curry served with steamed rice.", 179, true, "dal"],
            ["Rice", "Jeera Rice", "Fragrant cumin-tempered basmati rice.", 99, true, "fried-rice"],
            ["Combos", "Veg Thali", "Dal, sabzi, rice, roti, and salad combo.", 199, true, "thali"],
            ["Combos", "Non-Veg Thali", "Chicken curry, dal, rice, roti, and salad combo.", 259, false, "thali"],
            ["Beverages", "Sweet Lassi", "Traditional sweetened yogurt drink.", 69, true, "lassi-buttermilk"],
        ],
    },
];

async function seed() {
    console.log("Starting demo data seed (static local images, no network calls)...\n");
    const passwordHash = bcrypt.hashSync(DEMO_OWNER_PASSWORD, 10);

    for (const r of RESTAURANTS) {
        const existingOwner = await query(
            "SELECT user_id FROM Users WHERE email = ?",
            [r.ownerEmail]
        );

        if (existingOwner.length > 0) {
            await backfillExistingRestaurant(r, existingOwner[0].user_id);
            continue;
        }

        const ownerResult = await query(
            "INSERT INTO Users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, 'restaurant_owner')",
            [r.ownerName, r.ownerEmail, passwordHash, r.ownerPhone]
        );
        const ownerId = ownerResult.insertId;

        const restaurantImageUrl = resolveStaticImage(r.imageSlug);

        const restaurantResult = await query(
            `INSERT INTO Restaurants
                (owner_id, name, description, cuisine_type, address_line, city, state, pincode, latitude, longitude, phone, commission_rate, is_open, image_url, avg_delivery_time_minutes, hygiene_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
            [
                ownerId,
                r.name,
                r.description,
                r.cuisine_type,
                r.address_line,
                r.city,
                r.state,
                r.pincode,
                r.latitude,
                r.longitude,
                r.phone,
                12.0,
                restaurantImageUrl,
                r.avgDeliveryTimeMinutes ?? null,
                r.hygieneScore ?? null,
            ]
        );
        const restaurantId = restaurantResult.insertId;

        const categoryIds = {};
        for (const categoryName of r.categories) {
            const catResult = await query(
                "INSERT INTO MenuCategories (restaurant_id, name) VALUES (?, ?)",
                [restaurantId, categoryName]
            );
            categoryIds[categoryName] = catResult.insertId;
        }

        let imagesResolved = 0;
        for (const [categoryName, name, description, price, isVeg, imageSlug] of r.items) {
            const itemImageUrl = resolveStaticImage(imageSlug);
            if (itemImageUrl) imagesResolved += 1;

            await query(
                "INSERT INTO MenuItems (restaurant_id, category_id, name, description, price, is_veg, is_available, image_url) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)",
                [
                    restaurantId,
                    categoryIds[categoryName],
                    name,
                    description,
                    price,
                    isVeg,
                    itemImageUrl,
                ]
            );
        }

        console.log(
            `Seeded "${r.name}" (${r.city}) — ${r.items.length} menu items, ${imagesResolved}/${r.items.length} item images resolved` +
                (restaurantImageUrl ? ", restaurant image resolved" : ", restaurant image NOT resolved (will fall back to placeholder)") +
                `. Owner login: ${r.ownerEmail} / ${DEMO_OWNER_PASSWORD}`
        );
    }

    console.log("\nDemo data seed complete.");
    process.exit(0);
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});

// ---------------------------------------------------------------------
// IMAGE_CATALOG — every file this script's image slugs resolve to. Place
// these 28 files at the exact paths below (relative to the frontend
// project root) before running this script, or afterwards — image_url is
// just a path string, so it works retroactively either way. Vite serves
// everything under `public/` from the site root, so a file at
// frontend/public/images/food/biryani.jpg is reachable at /images/food/biryani.jpg,
// exactly what's stored in the database.
//
// If a file is ever missing at request time, ImageWithFallback's onError
// handler catches the failed <img> load and renders its placeholder icon
// instead of a broken image — nothing else needs to change for that.
//
// Required files (frontend/public/images/food/<name>):
//   biryani.jpg
//   chicken-65.jpg
//   paneer-tikka.jpg
//   butter-chicken.jpg
//   dal.jpg
//   lassi-buttermilk.jpg
//   chilli-paneer.jpg
//   indo-chinese-chicken.jpg
//   noodles.jpg
//   fried-rice.jpg
//   dosa.jpg
//   idli-vada.jpg
//   upma-pongal.jpg
//   filter-coffee.jpg
//   pizza.jpg
//   garlic-bread.jpg
//   pasta.jpg
//   cold-coffee-milkshake.jpg
//   kathi-roll.jpg
//   shawarma.jpg
//   fries.jpg
//   lemonade.jpg
//   burger.jpg
//   indian-sweets.jpg
//   brownie.jpg
//   falooda.jpg
//   paneer-butter-masala.jpg
//   thali.jpg
// ---------------------------------------------------------------------