ALTER TABLE places ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN brand_name TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN branch_name TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN menu_options TEXT NOT NULL DEFAULT '["unknown"]';
CREATE INDEX places_brand ON places(brand_name COLLATE NOCASE);

-- Recover checks accidentally cleared by the old full-correction update.
-- Only restore coordinates that match the latest recorded explicit pin check.
UPDATE places SET coordinates_checked=1
WHERE coordinates_checked=0 AND latitude IS NOT NULL AND longitude IS NOT NULL
AND EXISTS (
  SELECT 1 FROM audit_log a
  WHERE a.id=(SELECT id FROM audit_log WHERE action='check_coordinates' AND target_id=places.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
  AND json_valid(a.detail)
  AND json_extract(a.detail,'$.latitude')=places.latitude
  AND json_extract(a.detail,'$.longitude')=places.longitude
);
