-- Only an independently approved owner nomination becomes a public cover.
CREATE TABLE place_covers (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE
);
