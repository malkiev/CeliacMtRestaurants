ALTER TABLE places ADD COLUMN dedicated_gluten_free_kitchen TEXT NOT NULL DEFAULT 'unknown' CHECK (dedicated_gluten_free_kitchen IN ('yes','no','unknown'));
ALTER TABLE places ADD COLUMN dedicated_gluten_free_utensils TEXT NOT NULL DEFAULT 'unknown' CHECK (dedicated_gluten_free_utensils IN ('yes','no','unknown'));
ALTER TABLE places ADD COLUMN dedicated_gluten_free_fryer TEXT NOT NULL DEFAULT 'unknown' CHECK (dedicated_gluten_free_fryer IN ('yes','no','unknown'));
ALTER TABLE places ADD COLUMN dedicated_gluten_free_pizza_oven TEXT NOT NULL DEFAULT 'unknown' CHECK (dedicated_gluten_free_pizza_oven IN ('yes','no','unknown'));
