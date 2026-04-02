# 01shortaiproject

Netid: trbie
Name: Tristan Biesemeier
GitHub Repository: https://github.com/trbie/01shortaiproject

Idea:
Make a simple website that allows you to track what items you have in your pantry/fridge to make an automated shopping list

## Project overview

This is a full-stack pantry/fridge inventory app that helps users:

- Track current kitchen inventory
- Set minimum desired stock levels
- Generate an automatic shopping list for understocked items
- Match inventory items to real product listings and images from external store/catalog APIs
- Mark shopping items as purchased to auto-update inventory

The app is currently configured for local development (`localhost`) and uses a JSON file as its data store.

## Implemented features

### Inventory management

- Add items with: name, quantity, unit, location, category, and minimum desired quantity
- Edit existing inventory quantities
- Delete items
- Persist changes to `data/store.json`

### Smart shopping list

- Automatically computes required items where `quantity < minDesired`
- Shows needed amount (`minDesired - quantity`)
- Includes location and category metadata
- Supports purchase checkboxes:
    - Checking an item updates inventory by the needed amount
    - Refreshed shopping list removes items once stock reaches minimum

### Product matching and images

- Search external store/catalog APIs for products
- Link a specific product to any inventory item
- Display linked product image/title in inventory and shopping list
- Support unlinking matched products

### Shopping list search and filtering

- Text search across item fields
- Filter by location
- Filter by category
- Optional toggle: show matched-product items only

## Tech stack

- Backend: Node.js + Express
- Frontend: HTML, CSS, vanilla JavaScript
- Storage: local JSON file (`data/store.json`)
- External product data: catalog/store APIs (proxy endpoint via backend)

## Project structure

- `server.js`: Express server and REST API routes
- `public/index.html`: main UI markup
- `public/styles.css`: app styling and responsive layout
- `public/app.js`: frontend logic (CRUD, shopping logic, product matching, filters)
- `data/store.json`: persisted inventory data
- `package.json`: scripts and dependencies
- `.gitignore`: excludes dependencies, env files, logs, and build artifacts

## Local setup and run

1. Install dependencies

```bash
npm install
```

2. Start the server

```bash
npm start
```

3. Open the app

```text
http://localhost:3000
```

## API reference

### Inventory routes

- `GET /api/items`
    - Returns all inventory items sorted by name.

- `POST /api/items`
    - Creates a new inventory item.
    - Body fields: `name`, `quantity`, `minDesired`, `unit`, `location`, `category`, optional `storeProduct`.

- `PATCH /api/items/:id`
    - Updates an existing inventory item.
    - Supports partial updates (for example: quantity-only updates).

- `DELETE /api/items/:id`
    - Deletes an inventory item.

### Shopping route

- `GET /api/shopping-list`
    - Returns understocked items with computed `needed` values.

### Product search route

- `GET /api/store/search?q=<term>&limit=<n>`
    - Searches external product catalogs.
    - Returns product options for linking (with image, title, brand, and price when available).

## How shopping updates inventory

For each shopping list item:

- Needed quantity is computed as:
    - `needed = minDesired - quantity`
- When marked as purchased in UI:
    - New inventory quantity is set to:
    - `quantity = quantity + needed`
- Item no longer appears in shopping list after refresh (because it is no longer under minimum).

## Notes and troubleshooting

- Port already in use (`EADDRINUSE: 3000`):
    - Another server is already running on port `3000`.
    - Stop the existing process or run with a different port, for example:

```bash
PORT=3001 npm start
```

- Data persistence:
    - Inventory is stored in `data/store.json` and remains between restarts.

- External product APIs:
    - Product search results depend on third-party API availability/quality.
    - If one source is unavailable, results may be reduced.

## Future improvements

- User authentication and per-user inventories
- Deployable database (SQLite/PostgreSQL) instead of JSON storage
- Shopping history and analytics
- Bulk actions (buy all / clear matched filters)
