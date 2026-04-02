const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "store.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function ensureDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify({ items: [] }, null, 2), "utf8");
    }
}

async function readStore() {
    await ensureDataFile();
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(raw || "{}");
    if (!Array.isArray(data.items)) {
        return { items: [] };
    }
    return data;
}

async function writeStore(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function normalizeStoreProduct(input, existing = null) {
    const source = input ?? existing;
    if (!source || typeof source !== "object") {
        return null;
    }

    const id = String(source.id ?? "").trim();
    const title = String(source.title ?? "").trim();
    const thumbnail = String(source.thumbnail ?? "").trim();
    if (!id || !title || !thumbnail) {
        return null;
    }

    return {
        id,
        title,
        thumbnail,
        brand: String(source.brand ?? "").trim(),
        price: Number.isFinite(Number(source.price)) ? Number(source.price) : null,
    };
}

function normalizeItem(input, existing = null) {
    const name = String(input.name || existing?.name || "").trim();
    if (!name) {
        return { error: "Item name is required." };
    }

    const quantity = Number(input.quantity ?? existing?.quantity ?? 0);
    const minDesired = Number(input.minDesired ?? existing?.minDesired ?? 1);
    if (!Number.isFinite(quantity) || quantity < 0) {
        return { error: "Quantity must be a number >= 0." };
    }
    if (!Number.isFinite(minDesired) || minDesired < 0) {
        return { error: "Minimum desired must be a number >= 0." };
    }

    return {
        id: existing?.id || randomUUID(),
        name,
        quantity,
        unit: String(input.unit ?? existing?.unit ?? "units").trim() || "units",
        minDesired,
        location: String(input.location ?? existing?.location ?? "pantry").trim() || "pantry",
        category: String(input.category ?? existing?.category ?? "other").trim() || "other",
        storeProduct: normalizeStoreProduct(input.storeProduct, existing?.storeProduct),
        updatedAt: new Date().toISOString(),
    };
}

function buildShoppingList(items) {
    return items
        .filter((item) => item.quantity < item.minDesired)
        .map((item) => ({
            id: item.id,
            name: item.name,
            location: item.location,
            category: item.category,
            needed: Number((item.minDesired - item.quantity).toFixed(2)),
            unit: item.unit,
            storeProduct: item.storeProduct || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function scoreProduct(product, rawQuery) {
    const query = rawQuery.toLowerCase();
    const haystack = `${product.title} ${product.brand}`.toLowerCase();
    if (!haystack) {
        return 0;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    let score = haystack.includes(query) ? 6 : 0;
    tokens.forEach((token) => {
        if (haystack.includes(token)) {
            score += 2;
        }
    });
    return score;
}

function pickThumbnail(images = []) {
    const valid = images.filter((img) => typeof img === "string" && img.trim());
    const httpsImage = valid.find((img) => img.startsWith("https://"));
    const httpImage = valid.find((img) => img.startsWith("http://"));
    return httpsImage || httpImage || "";
}

async function searchDummyJsonProducts(query, limit) {
    const apiUrl = new URL("https://dummyjson.com/products/search");
    apiUrl.searchParams.set("q", query);
    apiUrl.searchParams.set("limit", String(limit));

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error("dummyjson-failed");
    }

    const payload = await response.json();
    const products = Array.isArray(payload.products) ? payload.products : [];
    return products
        .map((product) => ({
            id: `dummyjson-${String(product.id)}`,
            title: String(product.title || "").trim(),
            thumbnail: String(product.thumbnail || "").trim(),
            brand: String(product.brand || "").trim(),
            price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
        }))
        .filter((product) => product.id && product.title && product.thumbnail);
}

async function searchUpcItemDbProducts(query, limit) {
    const apiUrl = new URL("https://api.upcitemdb.com/prod/trial/search");
    apiUrl.searchParams.set("s", query);

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error("upcitemdb-failed");
    }

    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items
        .slice(0, limit)
        .map((product) => ({
            id: `upcitemdb-${String(product.upc || product.ean || randomUUID())}`,
            title: String(product.title || "").trim(),
            thumbnail: pickThumbnail(product.images),
            brand: String(product.brand || "").trim(),
            price: Number.isFinite(Number(product.lowest_recorded_price))
                ? Number(product.lowest_recorded_price)
                : null,
        }))
        .filter((product) => product.id && product.title && product.thumbnail);
}

function dedupeAndRankProducts(products, query, limit) {
    const seen = new Set();
    const unique = [];

    products.forEach((product) => {
        const dedupeKey = `${product.title.toLowerCase()}|${product.brand.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
            return;
        }
        seen.add(dedupeKey);
        unique.push(product);
    });

    unique.sort((a, b) => {
        const scoreDiff = scoreProduct(b, query) - scoreProduct(a, query);
        if (scoreDiff !== 0) {
            return scoreDiff;
        }
        return a.title.localeCompare(b.title);
    });

    return unique.slice(0, limit);
}

app.get("/api/store/search", async (req, res) => {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 20);
    if (!query) {
        return res.status(400).json({ error: "Query parameter q is required." });
    }

    try {
        const [dummyJsonResult, upcItemDbResult] = await Promise.allSettled([
            searchDummyJsonProducts(query, limit),
            searchUpcItemDbProducts(query, limit),
        ]);

        const merged = [];
        if (dummyJsonResult.status === "fulfilled") {
            merged.push(...dummyJsonResult.value);
        }
        if (upcItemDbResult.status === "fulfilled") {
            merged.push(...upcItemDbResult.value);
        }

        if (!merged.length) {
            return res.status(502).json({ error: "Store API request failed." });
        }

        return res.json(dedupeAndRankProducts(merged, query, limit));
    } catch {
        return res.status(502).json({ error: "Could not reach store API right now." });
    }
});

app.get("/api/items", async (_req, res) => {
    const store = await readStore();
    const items = [...store.items].sort((a, b) => a.name.localeCompare(b.name));
    res.json(items);
});

app.post("/api/items", async (req, res) => {
    const store = await readStore();
    const normalized = normalizeItem(req.body);
    if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
    }

    store.items.push(normalized);
    await writeStore(store);
    return res.status(201).json(normalized);
});

app.patch("/api/items/:id", async (req, res) => {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: "Item not found." });
    }

    const normalized = normalizeItem(req.body, store.items[index]);
    if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
    }

    store.items[index] = normalized;
    await writeStore(store);
    return res.json(normalized);
});

app.delete("/api/items/:id", async (req, res) => {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: "Item not found." });
    }

    const [removed] = store.items.splice(index, 1);
    await writeStore(store);
    return res.json(removed);
});

app.get("/api/shopping-list", async (_req, res) => {
    const store = await readStore();
    res.json(buildShoppingList(store.items));
});

app.listen(PORT, () => {
    console.log(`Pantry app running at http://localhost:${PORT}`);
});
