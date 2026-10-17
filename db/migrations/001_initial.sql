-- Adka Shree Beeramarlara Maada — initial schema.
-- Money is stored as BIGINT paise. Balances are never stored: they are always
-- derived from the `transactions` ledger.

CREATE TABLE assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('temple_photo')),
  mime_type    text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size    integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  chunk_count  integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 64),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_chunks (
  asset_id  uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  idx       integer NOT NULL CHECK (idx >= 0),
  data      bytea NOT NULL,
  PRIMARY KEY (asset_id, idx)
);

CREATE TABLE financial_settings (
  id                      smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  institution_name        text NOT NULL DEFAULT 'Adka Shree Beeramarlara Maada'
                          CHECK (length(btrim(institution_name)) BETWEEN 1 AND 120),
  receipt_prefix          text NOT NULL DEFAULT 'ABM' CHECK (receipt_prefix ~ '^[A-Z0-9]{1,8}$'),
  currency                char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  timezone                text NOT NULL DEFAULT 'Asia/Kolkata',
  date_format             text NOT NULL DEFAULT 'DD MMM YYYY'
                          CHECK (date_format IN ('DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  allow_overpayment       boolean NOT NULL DEFAULT false,
  receipt_acknowledgment  text NOT NULL DEFAULT 'Thank you for your generous contribution and support towards Adka Shree Beeramarlara Maada.',
  receipt_footer_note     text NOT NULL DEFAULT 'This is a computer-generated receipt.',
  offer_receipt_after_save boolean NOT NULL DEFAULT true,
  temple_photo_asset_id   uuid NULL REFERENCES assets(id) ON DELETE SET NULL,
  photo_focus_x           smallint NOT NULL DEFAULT 50 CHECK (photo_focus_x BETWEEN 0 AND 100),
  photo_focus_y           smallint NOT NULL DEFAULT 50 CHECK (photo_focus_y BETWEEN 0 AND 100),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO financial_settings (id) VALUES (1);

CREATE TABLE categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  category_type  text NOT NULL CHECK (category_type IN ('income', 'expense')),
  system_key     text NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_type_name_uq ON categories (category_type, lower(name));

INSERT INTO categories (name, category_type, system_key) VALUES
  ('Opening Balance', 'income', 'opening_balance'),
  ('Donation', 'income', 'donation'),
  ('Ritual Payment', 'income', 'ritual_payment'),
  ('Other Income', 'income', 'other_income'),
  ('Hundi Collection', 'income', NULL),
  ('Pooja Materials', 'expense', NULL),
  ('Flowers', 'expense', NULL),
  ('Fruits', 'expense', NULL),
  ('Food & Refreshments', 'expense', NULL),
  ('Decorations', 'expense', NULL),
  ('Temple Maintenance', 'expense', NULL),
  ('Transportation', 'expense', NULL),
  ('Electricity', 'expense', NULL),
  ('Ritual Expenses', 'expense', NULL),
  ('Event Expenses', 'expense', NULL),
  ('Other', 'expense', 'expense_other');

CREATE TABLE events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  event_date   date NOT NULL,
  description  text NULL,
  notes        text NULL,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_date_idx ON events (event_date DESC);

CREATE TABLE rituals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  default_amount  bigint NULL CHECK (default_amount >= 0),
  description     text NULL,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rituals_name_uq ON rituals (lower(name));

CREATE TABLE ritual_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_id          uuid NOT NULL REFERENCES rituals(id) ON DELETE RESTRICT,
  devotee_name       text NOT NULL CHECK (length(btrim(devotee_name)) BETWEEN 1 AND 120),
  contact            text NULL,
  ritual_date        date NOT NULL,
  prescribed_amount  bigint NOT NULL CHECK (prescribed_amount >= 0),
  notes              text NULL,
  is_demo            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ritual_entries_ritual_idx ON ritual_entries (ritual_id);
CREATE INDEX ritual_entries_date_idx ON ritual_entries (ritual_date DESC);

CREATE TABLE ritual_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_entry_id  uuid NOT NULL REFERENCES ritual_entries(id) ON DELETE CASCADE,
  amount           bigint NOT NULL CHECK (amount > 0),
  payment_date     date NOT NULL,
  payment_method   text NULL,
  reference_number text NULL,
  notes            text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ritual_payments_entry_idx ON ritual_payments (ritual_entry_id, payment_date, created_at);

CREATE TABLE donations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_name        text NOT NULL CHECK (length(btrim(donor_name)) BETWEEN 1 AND 120),
  donation_date     date NOT NULL,
  amount            bigint NOT NULL CHECK (amount > 0),
  purpose           text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 200),
  payment_method    text NULL,
  reference_number  text NULL,
  notes             text NULL,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX donations_date_idx ON donations (donation_date DESC);
CREATE INDEX donations_donor_idx ON donations (lower(donor_name));

CREATE TABLE expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NULL REFERENCES events(id) ON DELETE RESTRICT,
  ritual_entry_id  uuid NULL REFERENCES ritual_entries(id) ON DELETE SET NULL,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  category_id      uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  amount           bigint NOT NULL CHECK (amount > 0),
  expense_date     date NOT NULL,
  vendor           text NULL,
  description      text NULL,
  notes            text NULL,
  is_demo          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_event_idx ON expenses (event_id);
CREATE INDEX expenses_entry_idx ON expenses (ritual_entry_id);
CREATE INDEX expenses_date_idx ON expenses (expense_date DESC);

-- Other (non-donation, non-ritual) income such as hundi collections or rent.
CREATE TABLE incomes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NULL REFERENCES events(id) ON DELETE RESTRICT,
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  category_id  uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  amount       bigint NOT NULL CHECK (amount > 0),
  income_date  date NOT NULL,
  received_from text NULL,
  notes        text NULL,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incomes_date_idx ON incomes (income_date DESC);

-- The central ledger. Exactly one row per actual money movement.
CREATE TABLE transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type  text NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  source_type       text NOT NULL CHECK (source_type IN ('opening_balance', 'donation', 'ritual_payment', 'other_income', 'expense')),
  source_id         uuid NOT NULL,
  amount            bigint NOT NULL CHECK (amount >= 0),
  transaction_date  date NOT NULL,
  description       text NOT NULL,
  category_id       uuid NULL REFERENCES categories(id) ON DELETE SET NULL,
  event_id          uuid NULL REFERENCES events(id) ON DELETE SET NULL,
  ritual_entry_id   uuid NULL REFERENCES ritual_entries(id) ON DELETE SET NULL,
  party_name        text NULL,
  notes             text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_source_uq UNIQUE (source_type, source_id),
  CONSTRAINT transactions_type_matches_source CHECK ((source_type = 'expense') = (transaction_type = 'expense')),
  CONSTRAINT transactions_positive_unless_opening CHECK (source_type = 'opening_balance' OR amount > 0)
);
-- At most one opening balance, ever.
CREATE UNIQUE INDEX transactions_single_opening_uq ON transactions ((true)) WHERE source_type = 'opening_balance';
CREATE INDEX transactions_date_idx ON transactions (transaction_date DESC, created_at DESC);
CREATE INDEX transactions_type_date_idx ON transactions (transaction_type, transaction_date);
CREATE INDEX transactions_category_idx ON transactions (category_id);
CREATE INDEX transactions_event_idx ON transactions (event_id);

CREATE TABLE receipt_sequences (
  receipt_type  text NOT NULL CHECK (receipt_type IN ('donation', 'ritual_payment')),
  year          integer NOT NULL,
  last_value    integer NOT NULL,
  PRIMARY KEY (receipt_type, year)
);

CREATE TABLE receipts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number       text NOT NULL UNIQUE,
  receipt_type         text NOT NULL CHECK (receipt_type IN ('donation', 'ritual_payment')),
  source_type          text NOT NULL CHECK (source_type IN ('donation', 'ritual_payment')),
  source_id            uuid NOT NULL,
  issue_date           date NOT NULL,
  snapshot_data        jsonb NOT NULL,
  status               text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  cancelled_at         timestamptz NULL,
  cancel_reason        text NULL,
  replaces_receipt_id  uuid NULL REFERENCES receipts(id) ON DELETE SET NULL,
  is_demo              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_type_matches_source CHECK (receipt_type = source_type),
  CONSTRAINT receipts_cancel_consistent CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
-- Only one valid receipt per source record at a time.
CREATE UNIQUE INDEX receipts_one_active_uq ON receipts (source_type, source_id) WHERE status = 'issued';
CREATE INDEX receipts_source_idx ON receipts (source_type, source_id);
CREATE INDEX receipts_created_idx ON receipts (created_at DESC);

-- Append-only history of edits and deletions of financial records.
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'cancel', 'restore')),
  before_data  jsonb NULL,
  after_data   jsonb NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at);

-- Fixed-window counters for write rate limiting (serverless instances share state via the DB).
CREATE TABLE rate_limits (
  bucket        text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);
