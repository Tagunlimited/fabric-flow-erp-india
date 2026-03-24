-- One BOM per order line when order_item_id is set (product-level BOMs).
-- Fails if duplicate (order_id, order_item_id) pairs already exist; dedupe before applying.
CREATE UNIQUE INDEX IF NOT EXISTS bom_records_order_id_order_item_id_key
  ON public.bom_records (order_id, order_item_id)
  WHERE order_item_id IS NOT NULL;
