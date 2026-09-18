ALTER TABLE places ADD COLUMN business_types TEXT;
ALTER TABLE places ADD COLUMN services TEXT NOT NULL DEFAULT '[]';
ALTER TABLE places ADD COLUMN advance_orders TEXT NOT NULL DEFAULT 'unknown' CHECK(advance_orders IN ('unknown','yes','no'));
ALTER TABLE places ADD COLUMN premises TEXT NOT NULL DEFAULT 'unknown' CHECK(premises IN ('unknown','public','none'));
ALTER TABLE places ADD COLUMN ordering_info TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN price_applicability TEXT NOT NULL DEFAULT 'applicable' CHECK(price_applicability IN ('applicable','not_applicable'));
ALTER TABLE places ADD COLUMN source_type TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN catalogue_enabled INTEGER NOT NULL DEFAULT 0 CHECK(catalogue_enabled IN (0,1));

UPDATE places SET source_type=type, business_types=CASE
  WHEN type='Shop' THEN '["Food shop"]'
  WHEN type IN ('Restaurant','Cafe','Bakery','Butcher') THEN json_array(type)
  ELSE '[]' END;
