-- Receipt numbers are now typed in by the user. A number may be reused once its
-- receipt is cancelled (e.g. reissued with corrected details) or deleted, but two
-- valid receipts of the same kind can never share a number.
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_receipt_number_key;
CREATE UNIQUE INDEX receipts_number_active_uq ON receipts (receipt_type, lower(receipt_number)) WHERE status = 'issued';
