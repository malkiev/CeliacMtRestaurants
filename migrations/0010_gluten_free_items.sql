CREATE TABLE gluten_free_items (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
INSERT INTO gluten_free_items(key,label,sort_order) VALUES
  ('burgers','Burgers',10), ('pizza','Pizza',20),
  ('chicken_nuggets','Chicken nuggets',30), ('pasta','Pasta',40);
ALTER TABLE places ADD COLUMN gluten_free_items TEXT NOT NULL DEFAULT '[]';
