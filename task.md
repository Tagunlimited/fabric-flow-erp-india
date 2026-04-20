# Task Log

This file tracks requested tasks completed in this workspace.
I will keep appending new completed tasks with timestamped entries.

## 2026-04-21 00:25:48 IST

- Fixed universal search reliability in `src/components/UniversalSearchBar.tsx` (customers/orders/invoices/products), removed invalid schema assumptions, and added safer query fallbacks.
- Added quotation search/open support in universal search and improved result labels/tags (Orders, Customers, Invoices, Quotations, etc.).
- Added/standardized `Show completed` filter behavior across Accounts list pages:
  - `src/pages/accounts/QuotationsPage.tsx`
  - `src/pages/accounts/InvoicePage.tsx`
  - `src/pages/accounts/ReceiptPage.tsx`
  - `src/pages/accounts/ReceivablesPage.tsx`
- Added Orders-style column funnel filters to Accounts tables:
  - `src/pages/accounts/QuotationsPage.tsx`
  - `src/pages/accounts/InvoicePage.tsx`
  - `src/pages/accounts/ReceiptPage.tsx` (View Txn table)
  - `src/pages/accounts/ReceivablesPage.tsx`
- Added same column funnel filters to Customer list table:
  - `src/components/customers/CustomerList.tsx`
- Added same column funnel filters to Readymade Orders table:
  - `src/pages/orders/ReadymadeOrdersPage.tsx`

## 2026-04-21 00:29:57 IST

- Added same Orders-style column funnel filters on BOM tabs for both sections:
  - `Pending` tab table (`OrdersWithoutBom`) in `src/components/purchase-orders/BomTabsPage.tsx`
  - `Complete` tab table (`OrdersCompleteBom`) in `src/components/purchase-orders/BomTabsPage.tsx`
- Added per-column filter dialogs and clear actions for BOM columns:
  - `Order #`, `Customer`, `Products`, `Status`, `Order Date`, `Delivery Date`

## 2026-04-21 00:32:15 IST

- Removed the top `Total Orders` summary card from BOM pending view in `src/components/purchase-orders/BomTabsPage.tsx` as requested.

## 2026-04-21 00:34:06 IST

- Updated BOM tab classification in `src/components/purchase-orders/BomTabsPage.tsx`:
  - Orders with status `dispatched` are now treated as closed for BOM workflow.
  - Such orders are excluded from `Pending` and shown in `Complete` (even if a BOM line is missing).

## 2026-04-21 00:35:58 IST

- Made BOM tabs section sticky/scroll behavior in `src/components/purchase-orders/BomTabsPage.tsx`:
  - `Pending/Complete` switch is sticky.
  - Table headers are sticky.
  - Scrolling is constrained to table content area rather than the whole page.

## 2026-04-21 00:37:39 IST

- Tightened BOM table sticky behavior by making each column header cell sticky in both tabs:
  - Updated `TableHead` cells with `sticky top-0 z-10 bg-background` in `src/components/purchase-orders/BomTabsPage.tsx`.

## 2026-04-21 00:54:43 IST

- Added Orders-style column funnel filters to Inventory tables so the same per-column filter dialog behavior is available in Inventory subpages:
  - `src/components/warehouse/ReceivingZoneInventory.tsx`
  - `src/components/warehouse/StorageZoneInventory.tsx`
  - `src/pages/inventory/ProductInventoryPage.tsx`
  - `src/components/inventory/FabricManagerNew.tsx`
  - `src/components/inventory/SizeTypeManager.tsx`

## 2026-04-21 01:04:53 IST

- Added the same column-level filter (header icon + dialog + clear action) to Production page `Active Orders` table in:
  - `src/pages/ProductionPage.tsx`

## 2026-04-21 02:18:00 IST

- Completed app-wide operational Phase 1 column filter rollout (header filter icon + per-column dialog + clear filters) on:
  - `src/components/purchase-orders/PurchaseOrderList.tsx`
  - `src/components/goods-receipt-notes/GRNList.tsx`
  - `src/pages/production/CuttingManagerPage.tsx`
  - `src/pages/production/AssignOrdersPage.tsx`
- Verified Phase 1 changes are lint-clean.

## 2026-04-21 02:18:00 IST

- Completed app-wide operational Phase 2 column filter rollout on remaining planned pages:
  - `src/pages/production/TailorManagementPage.tsx`
  - `src/pages/production/OrderCompletionReportPage.tsx`
  - `src/pages/orders/OrderBatchAssignmentPage.tsx`
  - `src/pages/crm/LeadsPage.tsx`
  - `src/pages/ProcurementPage.tsx`
- Added consistent column filter behavior (column trigger, dialog input, per-column clear, clear-all action near controls) and kept existing search/status flows working.

