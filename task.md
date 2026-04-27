# Task Log

This file tracks requested tasks completed in this workspace.
I will keep appending new completed tasks with timestamped entries.

## 2026-04-26 18:40:00 IST

- Fixed receipt-gating root cause so orders cannot progress into design/procurement flows without at least one active order receipt:
  - `src/hooks/useOrdersWithReceipts.ts`
    - tightened receipt filtering to keep only `reference_type=order` rows with non-cancelled status and valid order linkage.
    - retained schema-compat fallback while removing permissive inclusion behavior.
  - `supabase/migrations/20260423100000_harden_partial_cut_assign_quantities.sql`
    - hardened `recalc_order_status` receipt check to only consider active order receipts.
    - enforced lifecycle progression gate: status remains `pending` until receipt exists; all forward stages run only after receipt.
  - `src/pages/orders/OrderDetailPage.tsx`
    - removed auto-advance bypass by gating mockup-driven `designing_done` updates behind active-receipt checks.
  - `src/pages/OrdersPage.tsx`
  - `src/pages/OrdersPageCached.tsx`
    - added UI-level guard in manual status change handler to block forward statuses when no active receipt exists.

- Validation:
  - build passed: `npm run build`
  - edited-file lint diagnostics: no new lint errors

## 2026-04-26 18:50:00 IST

- Fixed BOM page (`/bom`) receipt gate mismatch:
  - `src/components/purchase-orders/BomTabsPage.tsx`
  - Root cause: `Bills of Material` pending list was using direct `orders` query and BOM coverage checks, but did not apply receipt gating.
  - Added active-receipt gate in `fetchCustomOrdersWithBomRefs()`:
    - fetch receipts for `reference_type=order`,
    - keep only `status='active'`,
    - build allow-lists by `reference_id` and `reference_number`,
    - include only matching custom orders before BOM pending/complete filtering.
  - Preserved existing BOM behavior:
    - pending list still based on `orderHasLineMissingBom`,
    - complete list still based on `orderFullyCoveredByBom` or closed statuses.
- Validation:
  - build passed: `npm run build`
  - edited-file lint diagnostics: no new lint errors

## 2026-04-26 18:55:00 IST

- Tightened receipt gate semantics from “not cancelled” to strict “active only” for consistency:
  - `src/hooks/useOrdersWithReceipts.ts`
    - receipt qualification now requires `status='active'` (plus `reference_type='order'` and valid linkage).
  - `src/pages/orders/OrderDetailPage.tsx`
    - receipt check helper for status advance now requires active receipts only.
  - `src/pages/OrdersPage.tsx`
  - `src/pages/OrdersPageCached.tsx`
    - manual status-change guard now checks for active receipts only.
  - `supabase/migrations/20260423100000_harden_partial_cut_assign_quantities.sql`
    - `recalc_order_status` receipt existence gate now requires `status='active'`.

- Validation:
  - build passed: `npm run build`
  - edited-file lint diagnostics: no new lint errors

## 2026-04-23 10:00:00 IST

- Implemented Partial Cut/Assign rollout (Phase 1 + Phase 2) from approved feasibility plan:
  - `src/components/production/DistributeQuantityDialog.tsx`
    - Relaxed save validation to allow partial distribution saves.
    - Kept strict oversubscription guard (`assigned <= available`) and added "at least one qty" guard.
    - Added compatibility-safe insert for size distributions:
      - primary path uses `assigned_quantity`,
      - fallback path uses legacy `quantity` when needed.
  - `src/components/production/MultipleBatchAssignmentDialog.tsx`
    - Switched assignable baseline from raw order sizes to:
      - `assignable_by_size = cut_by_size - already_assigned_by_size`.
    - Added line-aware retrieval of already-assigned size quantities from existing batch assignments.
    - Added compatibility handling for both `assigned_quantity` and legacy `quantity` columns.
  - `src/pages/production/AssignOrdersPage.tsx`
    - Multi-cutting-master assignment now persists explicit `assigned_quantity` per master at creation time.
    - Removed null-as-full interpretation in assignment calculations by treating missing assigned quantity as zero.
    - Added deterministic quantity split across selected cutting masters (base + remainder distribution).
  - `src/components/production/ReassignCuttingMasterDialog.tsx`
    - Aligned reassignment calculations to explicit assigned quantities (no bom-total fallback).

- Added schema hardening + SQL consistency migration:
  - `supabase/migrations/20260423100000_harden_partial_cut_assign_quantities.sql`
  - Includes:
    - additive canonical column guard (`order_batch_size_distributions.assigned_quantity`),
    - data backfill from legacy `quantity` where present,
    - non-negative and `completed <= assigned`/`completed <= total` constraints,
    - unique index on `(order_batch_assignment_id, size_name)`,
    - recalc function update to use canonical assigned quantity expression with compatibility fallback,
    - refreshed `order_batch_assignments_with_details` view to expose canonical assigned quantities.

- Regression checks run after implementation:
  - `npm run build` passed.
  - Edited-file lint diagnostics reported no new lint issues.

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

## 2026-04-22 21:37:46 IST

- Fixed receipt prefill customer display issue when opening `Create Receipt` from order page:
  - Updated `src/components/customers/CustomerSearchSelect.tsx` to resolve selected customer by `value` (`customer_id`) even when not present in initial limited list fetch.
  - Ensures customer name is shown correctly in selector (not just mobile info below) for prefilled navigation flows.

## 2026-04-22 21:44:00 IST

- Added scroll support for custom order customization dialog in `src/components/orders/ProductCustomizationModal.tsx`:
  - Added max-height and internal vertical scrolling for dialog content.
  - Kept footer action buttons (`Cancel`, `Save Customizations`) consistently reachable with fixed footer section.

## 2026-04-22 21:47:56 IST

- Fixed runtime crash on Tailor Management page (`Cannot access 'getTailorTypeLabel' before initialization`) in `src/pages/production/TailorManagementPage.tsx`:
  - Changed `getTailorTypeLabel` from `const` function expression to hoisted function declaration so it is safely callable inside earlier filtering logic.

## 2026-04-22 21:50:00 IST

- Updated Tailor Management view toggle styling to improve compactness and readability:
  - Increased switch width and reduced vertical height.
  - Enforced icon + text on the same row for both tabs.
  - Scoped via `tailor-view-switch` in:
    - `src/pages/production/TailorManagementPage.tsx`
    - `src/pages/OrdersPageViewSwitch.css`

## 2026-04-22 21:59:42 IST

- Updated order detail attachments UI in `src/pages/orders/OrderDetailPage.tsx`:
  - Display attachment file name (cleaned) instead of full id/path-like URL fragment.
  - Replaced large right-side `Download` button with compact download icon button at top-right of each attachment card.
  - Added Canva link preview support (embedded iframe) when attachment URL host is Canva and embeddable.

## 2026-04-22 22:02:39 IST

- Updated order detail image action placement in `src/pages/orders/OrderDetailPage.tsx`:
  - Moved `Open` action from below the image to an overlay icon button on the image container (top-right), matching compact card-style interaction.

## 2026-04-22 22:28:00 IST

- Implemented Tab Return Stability + Cleanup plan core phases (auth lifecycle, visibility policy, cleanup, verification):
  - Hardened auth/session handling in `src/components/auth/AuthProvider.tsx` so transient tab-return/session races do not immediately clear auth state.
  - Consolidated session validation ownership in `src/lib/auth.ts` (profile fetch no longer duplicates `getSession/refreshSession` loops).
  - Normalized login navigation in `src/components/auth/LoginForm.tsx` to router navigation (removed hard reload behavior).
  - Added conservative tab-return shell persistence policy in `src/hooks/usePersistShellOnTabReturn.ts` with explicit opt-in (`restoreOnTabReturn`).
  - Removed customer form auto-open/auto-close visibility/storage listeners from `src/components/customers/CustomerList.tsx` to stop tab-return form churn.
  - Removed unused navigation-state persistence API from `src/contexts/FormPersistenceContext.tsx`.
  - Removed duplicate admin redirect effect in `src/components/PermissionAwareRedirect.tsx`.
  - Replaced pending-approval hard reload with profile refresh in `src/components/auth/ProtectedRoute.tsx`.
  - Verification run completed:
    - `npm run test:roles` passed.
    - `npm run build` passed.
  - Committed as: `d7fe7b5`.

## 2026-04-22 22:41:00 IST

- Added follow-up tab-return stabilization after live log review (remaining repeated event churn):
  - In `src/components/auth/AuthProvider.tsx`:
    - suppressed same-user `SIGNED_IN` profile refresh when a valid in-memory profile already exists,
    - avoided unnecessary `setUser` on duplicate same-user `SIGNED_IN` events to reduce rerenders.
  - In `src/hooks/useSidebarPermissions.ts`:
    - added shared in-memory cache and inflight dedupe across hook instances,
    - ensured all return paths (including admin bypass/error paths) finalize and write cache consistently,
    - added shared-cache reads in mount effect before fetch branch.

## 2026-04-22 22:49:00 IST

- Added final anti-remount caching and subscription-noise reductions based on additional tab-switch logs:
  - In `src/hooks/useSidebarPermissions.ts`:
    - added session-scoped cache persistence (`sessionStorage`) with TTL (`sidebar_permissions_cache_v1`),
    - hydrate from session cache before fetch attempts so remounted instances avoid fresh permission fetch churn.
  - In `src/components/chat/FloatingChatButton.tsx`:
    - changed effect dependency from `[user]` to `[user?.id]` to avoid same-user object-identity resubscriptions,
    - reduced chat subscription status log noise; only warn on channel errors.
  - Re-verified with `npm run build` and targeted lint checks on modified files.

## 2026-04-22 22:56:00 IST

- Per final tab-return verification, cleaned non-actionable debug log noise while keeping warnings/errors:
  - Removed repetitive tab visibility info logging from `src/App.tsx`.
  - Removed repetitive auth state info logging in duplicate/same-user `SIGNED_IN` paths from `src/components/auth/AuthProvider.tsx`.
  - Removed verbose permissions lifecycle info logging from `src/hooks/useSidebarPermissions.ts`.
  - Kept functional behavior unchanged (no-op handling for same-user `SIGNED_IN`, cache-first permission resolution, and tab-return stabilization).
  - Re-verified with lint diagnostics and `npm run build`.

## 2026-04-22 23:07:00 IST

- Fixed Supabase `employees` schema compatibility log errors (`column employees.user_id does not exist`) by reordering fallback selects in:
  - `src/lib/employeesSchemaCompat.ts`
  - Changed fallback priority to start with `*` and then safe minimal columns (`personal_email`/`email`) to avoid repeated 400 errors from requesting non-existent `user_id`.
  - Re-verified with lint diagnostics and `npm run build`.

## 2026-04-22 23:10:00 IST

- Removed `Amount` column from GRN list table as requested in:
  - `src/components/goods-receipt-notes/GRNList.tsx`
  - Removed header cell, row cell rendering, and column filter state/logic for `amount`.
  - Removed now-unused `getApprovalRate()` helper tied to amount display.
  - Further cleaned list row shape/mapping by removing unused amount fields:
    - `total_amount_received`
    - `total_amount_approved`
  - Re-verified with lint diagnostics.

## 2026-04-22 23:18:00 IST

- Simplified Picker batch/tailor card styling to ERP-aligned palette (white / logo yellow / blue) in:
  - `src/pages/production/PickerTailorCard.css`
  - Removed heavy dark glassmorphism look and reduced saturated multi-color usage.
  - Updated key card elements to lighter, cleaner styling:
    - white card backgrounds with subtle blue borders/shadows,
    - blue info chips/buttons,
    - logo-yellow/blue bottom status bands (instead of green-heavy styles),
    - toned-down overlays/dividers for readability and consistency with ERP theme.

## 2026-04-22 23:22:00 IST

- Updated Picker tailor card visibility rule in:
  - `src/pages/production/PickerPage.tsx`
  - Hid cards with no pending quantity by filtering out rows where:
    - `max(assigned_quantity - picked_quantity, 0) <= 0`
  - Result: only cards with positive pending qty are shown in the Tailors grid.

## 2026-04-22 23:26:00 IST

- Fixed Picker card bottom strip alignment/shape consistency in:
  - `src/pages/production/PickerTailorCard.css`
  - Ensured yellow bottom strip sits at the true bottom for all cards (removed flexible spacer behavior from expand area by changing `.picker-tailor-expand` to `flex: 0 0 auto`).
  - Added explicit bottom corner rounding on strip (`border-radius: 0 0 26px 26px`) so both lower corners match consistently.

## 2026-04-22 23:30:00 IST

- Applied stricter bottom-strip anchoring because strip was still visually floating above card bottom in some cases:
  - `src/pages/production/PickerTailorCard.css`
  - Tailor cards:
    - made `.picker-tailor-card` positioned with bottom padding reserve,
    - pinned `.picker-tailor-bottom` absolutely to `bottom: 0` with full width.
  - Batch-order cards:
    - applied same approach to `.picker-batch-order-card` and `.picker-batch-order-bottom` for consistency,
    - added explicit bottom corner radius on batch strip.

## 2026-04-22 23:35:00 IST

- Updated Picker tailor card rejected badge placement to appear on the right side of product circular icons:
  - `src/pages/production/PickerPage.tsx`
    - moved rejected badge render block from top overlay area into product-icons row.
    - ensured row still renders when there are no images but rejected quantity exists.
  - `src/pages/production/PickerTailorCard.css`
    - changed `.picker-tailor-rejected` from absolute overlay to inline right-aligned badge (`margin-left: auto`) inside product row.

## 2026-04-22 23:42:00 IST

- Updated Picker product-thumbnail visibility logic to hide images for completed orders:
  - `src/pages/production/PickerPage.tsx`
  - In batch/tailor image aggregation, now includes thumbnails only for assignments/orders with positive `leftToPick`.
  - Completed assignments (`leftToPick <= 0`) are excluded from thumbnail sources.
  - This removes product circular images corresponding to completed orders from the card image row.

## 2026-04-22 23:55:00 IST

- Made Picker product images open the picking dialog for the clicked product:
  - `src/pages/production/PickerPage.tsx`
  - Added `openPickerFromBatchImage(batchId, imageUrl)` to resolve the clicked image to its matching pending assignment and open `PickerQuantityDialog` directly.
  - Updated tailor-card image click behavior to call this new handler instead of opening the gallery.
  - Kept gallery support for overflow (`+N`) and made gallery images clickable so selecting any image there also opens picking for that specific product.

## 2026-04-23 00:02:00 IST

- Added click discoverability cues for Picker product images:
  - `src/pages/production/PickerPage.tsx`
  - Added `cursor-pointer`, subtle hover ring/opacity transition, and tooltip text to clickable tailor-card thumbnails.
  - Added tooltip cue to the `+N` overflow image trigger.
  - Added the same hover cue + tooltip to clickable gallery images that open `PickerQuantityDialog`.

## 2026-04-23 00:08:00 IST

- Updated Picker image click flow as requested:
  - `src/pages/production/PickerPage.tsx`
  - Tailor card circle-thumbnail click now opens the product gallery (not direct picking dialog).
  - Picking dialog remains opened from gallery image click, preserving image-to-assignment mapping behavior.

## 2026-04-23 00:18:00 IST

- Fixed missing fabric names in Raw Material inventory table:
  - `src/components/warehouse/StorageZoneInventory.tsx`
  - Added shared display-name resolver with stronger fallback chain:
    - `fabric_master.fabric_name` -> `warehouse_inventory.item_name` -> `grn_items.fabric_name` -> `grn_items.item_name`.
  - Applied resolver to Name column rendering, column filter value computation, and search matching.
  - This ensures fabric names appear even when master linkage is missing or `item_name` is blank.

## 2026-04-23 00:31:00 IST

- Added Manual Quotation creation flow with limited fields in Quotations module:
  - `src/pages/accounts/QuotationsPage.tsx`
  - Added `Manual Quotation` action button and a compact dialog form with:
    - Customer Name
    - Mobile
    - Quotation Date
    - Amount
  - Implemented manual quotation save flow:
    - finds existing customer by name+mobile or creates a minimal customer record,
    - generates manual quotation numbers in `MQ/YY-YY/MON/SEQ` format,
    - inserts into `quotations` with `order_id = null` and `status = draft`.
  - Added `Manual Quotations` table section to list created manual quotations immediately.

## 2026-04-23 01:20:00 IST

- Implemented full Manual Quotation system based on approved architecture plan:
  - Database schema (additive-only):
    - `supabase/migrations/20260423011500_create_manual_quotation_tables.sql`
    - Added new tables:
      - `manual_quotations`
      - `manual_quotation_items`
      - `manual_quotation_additional_charges`
    - Added linkage/source fields on existing `quotations`:
      - `source` (default `automatic`)
      - `manual_quotation_id`
    - Added indexes, RLS policies, and updated-at triggers for new manual quotation tables.
  - Shared Order Form behavior for manual quotations:
    - `src/components/orders/OrderForm.tsx`
    - Extended `OrderForm` with `mode: 'order' | 'manualQuotation'` and manual quotation props.
    - Reused the same fields/dropdowns/products/customization/images pipeline in manual mode.
    - Added manual quotation status workflow selector:
      - `draft`, `submitted`, `under_review`, `approved`, `rejected`.
    - Added manual quotation loading/edit support (hydrates full form from manual tables).
    - Added manual save path that stores to manual quotation tables (does not insert into `orders`).
    - Added quotation-link persistence with `quotations.source = 'manual'`.
  - Manual quotation pages/routes:
    - Added:
      - `src/pages/accounts/ManualQuotationFormPage.tsx`
      - `src/pages/accounts/ManualQuotationDetailPage.tsx`
    - Updated:
      - `src/App.tsx`
    - New routes:
      - `/accounts/manual-quotations/new`
      - `/accounts/manual-quotations/:id/edit`
      - `/accounts/manual-quotations/:id`
  - Quotations page integration:
    - `src/pages/accounts/QuotationsPage.tsx`
    - Replaced basic popup form with full-page manual quotation creation/edit flow.
    - Manual quotations list now reads from `manual_quotations`.
    - Added source/action visibility:
      - `source = manual` badge
      - `View` and `Edit` actions.
  - Convert-to-order functionality:
    - `src/pages/accounts/ManualQuotationDetailPage.tsx`
    - Added status-gated conversion action (`approved` required, and not already converted).
    - Conversion inserts:
      - `orders`
      - `order_items`
      - `order_additional_charges`
    - Marks manual quotation as converted and links quotation record to created order.

- Regression/verification:
  - `npm run build` passed successfully after implementation.
  - `npm run lint` still reports existing repository-wide legacy issues unrelated to this feature.
  - File-level lint checks on edited files passed (no new lint errors introduced in touched files).

## 2026-04-23 01:34:00 IST

- Fixed manual quotation schema compatibility issues seen in production logs:
  - Added migration:
    - `supabase/migrations/20260423021000_fix_manual_quotation_schema_compat.sql`
  - Ensured `quotations.order_id` exists and remains nullable (FK to `orders` with `ON DELETE SET NULL`).
  - Added/ensured missing quotation-link columns used by manual flow:
    - `order_number`, `source`, `manual_quotation_id`.
  - Added corresponding indexes for compatibility and query performance.
- Added safer frontend handling when DB migrations are not yet applied:
  - `src/pages/accounts/QuotationsPage.tsx`
    - detects missing `manual_quotations` schema and shows one clear migration-required message,
    - disables Manual Quotation entry point until schema is available,
    - avoids repeated noisy error logs for users.
  - `src/components/orders/OrderForm.tsx`
    - maps schema-missing errors to a clear actionable message:
      - “Manual quotation schema is outdated. Please run latest Supabase migrations and retry.”

## 2026-04-23 01:48:00 IST

- Improved Manual Quotation detail presentation and output actions:
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
  - Fabric column now shows fabric name (resolved from `fabric_master`) instead of raw UUID.
  - Added `Print` and `Export PDF` buttons on manual quotation detail page.
  - Added printable/exportable quotation layout block on the same page (company header, quotation meta, items, totals).
  - PDF export now captures the quotation layout and downloads as `Quotation-<number>.pdf`, aligned with existing quotation output behavior.

## 2026-04-23 02:06:00 IST

- Updated manual quotation print/export to match original quotation format structure:
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
  - Reworked print container to use the same style pattern as original quotation page:
    - `#quotation-print` + `print-only` structure
    - A4 page settings and compact print CSS compatible with PDF capture
    - same section order: company header, bill/order details, order summary grid, totals, amount-in-words, terms/bank/QR, signature/footer.
  - Replaced prior simple PDF generation with the same visibility-toggle + `html2canvas` capture approach used in original quotation export flow for consistent output sizing.
  - Manual items now map into original-style order summary columns (`Product Details`, `Qty`, `Price`, `Amount`, `GST`, `Total`) to visually align with existing quotation print/export output.

## 2026-04-23 02:10:00 IST

- Fixed print-template preview leaking into screen view:
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
  - Added default `.print-only { display: none !important; }` so print container stays hidden in normal UI.
  - Retained print-media override to display it only during print/export flow.

## 2026-04-23 02:18:00 IST

- Enabled manual quotation conversion button for active manual quotations (no status lock):
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
  - Updated conversion guard to allow conversion whenever quotation is not already converted.
  - Existing conversion path remains unchanged and continues writing to standard order tables:
    - `orders`
    - `order_items`
    - `order_additional_charges`
  - Post-conversion flow remains same as normal orders (order modules consume converted record from existing order tables).

## 2026-04-23 02:24:00 IST

- Updated manual-quotation-to-order conversion to use the same order number series as normal Order Form:
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
  - Replaced temporary `SOYYMM####` generator with the same `TUC/YY-YY/MON/SEQ` sequencing logic used in `OrderForm`.
  - Added same fallback behavior on generation failure (`TUC/YY-YY/MON/<timestamp>`).

## 2026-04-23 02:36:00 IST

- Updated manual quotation conversion flow to open editable Order Form before final save:
  - `src/pages/accounts/ManualQuotationDetailPage.tsx`
    - `Convert to Order` now navigates to `/orders` create tab with manual quotation context, instead of directly creating order rows.
  - `src/pages/OrdersPage.tsx`
    - Added navigation-state handling for `openCreateFromManualQuotationId`:
      - automatically switches to create tab,
      - passes manual quotation prefill id into `OrderForm`,
      - clears navigation state to avoid duplicate triggers.
  - `src/components/orders/OrderForm.tsx`
    - Added `prefillFromManualQuotationId` prop for order-mode prefill.
    - Reused manual quotation loader to hydrate editable order form fields in order mode.
    - On final order save (user confirms changes), conversion linkage is completed:
      - updates `manual_quotations` with `converted_order_id`, `converted_at`, `converted_by`, `status='converted'`,
      - updates linked `quotations` row with manual source + created order references.
- Result:
  - User can edit everything before conversion,
  - Order is created in normal `orders` / `order_items` / `order_additional_charges` tables only after explicit save.

## 2026-04-26 18:50:00 IST

- Implemented BOM multi-color rollout with additive, backward-compatible storage and UI:
  - `supabase/migrations/20260426190500_add_selected_colors_to_bom_record_items.sql`
    - Added `bom_record_items.selected_colors jsonb not null default '[]'::jsonb`.
    - Added JSON shape check constraint to enforce array payloads.
  - `src/utils/bomSelectedColors.ts` (new)
    - Added shared utilities to normalize color JSON, build display text, and create grouping keys with legacy fallback.
- Updated BOM authoring flow to write and read multi-color values while preserving existing logic:
  - `src/components/purchase-orders/BomForm.tsx`
    - Added Colors Master fetch (`colors` table) and per-fabric multi-select chip UI.
    - Added `selected_colors` to line-item model and edit-mode hydration.
    - Save path now writes both:
      - `selected_colors` (new JSON source),
      - `fabric_color` (legacy scalar fallback from first selected color).
    - BOM insert/select payload now includes `selected_colors`.
- Updated procurement/BOM read paths for compatibility:
  - `src/hooks/usePendingPoItems.ts`
    - Added `selected_colors` handling in fallback query mapping.
    - Grouping key now prefers normalized `selected_colors`, falls back to `fabric_color`.
    - Fabric group display now shows multi-color text with GSM.
  - `src/services/bomPOTracking.ts`
    - Added `selected_colors` field to BOM item status interface for typed downstream consumption.
- Rolled multi-color display fallback into production fabric contexts where available:
  - `src/components/production/MultipleBatchAssignmentDialog.tsx`
  - `src/components/production/DistributeQuantityDialog.tsx`
  - `src/pages/production/CuttingManagerPage.tsx`
  - These views now use shared color formatter and display multi-color text when `selected_colors` is present, otherwise preserve existing single-color behavior.
- Regression checks:
  - Build verification passed: `npm run build`.
  - Touched-file lint check passed via IDE lints.

## 2026-04-26 19:06:00 IST

- Adjusted BOM multi-color UI scope per feedback: keep Fabric flow unchanged and move color selection to Items only.
  - `src/components/purchase-orders/BomForm.tsx`
    - Reverted Fabric color rendering/edit flow to legacy behavior (order-driven fabric path preserved).
    - Removed Colors Master chip controls from Fabric block.
    - Added a proper multi-select dropdown in **Items** section using `DropdownMenuCheckboxItem`.
    - Item rows now store selected colors in `selected_colors` JSON while fabric rows remain unchanged.

## 2026-04-26 19:48:00 IST

- Refined Items color UI per UX feedback:
  - `src/components/purchase-orders/BomForm.tsx`
    - Moved `Colors` field to appear immediately after `Item Name`.
    - Replaced checkbox menu with “select one color + plus button” interaction.
    - After selecting a color, user can click `+` to append another color.
    - Added removable selected-color badges for each item row.

## 2026-04-26 19:56:00 IST

- Added BOM save compatibility/recovery hardening for mixed DB states:
  - `src/components/purchase-orders/BomForm.tsx`
    - If `bom_record_items.selected_colors` is missing in schema, retry item insert without `selected_colors` instead of failing.
    - If legacy fallback table `bom_items` is absent, surface primary `bom_record_items` error cleanly (no misleading fallback failure).
    - On duplicate BOM header conflict (`bom_records_order_id_order_item_id_key`), resolve and reuse existing BOM id, then replace items (prevents repeated 409 loop after partial saves).

## 2026-04-26 20:02:00 IST

- Fixed BOM false-success path where header could be created/navigated without visible lines:
  - `src/components/purchase-orders/BomForm.tsx`
    - Added hard guard: save is blocked unless at least one visible `fabric` or `item` line exists.
    - Added second hard guard: if built payload has zero valid rows (`bomItems.length === 0`), abort save and show error.
    - Prevents accidental move to completed list when no usable BOM rows exist.

## 2026-04-26 20:15:00 IST

- Implemented BOM color propagation across PO and GRN with compatibility-safe fallbacks:
  - Added additive schema migrations:
    - `supabase/migrations/20260426201000_add_selected_colors_to_po_and_grn_items.sql`
      - Added `selected_colors jsonb not null default '[]'::jsonb` on:
        - `purchase_order_items`
        - `grn_items`
      - Added JSON array shape constraints for both tables.
    - `supabase/migrations/20260426202000_update_pending_po_items_view_add_selected_colors.sql`
      - Updated `pending_po_items_view` projection to include `selected_colors`.
- PO flow updates:
  - `src/components/purchase-orders/PurchaseOrderForm.tsx`
    - Extended PO line model and BOM/pending mappers to carry `selected_colors`.
    - Preserved and loaded `selected_colors` in PO edit/read path (with BOM tracking fallback).
    - Persisted `selected_colors` in `purchase_order_items` save payload.
    - Updated PO form displays and print/export templates to show color via `selectedColorsDisplayText(...)`.
    - Added save compatibility retry: if `selected_colors` column is missing in DB schema, retries PO line insert without `selected_colors`.
  - `src/components/purchase-orders/BomToPOWizard.tsx`
    - Added `selected_colors` propagation into wizard-created PO item payloads.
- GRN flow updates:
  - `src/components/goods-receipt-notes/GRNForm.tsx`
    - Added `selected_colors` to PO item fetch mapping into GRN lines.
    - Persisted `selected_colors` in `grn_items` insert/update payloads.
    - Added compatibility retries for GRN insert/update paths when `selected_colors` column is missing.
  - `src/components/goods-receipt-notes/GRNPrintExport.tsx`
    - Updated color rendering to use `selectedColorsDisplayText(...)` with fallback.
  - `src/lib/grnColorSwatch.ts`
    - Extended GRN color helper to accept `selected_colors`, generate display label from selected colors first, and still preserve swatch fallback behavior.
- Validation:
  - Touched-file lint diagnostics: clean.
  - Production build: passed (`npm run build`).

