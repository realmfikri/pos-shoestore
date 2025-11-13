# UMKM Shoe Store POS — Plan & Specs (MVP → V1.0)

**Context:** Retail shoe store in Indonesia with no current inventory system. Staff has low tech familiarity (gaptek). Deployed on your VPS, accessed from phone/tablet and a cashier PC. Data may be incomplete for older stock. Needs photo capture, flexible attributes, brand classification, fast search, and easy onboarding.

---

## 0) TL;DR choices

* **Path A — Fork & customize (fastest to usable):** Start from **Open Source Point of Sale (OSPOS)** or **NexoPOS (Laravel)**. Pros: full POS + reports out of the box. Cons: UI/UX not tailored, harder to add photo-first inventory, variants (sizes/colors) can be clunky.
* **Path B — Build focused MVP (my rec):** Lightweight **React (Vite) + Fastify + PostgreSQL** with **photo‑first inventory capture**, **variants**, and **offline‑tolerant checkout (PWA)**. Grow features gradually. Pros: perfect UX for your store, simpler mental model, modern stack. Cons: 1–2 weeks to MVP with steady iteration.

**Recommendation:** Path B now (MVP in ~a few coding days of agent-time). Keep a Path A fallback branch if you want instant baseline.

## Deployment & Operations

For the current Axioo Hype 5 deployment (Fastify API, Nginx-served Vite build, MinIO, cloudflared) see [`docs/deployment.md`](docs/deployment.md). It lists the directory layout, environment files, systemd units, and manual deployment steps.

---

## 1) Goals & constraints

* **Primary goals:**

  * Make it *easy* for staff to **add items** quickly with **photo-first** capture; missing fields allowed.
  * **Sell fast:** POS screen optimized for keyboard/scanner and touch; cash first, later add QRIS.
  * **Track stock** accurately using a **stock ledger** (every in/out is recorded).
  * **Searchable inventory** by brand, model, color, size, price, tag, and free-text.
  * **Variants** (size/color) done correctly for shoes.
* **Constraints:** low-tech staff, low-cost, runs on your **Biznet VPS**. Must work on **cheap Android** phones via browser.

---

## 2) Personas & environments

* **Owner (Ayah):** Wants simple daily/weekly sales report, alerts for low stock, oversight from phone.
* **Cashier:** Needs a POS screen: scan barcode / search by name, add to cart, apply discount, record cash, print receipt.
* **Stocker (employee):** Needs quick add/update inventory from phone: take photo, pick/enter brand, model, sizes, qty.

**Devices:** Android phone (Chrome), small Windows PC with thermal printer, optional barcode scanner (USB/LAN).

---

## 3) MVP scope

**Must‑have**

1. **Auth & roles:** Owner, Cashier, Stocker (RBAC).
2. **Inventory:** Product → Variant (size/color) → SKU with **stock ledger** and images.
3. **POS checkout:** Search/scan, cart, line discounts, subtotal, tax (optional), total, payment (cash), receipt print.
4. **Purchasing/Receiving:** Create **Supplier**, **Purchase Order (PO)**, **Goods Receipt (GRN)** to add stock.
5. **Stock operations:** Adjustments (damaged/lost), stock count (cycle count), history per SKU.
6. **Search & filters:** By brand, category, size, color, tag, price; fuzzy text.
7. **Reports:** Daily sales summary, top items/brands, low stock.
8. **Media:** Upload item photo(s); generate barcode/QR labels.
9. **CSV/Sheet import:** Bulk add/update, tolerant to missing columns.
10. **Settings:** Store profile, receipt header/footer, currency (IDR), tax toggle, store hours, low-stock thresholds.

**Nice‑to‑have (V1.0)**

* PWA installable, **offline cart cache** if connection drops (sync later).
* **QRIS** via third-party or manual QR upload (later).
* Simple **customer** record (name/phone) for returns/loyalty later.

---

## 4) UX blueprint

### 4.1 Photo‑first Quick Add (mobile)

* Big **“Tambah Barang Cepat”** button → open camera → capture 1–3 photos.
* Minimal fields: **Brand** (dropdown + add new), **Nama Model** (free text), **Kategori** (Sneakers, Sandal, Formal, Kids), **Warna** (optional), **Harga jual**, **Catatan**.
* **Variants wizard:** Choose **size scale** (EU/US/UK/CM), tick sizes present (e.g., 38–43), enter per‑size qty.
* Save → creates Product + Variants + Stock ledger entries ("initial_count").
* Later enrichment via **“Lengkapi Data”** pane.

### 4.2 POS (kasir)

* Left: **Search** (type model/brand/size) or **Scan**.
* Middle: **Cart** with line qty +/- and per‑line discount.
* Right: totals and **Bayar** dialog with presets (50k/100k), cash tender/ change.
* **Receipt print** to 58mm.

### 4.3 Stock intake

* Create **PO** with supplier → **Receive** → input quantities (by variant), optional cost price.

### 4.4 Search & manage

* Inventory list with **chips filters** (Brand, Category, Size, Color, Tags) + full‑text.
* Item detail page shows photos, variants table, stock history timeline.

---

## 5) Data model (PostgreSQL)

**Why Postgres:** strong relational + **JSONB** for flexible attributes; full‑text search; good on VPS.

### Core tables

* `brand(id, name, alias[], created_at)`
* `product(id, brand_id, name, category, description, attributes jsonb, default_tax_rate, created_at)`

  * `attributes` example: `{ material: "leather", gender: "men", season: "rainy" }`
* `variant(id, product_id, color, size_scale, size_value, sku, barcode, attributes jsonb)`

  * `size_scale` ∈ {EU, US, UK, CM}; `size_value` string to allow half sizes ("42.5").
* `stock_ledger(id, variant_id, change, reason, ref_type, ref_id, unit_cost, created_at, user_id)`

  * reasons: `initial_count | purchase | sale | return_in | return_out | adjust | transfer`
* `sale(id, cashier_id, total, pay_method, paid_cash, change, created_at)`
* `sale_item(id, sale_id, variant_id, qty, unit_price, discount_amount)`
* `supplier(id, name, phone, note)`
* `purchase_order(id, supplier_id, status, created_at)`
* `po_item(id, purchase_order_id, variant_id, qty_ordered, unit_cost)`
* `goods_receipt(id, purchase_order_id, received_at, receiver_id)`
* `gr_item(id, goods_receipt_id, variant_id, qty_received, unit_cost)`
* `media(id, owner_type, owner_id, url, alt, created_at)`
* `user(id, name, email, role, password_hash, status)`
* `setting(key, value jsonb)`

**Views/Indexes:**

* `current_stock(variant_id, qty)` as SUM(stock_ledger.change).
* `product_search_idx` on brand+name and JSONB keys.

---

## 6) API (REST, zod‑validated)

* **Auth**

  * `POST /api/auth/login` → {token}
* **Inventory**

  * `POST /api/products` {brand_id|brand_name, name, category, attributes}
  * `POST /api/products/:id/variants` {color, size_scale, size_value[], sku?}
  * `POST /api/stock/initial` {variant_id, qty}
  * `GET /api/inventory?search=&brand=&size=&color=&page=`
  * `POST /api/media/upload` (signed‑URL) → then PUT to storage
* **POS**

  * `GET /api/variants/:id` | `GET /api/scan/:barcode`
  * `POST /api/sales` {items:[{variant_id, qty, unit_price, discount}] , pay_method, paid_cash}
  * `GET /api/sales/:id/receipt`
* **Purchasing**

  * `POST /api/suppliers` | `POST /api/po` | `POST /api/po/:id/receive`
* **Reports**

  * `GET /api/reports/sales/daily?date=`
  * `GET /api/reports/top-items?range=7d`

All endpoints require `Authorization: Bearer <JWT>` except login; **Cashier** scoped to POS routes.

---

## 7) Tech stack

* **Frontend:** React + Vite, TypeScript, Tailwind, TanStack Query, React Hook Form, Zod, **PWA** (service worker), **@zxing/browser** for barcode via camera.
* **Backend:** Node.js + **Fastify**, TypeScript, Zod validation, **Prisma** ORM, **PostgreSQL**, **Redis** (optional for caching sessions/rate limit).
* **File storage:** **MinIO** on VPS or **Cloudflare R2** (cheap) for images; serve via signed URLs.
* **Search:** Postgres `tsvector` with trigram/fuzzy.
* **Printing:** HTML receipt → browser print (58mm CSS). Optionally **QZ Tray**/**ESC/POS** for LAN printers later.

---

## 8) Deployment (on your Biznet VPS)

* **Subdomains:** `app.muhamadfikri.com` (frontend), `api.muhamadfikri.com` (backend), `cdn.muhamadfikri.com` (images) via Cloudflare DNS.
* **Nginx** reverse proxy → backend `:4000`, frontend static `:4173` (or served by Nginx), MinIO `:9000` (restrict).
* **SSL:** Let’s Encrypt (Certbot) or Cloudflare proxy (Flexible/Full strict) — prefer Full (strict).
* **Systemd services:** `pos-api.service`, `pos-frontend.service`, `minio.service`.
* **Backups:** Nightly `pg_dump` → `/var/backups/pos/` + rclone to Cloud storage; weekly MinIO bucket sync.
* **Monitoring:** Uptime Kuma + simple `healthz`/`readyz` endpoints.
* **.env (examples):**

  * API: `DATABASE_URL=...`, `JWT_SECRET=...`, `STORAGE_BUCKET=...`, `STORAGE_ENDPOINT=...`, `CORS_ORIGIN=https://app.muhamadfikri.com`
  * Frontend: `VITE_API_BASE=https://api.muhamadfikri.com`

---

## 9) Data entry plan (Day 0 → Day 7)

* **Day 0 (Prep):** Print simple **shelf labels** with brand/model placeholders; set size scales; set categories.
* **Day 1–2 (Capture old stock):** Staff uses **Photo‑first Quick Add** per model:

  1. Photo front/side/sole; 2) choose/create **Brand**; 3) enter **Model name**; 4) pick **sizes present**; 5) enter qty per size; 6) optional color/material.
* **Day 3:** Receive new stock using **PO → Receive** so ledger is correct.
* **Day 4–7:** Enrich data: add price, cost, tags, and barcodes. Use CSV bulk update for prices.

---

## 10) Labels & Barcodes

* **SKU pattern:** `BRND-MDL-COLOR-SIZE` (e.g., `NIKE-AIRMAX-BLK-42`).
* **Barcode:** Generate **Code‑128** (free) per variant. Label size 30×20mm with SKU, size, price.

---

## 11) Reports (MVP)

* **Daily sales** (table + chart), **Top brands**, **Top SKUs**, **Low stock** (per brand), **Gross margin** (if cost provided).

---

## 12) Security & permissions

* Roles: **Owner** (all), **Cashier** (POS only, read inventory), **Stocker** (inventory create/update, no sales).
* Rate limit login; password rules; optional **PIN login** for cashier.
* Audit via **stock_ledger** + `updated_by` columns.

---

## 13) Roadmap

* **MVP (week 1):** Auth, Inventory (Product/Variant), Stock ledger, POS cash, Daily sales, CSV import, Photos.
* **V1.0 (week 2):** PO/GRN, Labels, Low stock alerts (WhatsApp/Telegram via webhook), PWA offline cart.
* **V1.1:** QRIS, Returns/exchanges, Customer profiles.
* **V1.2:** Multi‑store, transfers, forecasting.

---

## 14) Acceptance criteria (key flows)

* **Quick Add**: From new product to variants with initial stock in ≤ 60s on Android.
* **Checkout**: Add items by scan/search, finish cash sale and print in ≤ 30s.
* **Stock**: Ledger shows correct running balance after sale and receive.

---

## 15) Tickets for Codex (copy/paste to issues)

1. **Scaffold backend (Fastify + Prisma)**

   * Create Fastify TS app with healthz/readyz.
   * Prisma schema for tables in §5.
   * JWT auth; RBAC middleware.
   * Zod request validation; error handler.
   * Acceptance: `pnpm dev` runs; migrations applied; `GET /healthz`=200.

2. **Inventory endpoints**

   * `POST /api/products`, `POST /api/products/:id/variants`, `GET /api/inventory` with filters + full‑text.
   * View `current_stock` via SQL view.
   * Acceptance: Can create product with variants and list/search them.

3. **Stock ledger + initial count**

   * Endpoint `POST /api/stock/initial` writes ledger entries; SQL view updates.
   * Acceptance: After initial count, `current_stock` shows correct qty.

4. **Media upload (signed URL)**

   * Integrate MinIO SDK; `POST /api/media/signed-url` then client PUT.
   * Acceptance: Upload from browser to MinIO; URL saved in `media`.

5. **POS endpoints & sale posting**

   * `POST /api/sales` applies stock deductions via ledger; compute change.
   * Receipt JSON endpoint `GET /api/sales/:id/receipt`.
   * Acceptance: Sale reduces stock; returns receipt payload.

6. **Suppliers + PO/GRN**

   * CRUD suppliers; `POST /api/po`; `POST /api/po/:id/receive` adds ledger `purchase`.
   * Acceptance: Receiving increases stock; PO status updates.

7. **Frontend scaffold (Vite + Tailwind + PWA)**

   * Routes: `/login`, `/pos`, `/inventory`, `/receive`, `/reports`.
   * Store API base via `VITE_API_BASE`.
   * Acceptance: Login stores JWT; protected routes work.

8. **POS UI**

   * Search/scan (zxing), cart list, payment dialog, print receipt CSS 58mm.
   * Acceptance: Full cash sale from browser.

9. **Quick Add UI (mobile‑first)**

   * Camera capture, minimal fields, variant wizard with size scale selector.
   * Acceptance: Create product + variants + initial stock in ≤ 60s.

10. **CSV import**

* Upload CSV → map columns → preview diff → apply upserts.
* Acceptance: Import ≥ 100 SKUs under 30s locally.

11. **Reports UI**

* Daily sales, Top items/brands, Low stock.
* Acceptance: Queries load <1s on 5k rows.

12. **Deploy & ops**

* Nginx confs for `api.` and `app.` subdomains; systemd services; pg backups.
* Acceptance: Both sites live over HTTPS; nightly dump exists.

---

## 16) CSV template (for import)

```
brand,model,category,color,size_scale,size,sku,barcode,price,cost,qty,tags
Nike,Air Max 90,Sneakers,Black,EU,42,NIKE-AM90-BLK-42,,1500000,900000,2,"cushion,men"
Adidas,Superstar,Sneakers,White,EU,40,ADID-SS-WHT-40,2001234567890,1300000,800000,1,"classic,unisex"
```

---

## 17) Sample `.env`

```
# API
DATABASE_URL=postgresql://pos:***@127.0.0.1:5432/pos
JWT_SECRET=change_me
STORAGE_ENDPOINT=https://cdn.muhamadfikri.com
STORAGE_BUCKET=pos
STORAGE_ACCESS_KEY=***
STORAGE_SECRET_KEY=***
CORS_ORIGIN=https://app.muhamadfikri.com

# Frontend
VITE_API_BASE=https://api.muhamadfikri.com
```

---

## 18) Risks & mitigations

* **Photos balloon storage** → Use WebP resize on upload (max 1280px), lifecycle policy (keep last 3 photos/product).
* **Printer pain** → Start with browser print; add QZ Tray later if needed.
* **Staff training** → 30‑minute run‑through + laminated cheat‑sheet with screenshots.
* **Dirty data / duplicates** → Fuzzy dedupe tool: same brand + similar model + same color.

---

## 19) If you choose to fork instead

* **OSPOS (PHP):** Quick setup, barcode/labels, reports. Customizing modern mobile UX is harder.
* **NexoPOS (Laravel):** Newer UI, paid modules available; customization in PHP/Laravel.
* **ERPNext/Odoo:** Very complete but heavy; overkill for single store MVP.

**Fork plan:** deploy one of these, then build a **lightweight mobile app** just for **Photo‑first Quick Add** that pushes to its DB via a thin API adapter.

---

## 20) Size scale reference (Indonesia retail)

* Provide EU/US/UK/CM mapping table in the UI to avoid mistakes; store actual sold size as entered (no auto convert) to keep inventory exact.

---

**Done.** Next step: pick **Path B** and start with Tickets 1–3. When ready, I’ll generate systemd + nginx snippets and a backup script.
