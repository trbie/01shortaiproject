const itemForm = document.getElementById("item-form");
const itemsEl = document.getElementById("items");
const shoppingListEl = document.getElementById("shopping-list");
const statusEl = document.getElementById("status");
const template = document.getElementById("item-card-template");
const refreshBtn = document.getElementById("refresh-btn");
const shoppingSearchEl = document.getElementById("shopping-search");
const shoppingLocationFilterEl = document.getElementById("shopping-location-filter");
const shoppingCategoryFilterEl = document.getElementById("shopping-category-filter");
const shoppingMatchedOnlyEl = document.getElementById("shopping-matched-only");
const itemById = new Map();
let currentShoppingEntries = [];

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#ba1b1d" : "#565e73";
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Request failed.");
    }

    return response.json();
}

function buildItemCard(item) {
    const node = template.content.firstElementChild.cloneNode(true);
    const title = node.querySelector("h3");
    const meta = node.querySelector(".meta");
    const matchBtn = node.querySelector(".match");
    const editBtn = node.querySelector(".edit");
    const deleteBtn = node.querySelector(".delete");
    const main = node.querySelector(".item-main");

    title.textContent = item.name;
    meta.textContent = `${item.quantity} ${item.unit} on hand | min ${item.minDesired} | ${item.location} | ${item.category}`;

    const picker = document.createElement("div");
    picker.className = "product-picker";
    node.appendChild(picker);

    if (item.storeProduct) {
        const selected = document.createElement("div");
        selected.className = "selected-product";
        const priceLabel = item.storeProduct.price === null ? "" : ` | $${item.storeProduct.price}`;
        selected.innerHTML = `
            <img src="${item.storeProduct.thumbnail}" alt="${item.storeProduct.title}" />
            <p class="meta">Matched: ${item.storeProduct.title}${priceLabel}</p>
            <button class="ghost unlink">Unlink</button>
        `;
        main.appendChild(selected);

        const unlinkBtn = selected.querySelector(".unlink");
        unlinkBtn.addEventListener("click", async () => {
            try {
                await api(`/api/items/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ storeProduct: null }),
                });
                await refresh();
                setStatus(`Unlinked product from ${item.name}.`);
            } catch (error) {
                setStatus(error.message, true);
            }
        });
    }

    matchBtn.addEventListener("click", async () => {
        const query = prompt(`Search store products for ${item.name}:`, item.name);
        if (!query) {
            return;
        }

        picker.innerHTML = '<p class="meta">Searching...</p>';
        try {
            const results = await api(`/api/store/search?q=${encodeURIComponent(query)}&limit=6`);
            if (!results.length) {
                picker.innerHTML = '<p class="meta">No products found for that search.</p>';
                return;
            }

            picker.innerHTML = "";
            const label = document.createElement("p");
            label.className = "meta";
            label.textContent = "Select a product:";
            picker.appendChild(label);

            const resultGrid = document.createElement("div");
            resultGrid.className = "product-results";

            results.forEach((result) => {
                const option = document.createElement("button");
                option.className = "product-option";
                const priceLabel = result.price === null ? "" : `$${result.price}`;
                option.innerHTML = `
                    <img src="${result.thumbnail}" alt="${result.title}" />
                    <span>${result.title}</span>
                    <small>${result.brand || ""} ${priceLabel}</small>
                `;

                option.addEventListener("click", async () => {
                    try {
                        await api(`/api/items/${item.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ storeProduct: result }),
                        });
                        await refresh();
                        setStatus(`Linked ${item.name} to ${result.title}.`);
                    } catch (error) {
                        setStatus(error.message, true);
                    }
                });

                resultGrid.appendChild(option);
            });

            picker.appendChild(resultGrid);
        } catch (error) {
            picker.innerHTML = "";
            setStatus(error.message, true);
        }
    });

    editBtn.addEventListener("click", async () => {
        const quantity = prompt(`Update quantity for ${item.name}:`, String(item.quantity));
        if (quantity === null) {
            return;
        }

        try {
            await api(`/api/items/${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ quantity }),
            });
            await refresh();
            setStatus(`Updated ${item.name}.`);
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    deleteBtn.addEventListener("click", async () => {
        const confirmed = confirm(`Delete ${item.name}?`);
        if (!confirmed) {
            return;
        }

        try {
            await api(`/api/items/${item.id}`, { method: "DELETE" });
            await refresh();
            setStatus(`Deleted ${item.name}.`);
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    return node;
}

function renderItems(items) {
    itemById.clear();
    itemsEl.innerHTML = "";
    if (!items.length) {
        itemsEl.innerHTML =
            '<p class="empty">No items yet. Add your first pantry or fridge item above.</p>';
        return;
    }

    items.forEach((item, index) => {
        itemById.set(item.id, item);
        const card = buildItemCard(item);
        card.style.setProperty("--stagger", String(index));
        itemsEl.appendChild(card);
    });
}

function renderShoppingList(entries) {
    const query = shoppingSearchEl.value.trim().toLowerCase();
    const locationFilter = shoppingLocationFilterEl.value;
    const categoryFilter = shoppingCategoryFilterEl.value;
    const matchedOnly = shoppingMatchedOnlyEl.checked;

    const filteredEntries = entries.filter((entry) => {
        const searchable = [
            entry.name,
            entry.location,
            entry.category,
            entry.storeProduct?.title || "",
        ]
            .join(" ")
            .toLowerCase();
        const queryMatch = !query || searchable.includes(query);
        const locationMatch = !locationFilter || entry.location === locationFilter;
        const categoryMatch = !categoryFilter || entry.category === categoryFilter;
        const matchFilter = !matchedOnly || Boolean(entry.storeProduct);
        return queryMatch && locationMatch && categoryMatch && matchFilter;
    });

    shoppingListEl.innerHTML = "";
    if (!entries.length) {
        shoppingListEl.innerHTML =
            '<p class="empty">You are fully stocked. No shopping needed.</p>';
        return;
    }

    if (!filteredEntries.length) {
        shoppingListEl.innerHTML =
            '<p class="empty">No shopping items match your current filters.</p>';
        return;
    }

    filteredEntries.forEach((entry, index) => {
        const row = document.createElement("article");
        row.className = "item-card";
        row.style.setProperty("--stagger", String(index));
        const storeImage = entry.storeProduct
            ? `<img class="shopping-thumb" src="${entry.storeProduct.thumbnail}" alt="${entry.storeProduct.title}" />`
            : "";
        const storeMeta = entry.storeProduct ? ` | matched: ${entry.storeProduct.title}` : "";
        row.innerHTML = `
      <div class="item-main">
        <h3>${entry.name}</h3>
                <p class="meta">Buy ${entry.needed} ${entry.unit} | ${entry.location} | ${entry.category}${storeMeta}</p>
      </div>
            <label class="shopping-check">
                <input type="checkbox" />
                <span>Purchased</span>
            </label>
            ${storeImage}
    `;

        const checkbox = row.querySelector("input[type='checkbox']");
        checkbox.addEventListener("change", async () => {
            if (!checkbox.checked) {
                return;
            }

            const sourceItem = itemById.get(entry.id);
            if (!sourceItem) {
                setStatus("Could not find matching inventory item.", true);
                checkbox.checked = false;
                return;
            }

            checkbox.disabled = true;
            try {
                const purchasedAmount = Number(entry.needed);
                const nextQuantity = Number(sourceItem.quantity) + purchasedAmount;

                await api(`/api/items/${entry.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ quantity: nextQuantity }),
                });

                setStatus(`Added ${purchasedAmount} ${entry.unit} of ${entry.name} to inventory.`);
                await refresh();
            } catch (error) {
                checkbox.disabled = false;
                checkbox.checked = false;
                setStatus(error.message, true);
            }
        });

        shoppingListEl.appendChild(row);
    });
}

function syncSelectOptions(selectEl, values, allLabel) {
    const selectedValue = selectEl.value;
    selectEl.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = allLabel;
    selectEl.appendChild(allOption);

    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        selectEl.appendChild(option);
    });

    if (values.includes(selectedValue)) {
        selectEl.value = selectedValue;
    }
}

function updateShoppingFilters(entries) {
    const locations = [...new Set(entries.map((entry) => entry.location))].sort();
    const categories = [...new Set(entries.map((entry) => entry.category))].sort();
    syncSelectOptions(shoppingLocationFilterEl, locations, "All locations");
    syncSelectOptions(shoppingCategoryFilterEl, categories, "All categories");
}

function renderShoppingListFromState() {
    renderShoppingList(currentShoppingEntries);
}

async function refresh() {
    try {
        const [items, shoppingList] = await Promise.all([
            api("/api/items"),
            api("/api/shopping-list"),
        ]);
        renderItems(items);
        currentShoppingEntries = shoppingList;
        updateShoppingFilters(shoppingList);
        renderShoppingListFromState();
    } catch (error) {
        setStatus(error.message, true);
    }
}

itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(itemForm);
    const payload = Object.fromEntries(formData.entries());

    try {
        await api("/api/items", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        itemForm.reset();
        itemForm.unit.value = "units";
        itemForm.location.value = "pantry";
        itemForm.category.value = "other";
        await refresh();
        setStatus("Item saved.");
    } catch (error) {
        setStatus(error.message, true);
    }
});

refreshBtn.addEventListener("click", refresh);
shoppingSearchEl.addEventListener("input", renderShoppingListFromState);
shoppingLocationFilterEl.addEventListener("change", renderShoppingListFromState);
shoppingCategoryFilterEl.addEventListener("change", renderShoppingListFromState);
shoppingMatchedOnlyEl.addEventListener("change", renderShoppingListFromState);
refresh();
