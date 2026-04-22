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

## 2026-04-21 19:04:00 IST

- Fixed BOM page scroll regression in `src/components/purchase-orders/BomTabsPage.tsx`:
  - Restored normal page scroll when opening the line-picker/form (`pickOrder` view) by avoiding fixed-height/overflow-constrained layout in that mode.
  - Removed sticky behavior from the top tab switch container so only table headers remain sticky.
  - Kept sticky table-header behavior intact for Pending/Complete order table views.

## 2026-04-21 19:08:33 IST

- Added `Sales Manager` support to receivables table in `src/pages/accounts/ReceivablesPage.tsx`:
  - Added new `Sales Manager` column in the `Outstanding orders` table.
  - Loaded sales manager display info (name/avatar) from `employees` using `orders.sales_manager`.
  - Added column-level filter support for `Sales Manager`.

## 2026-04-21 19:11:11 IST

- Added interactive sales-manager receivables analytics in `src/pages/accounts/ReceivablesPage.tsx`:
  - Added `Pending by sales manager` bar chart (pending amount aggregation by manager).
  - Enabled click-to-filter behavior on chart bars to filter `Outstanding orders` table to the selected manager.
  - Added `Clear` action on the chart card to remove manager selection filter.

## 2026-04-21 19:34:23 IST

- Implemented full fix for automatic role override regression (admin getting reset to sales manager), including client, backend, DB guardrails, and regression coverage:
  - Stopped client auth fallback from mutating DB roles/status in `src/components/auth/AuthProvider.tsx` (removed role/status upsert overwrite behavior).
  - Hardened profile lookup/bootstrap behavior in `src/lib/auth.ts`:
    - removed auto profile creation from `getUserProfile` fallback path,
    - changed `createUserProfile` to `insert` (no upsert overwrite) with safer default status.
  - Added strict role validation (no silent fallback to sales manager) in employee account creation flows:
    - `supabase/functions/create-employee-user/index.ts`
    - `src/components/admin/EmployeeAccessManagement.tsx` (`employee` mapping corrected to valid role usage).
  - Added DB migration to enforce strict role normalization in RPC function:
    - `supabase/migrations/20260421193000_harden_employee_role_validation.sql`
  - Added DB migration to align signup trigger metadata handling (`name`/`full_name`) and safe defaults:
    - `supabase/migrations/20260421194000_align_handle_new_user_defaults.sql`
  - Added DB guardrails migration so only admins can change `profiles.role` and `profiles.status`:
    - `supabase/migrations/20260421195000_guard_profiles_role_status_updates.sql`
  - Added audit + repair migration for likely downgraded admin profiles:
    - `supabase/migrations/20260421200000_audit_and_repair_profile_role_downgrades.sql`
    - includes suspicious-downgrade view and admin-only repair function.
  - Added regression coverage for role persistence/edit visibility and runnable script:
    - `tests/role-regression.test.mjs`
    - `package.json` script: `test:roles`
  - Added helper guards used as executable policy references:
    - `src/lib/roleAccessGuards.ts`

## 2026-04-21 19:40:10 IST

- Removed `Status Diagnostics (Admin)` UI section from order detail page in `src/pages/orders/OrderDetailPage.tsx`.
- Cleaned related state usage so no unused-variable lint warnings remain.

## 2026-04-21 19:51:19 IST

- Implemented Orders media link support (Orders-only scope) with open-in-new-tab behavior for Canva/Dropbox/other URLs:
  - Updated `src/components/orders/OrderForm.tsx`:
    - Added `Add Link` inputs for `Reference Images`, `Mockup Images`, and `Attachments`.
    - Added minimal URL validation (`http/https`) and duplicate prevention for media links.
    - Enabled mixed media arrays (`File` + URL string) for reference/mockup/attachments.
    - Preserved external links during submit by merging link URLs with uploaded storage URLs.
    - Added open/remove actions in attachment list and improved append behavior for uploaded attachments.
  - Updated `src/pages/orders/OrderDetailPage.tsx`:
    - Added explicit `Open` actions for main mockup/reference image and per-thumbnail entries.
    - Kept existing attachment download/open behavior intact.
- Verified edited files are lint-clean.

