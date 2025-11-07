# CSV Import Template Guide

This template is ready to upload through the inventory import feature. Columns match the backend schema (product → variant → stock ledger).

## Columns
- **brand**: Required. Use consistent casing (e.g., `Nike`).
- **model**: Required. Product display name.
- **category**: Use one of the predefined store categories below. Additional categories can be added through Settings before import.
- **color**: Variant color description.
- **size_scale**: Allowed values: `EU`, `US`, `UK`, `CM`.
- **size**: Size label within the chosen scale. Accepts decimals for half sizes.
- **sku**: Unique per variant. Recommended format `BRAND-MODEL-COLOR-SIZE` with abbreviated brand.
- **barcode**: Optional numeric or alphanumeric code. Leave blank to auto-generate later.
- **price**: Selling price in IDR (no thousand separators).
- **cost**: Latest purchase cost in IDR.
- **qty**: On-hand quantity for the variant.
- **tags**: Comma-separated tags wrapped in quotes if multiple. Helps with search.
- **description**: Customer-facing details (max 255 chars suggested).
- **notes**: Internal notes (e.g., `Legacy stock`, `New arrival`).

## Pre-filled categories
- Sneakers
- Running
- Training
- Football
- Formal
- Sandal
- Kids
- Unisex Canvas

## Size scale tips
| Scale | Typical Use | Example Entry |
|-------|-------------|---------------|
| EU    | General Indonesian retail | `41` |
| US    | Canvas & running shoes | `9` |
| UK    | Football boots | `8` |
| CM    | Performance/Asian sizing | `27.5` |

## Example rows
The CSV file includes both **legacy stock** and **new arrival** examples across each size scale. Duplicate the rows for additional sizes, update SKU/barcode/qty, and adjust category/color as needed.

## Import workflow
1. Download `csv_import_template.csv` and edit in Google Sheets or Excel.
2. Keep the header row intact.
3. Fill one row per size/color variant.
4. Export/download as CSV (UTF-8) and upload via **Inventory → Import CSV**.
5. Review the preview diff for validation errors before applying.

> Tip: Use filters in Sheets to separate `Legacy stock` vs `New arrival` using the **notes** column during the counting project.
