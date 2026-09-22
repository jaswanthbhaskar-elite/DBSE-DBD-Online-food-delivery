import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getMyRestaurant } from "../../api/restaurantApi";
import {
    getCategories,
    createCategory,
    getMenuItems,
    createMenuItem,
    updateMenuItem,
    updateItemAvailability,
} from "../../api/menuApi";

const emptyNewItem = {
    name: "",
    description: "",
    price: "",
    category_id: "",
    is_veg: false,
};

const MenuManagementPage = () => {
    const [restaurantId, setRestaurantId] = useState(null);
    const [restaurantError, setRestaurantError] = useState(null);
    const [loadingRestaurant, setLoadingRestaurant] = useState(true);

    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [categoriesError, setCategoriesError] = useState(null);

    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsError, setItemsError] = useState(null);

    const [newCategoryName, setNewCategoryName] = useState("");
    const [addingCategory, setAddingCategory] = useState(false);
    const [addCategoryError, setAddCategoryError] = useState(null);

    const [newItem, setNewItem] = useState(emptyNewItem);
    const [addingItem, setAddingItem] = useState(false);
    const [addItemError, setAddItemError] = useState(null);

    const [editingItemId, setEditingItemId] = useState(null);
    const [editForm, setEditForm] = useState(emptyNewItem);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState(null);

    const [togglingItemId, setTogglingItemId] = useState(null);

    const fetchCategories = useCallback(async (id) => {
        setLoadingCategories(true);
        setCategoriesError(null);
        try {
            const data = await getCategories(id);
            setCategories(data.categories);
        } catch (err) {
            setCategoriesError(
                err.response?.data?.message || "Failed to load categories."
            );
        } finally {
            setLoadingCategories(false);
        }
    }, []);

    const fetchItems = useCallback(async (id) => {
        setLoadingItems(true);
        setItemsError(null);
        try {
            const data = await getMenuItems(id);
            setItems(data.items);
        } catch (err) {
            setItemsError(
                err.response?.data?.message || "Failed to load menu items."
            );
        } finally {
            setLoadingItems(false);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                const data = await getMyRestaurant();
                const id = data.restaurant.restaurant_id;
                setRestaurantId(id);
                fetchCategories(id);
                fetchItems(id);
            } catch (err) {
                setRestaurantError(
                    err.response?.data?.message ||
                        "Failed to load your restaurant."
                );
            } finally {
                setLoadingRestaurant(false);
            }
        };

        init();
    }, [fetchCategories, fetchItems]);

    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        setAddingCategory(true);
        setAddCategoryError(null);
        try {
            await createCategory(restaurantId, { name: newCategoryName.trim() });
            setNewCategoryName("");
            await fetchCategories(restaurantId);
        } catch (err) {
            setAddCategoryError(
                err.response?.data?.message || "Failed to add category."
            );
        } finally {
            setAddingCategory(false);
        }
    };

    const handleNewItemChange = (field, value) => {
        setNewItem((prev) => ({ ...prev, [field]: value }));
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        if (!newItem.name.trim() || !newItem.price) return;

        setAddingItem(true);
        setAddItemError(null);
        try {
            await createMenuItem(restaurantId, {
                name: newItem.name.trim(),
                description: newItem.description.trim() || null,
                price: Number(newItem.price),
                category_id: newItem.category_id || null,
                is_veg: newItem.is_veg,
            });
            setNewItem(emptyNewItem);
            await fetchItems(restaurantId);
        } catch (err) {
            setAddItemError(
                err.response?.data?.message || "Failed to add menu item."
            );
        } finally {
            setAddingItem(false);
        }
    };

    const startEditing = (item) => {
        setEditingItemId(item.item_id);
        setEditError(null);
        setEditForm({
            name: item.name,
            description: item.description || "",
            price: item.price,
            category_id: item.category_id || "",
            is_veg: !!item.is_veg,
        });
    };

    const cancelEditing = () => {
        setEditingItemId(null);
        setEditError(null);
    };

    const handleEditChange = (field, value) => {
        setEditForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveEdit = async (itemId) => {
        if (!editForm.name.trim() || !editForm.price) return;

        setSavingEdit(true);
        setEditError(null);
        try {
            await updateMenuItem(itemId, {
                name: editForm.name.trim(),
                description: editForm.description.trim() || null,
                price: Number(editForm.price),
                category_id: editForm.category_id || null,
                is_veg: editForm.is_veg,
            });
            setEditingItemId(null);
            await fetchItems(restaurantId);
        } catch (err) {
            setEditError(
                err.response?.data?.message || "Failed to update menu item."
            );
        } finally {
            setSavingEdit(false);
        }
    };

    const handleToggleAvailability = async (item) => {
        setTogglingItemId(item.item_id);
        try {
            await updateItemAvailability(item.item_id, !item.is_available);
            await fetchItems(restaurantId);
        } catch (err) {
            setItemsError(
                err.response?.data?.message ||
                    "Failed to update item availability."
            );
        } finally {
            setTogglingItemId(null);
        }
    };

    const getCategoryName = (categoryId) => {
        const match = categories.find((c) => c.category_id === categoryId);
        return match ? match.name : "Uncategorized";
    };

    const inputClass =
        "w-full h-10 px-3 text-sm text-ink bg-surface border border-border rounded-sm transition-colors focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15";
    const textareaClass =
        "w-full min-h-18 px-3 py-2 text-sm text-ink bg-surface border border-border rounded-sm transition-colors resize-y focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/15";
    const primaryBtnClass =
        "h-10 px-4 rounded-sm font-semibold text-sm text-white bg-primary transition-colors hover:not-disabled:bg-primary-hover active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";
    const secondaryBtnClass =
        "h-10 px-4 rounded-sm font-semibold text-sm text-ink bg-surface border border-border transition-colors hover:not-disabled:border-primary hover:not-disabled:text-primary active:not-disabled:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";

    if (loadingRestaurant) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <Link
                    to="/owner"
                    className="text-sm text-muted hover:text-primary transition-colors"
                >
                    &larr; Back to dashboard
                </Link>
                <p className="text-sm text-muted py-4">
                    Loading your restaurant...
                </p>
            </div>
        );
    }

    if (restaurantError) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <Link
                    to="/owner"
                    className="text-sm text-muted hover:text-primary transition-colors"
                >
                    &larr; Back to dashboard
                </Link>
                <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mt-3">
                    {restaurantError}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <Link
                to="/owner"
                className="text-sm text-muted hover:text-primary transition-colors"
            >
                &larr; Back to dashboard
            </Link>
            <h1 className="text-2xl font-semibold text-ink mt-3 mb-6">
                Menu Management
            </h1>

            <section className="mb-8">
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Categories
                </h2>

                {loadingCategories && (
                    <p className="text-sm text-muted py-2">
                        Loading categories...
                    </p>
                )}
                {categoriesError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-2">
                        {categoriesError}
                    </p>
                )}

                {!loadingCategories && !categoriesError && (
                    <ul className="flex flex-wrap gap-2 mb-4">
                        {categories.length === 0 && (
                            <li className="text-sm text-muted">
                                No categories yet.
                            </li>
                        )}
                        {categories.map((category) => (
                            <li
                                key={category.category_id}
                                className="bg-surface border border-border rounded-full px-3.5 py-1.5 text-sm font-medium text-ink"
                            >
                                {category.name}
                            </li>
                        ))}
                    </ul>
                )}

                <form
                    onSubmit={handleAddCategory}
                    className="bg-surface border border-border rounded-lg p-4 flex flex-wrap items-center gap-2"
                >
                    <input
                        type="text"
                        placeholder="New category name"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className={`${inputClass} flex-1 min-w-56`}
                    />
                    <button
                        type="submit"
                        disabled={addingCategory}
                        className={primaryBtnClass}
                    >
                        {addingCategory ? "Adding..." : "Add Category"}
                    </button>
                </form>
                {addCategoryError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mt-2">
                        {addCategoryError}
                    </p>
                )}
            </section>

            <section>
                <h2 className="text-lg font-semibold text-ink mb-3">
                    Menu Items
                </h2>

                {loadingItems && (
                    <p className="text-sm text-muted py-2">
                        Loading menu items...
                    </p>
                )}
                {itemsError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mb-2">
                        {itemsError}
                    </p>
                )}

                {!loadingItems && !itemsError && (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 mb-6">
                        {items.length === 0 && (
                            <li className="text-sm text-muted">
                                No menu items yet.
                            </li>
                        )}
                        {items.map((item) => (
                            <li
                                key={item.item_id}
                                className="bg-surface border border-border rounded-lg shadow-card p-4 transition-shadow hover:shadow-card-hover"
                            >
                                {editingItemId === item.item_id ? (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) =>
                                                handleEditChange(
                                                    "name",
                                                    e.target.value
                                                )
                                            }
                                            className={inputClass}
                                        />
                                        <textarea
                                            value={editForm.description}
                                            onChange={(e) =>
                                                handleEditChange(
                                                    "description",
                                                    e.target.value
                                                )
                                            }
                                            className={textareaClass}
                                        />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editForm.price}
                                            onChange={(e) =>
                                                handleEditChange(
                                                    "price",
                                                    e.target.value
                                                )
                                            }
                                            className={inputClass}
                                        />
                                        <select
                                            value={editForm.category_id}
                                            onChange={(e) =>
                                                handleEditChange(
                                                    "category_id",
                                                    e.target.value
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option value="">
                                                No category
                                            </option>
                                            {categories.map((category) => (
                                                <option
                                                    key={category.category_id}
                                                    value={
                                                        category.category_id
                                                    }
                                                >
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                        <label className="flex items-center gap-2 text-sm text-muted mb-0">
                                            <input
                                                type="checkbox"
                                                checked={editForm.is_veg}
                                                onChange={(e) =>
                                                    handleEditChange(
                                                        "is_veg",
                                                        e.target.checked
                                                    )
                                                }
                                                className="w-4 h-4"
                                            />
                                            Vegetarian
                                        </label>

                                        {editError && (
                                            <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5">
                                                {editError}
                                            </p>
                                        )}

                                        <div className="flex gap-2 mt-1">
                                            <button
                                                type="button"
                                                disabled={savingEdit}
                                                onClick={() =>
                                                    handleSaveEdit(
                                                        item.item_id
                                                    )
                                                }
                                                className={primaryBtnClass}
                                            >
                                                {savingEdit
                                                    ? "Saving..."
                                                    : "Save"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={cancelEditing}
                                                className={secondaryBtnClass}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-base font-semibold text-ink mb-1">
                                            {item.name}
                                        </h3>
                                        {item.description && (
                                            <p className="text-sm text-muted mb-2">
                                                {item.description}
                                            </p>
                                        )}
                                        <p className="text-base font-bold text-ink mb-1.5">
                                            Price: {item.price}
                                        </p>
                                        <p className="inline-block text-xs text-muted bg-background border border-border rounded-sm px-2 py-0.5 mb-2">
                                            Category:{" "}
                                            {getCategoryName(
                                                item.category_id
                                            )}
                                        </p>
                                        <p
                                            className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
                                                item.is_available
                                                    ? "text-success"
                                                    : "text-muted"
                                            }`}
                                        >
                                            {item.is_available
                                                ? "Available"
                                                : "Unavailable"}
                                        </p>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    startEditing(item)
                                                }
                                                className={secondaryBtnClass}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    togglingItemId ===
                                                    item.item_id
                                                }
                                                onClick={() =>
                                                    handleToggleAvailability(
                                                        item
                                                    )
                                                }
                                                className={secondaryBtnClass}
                                            >
                                                {togglingItemId ===
                                                item.item_id
                                                    ? "Updating..."
                                                    : item.is_available
                                                    ? "Mark Unavailable"
                                                    : "Mark Available"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <form
                    onSubmit={handleAddItem}
                    className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-2"
                >
                    <h3 className="text-sm font-semibold text-ink mb-1">
                        Add Menu Item
                    </h3>
                    <input
                        type="text"
                        placeholder="Item name"
                        value={newItem.name}
                        onChange={(e) =>
                            handleNewItemChange("name", e.target.value)
                        }
                        className={inputClass}
                    />
                    <textarea
                        placeholder="Description"
                        value={newItem.description}
                        onChange={(e) =>
                            handleNewItemChange(
                                "description",
                                e.target.value
                            )
                        }
                        className={textareaClass}
                    />
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Price"
                        value={newItem.price}
                        onChange={(e) =>
                            handleNewItemChange("price", e.target.value)
                        }
                        className={inputClass}
                    />
                    <select
                        value={newItem.category_id}
                        onChange={(e) =>
                            handleNewItemChange(
                                "category_id",
                                e.target.value
                            )
                        }
                        className={inputClass}
                    >
                        <option value="">No category</option>
                        {categories.map((category) => (
                            <option
                                key={category.category_id}
                                value={category.category_id}
                            >
                                {category.name}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-muted mb-0">
                        <input
                            type="checkbox"
                            checked={newItem.is_veg}
                            onChange={(e) =>
                                handleNewItemChange(
                                    "is_veg",
                                    e.target.checked
                                )
                            }
                            className="w-4 h-4"
                        />
                        Vegetarian
                    </label>

                    <button
                        type="submit"
                        disabled={addingItem}
                        className={`${primaryBtnClass} self-start`}
                    >
                        {addingItem ? "Adding..." : "Add Item"}
                    </button>
                </form>
                {addItemError && (
                    <p className="text-sm text-error bg-error-bg border border-error/25 rounded-sm px-4 py-2.5 mt-2">
                        {addItemError}
                    </p>
                )}
            </section>
        </div>
    );
};

export default MenuManagementPage;