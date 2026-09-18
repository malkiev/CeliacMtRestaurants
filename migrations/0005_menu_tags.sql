-- Map only exact existing phrases. Keep the original notes and provenance.
UPDATE places SET menu_options=CASE lower(trim(menu_info))
  WHEN 'dedicated gluten free menu' THEN '["dedicated_menu"]'
  WHEN 'gluten is clearly marked on menu' THEN '["clearly_marked"]'
  WHEN 'all menu can be done gluten free' THEN '["on_request"]'
  ELSE menu_options END
WHERE menu_options='["unknown"]';
