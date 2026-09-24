CREATE TABLE business_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('restaurant','shop')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO business_types(key,label,category,sort_order) VALUES
 ('Restaurant','Restaurant','restaurant',10),
 ('Cafe','Cafe','restaurant',20),
 ('Bakery','Bakery','restaurant',30),
 ('Bar','Bar','restaurant',35),
 ('Wine bar','Wine bar','restaurant',40),
 ('Butcher','Butcher','shop',50),
 ('Food shop','Food shop','shop',60),
 ('Food producer','Food producer','shop',70),
 ('Importer/distributor','Importer/distributor','shop',80);
