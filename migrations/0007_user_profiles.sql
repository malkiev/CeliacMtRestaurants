ALTER TABLE profiles ADD COLUMN display_name TEXT CHECK(display_name IS NULL OR length(display_name) BETWEEN 2 AND 60);
ALTER TABLE profiles ADD COLUMN avatar_preset TEXT NOT NULL DEFAULT 'initials' CHECK(avatar_preset IN ('initials','sun','flower','leaf','wave','star','cup'));
ALTER TABLE profiles ADD COLUMN avatar_key TEXT;
ALTER TABLE profiles ADD COLUMN conditions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(conditions) AND json_type(conditions)='array');
ALTER TABLE profiles ADD COLUMN symptoms TEXT CHECK(symptoms IS NULL OR symptoms IN ('Never','Rarely','Sometimes','Always','I don’t know'));
ALTER TABLE profiles ADD COLUMN share_health INTEGER NOT NULL DEFAULT 0 CHECK(share_health IN (0,1));
CREATE UNIQUE INDEX profiles_avatar_key ON profiles(avatar_key) WHERE avatar_key IS NOT NULL;

-- Durable cleanup records survive account deletion and failed R2 operations.
CREATE TABLE avatar_cleanup (object_key TEXT PRIMARY KEY, queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TRIGGER profile_avatar_replaced AFTER UPDATE OF avatar_key ON profiles
WHEN OLD.avatar_key IS NOT NULL AND OLD.avatar_key IS NOT NEW.avatar_key
BEGIN INSERT OR IGNORE INTO avatar_cleanup(object_key) VALUES(OLD.avatar_key); END;
CREATE TRIGGER profile_avatar_deleted AFTER DELETE ON profiles
WHEN OLD.avatar_key IS NOT NULL
BEGIN INSERT OR IGNORE INTO avatar_cleanup(object_key) VALUES(OLD.avatar_key); END;
