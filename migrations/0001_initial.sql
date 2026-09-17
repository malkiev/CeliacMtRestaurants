PRAGMA foreign_keys = ON;

-- Better Auth core schema. Application roles live separately and cannot be supplied at sign-up.
CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE session (id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE);
CREATE INDEX session_user ON session(userId);
CREATE TABLE account (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE INDEX account_user ON account(userId);
CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER, updatedAt INTEGER);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE rateLimit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL);

CREATE TABLE profiles (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','admin')));
CREATE TABLE places (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Restaurant', locality TEXT NOT NULL DEFAULT '', island TEXT NOT NULL CHECK(island IN ('Malta','Gozo')),
  address TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL, coordinates_checked INTEGER NOT NULL DEFAULT 0,
  cuisines TEXT NOT NULL DEFAULT '[]', price_min REAL, price_max REAL, price_basis TEXT NOT NULL DEFAULT 'Main meal per person, excluding drinks', price_updated TEXT,
  menu_info TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', menu_url TEXT NOT NULL DEFAULT '', social_url TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  cam_verified INTEGER NOT NULL DEFAULT 0, cam_verified_at TEXT, source_cam INTEGER NOT NULL DEFAULT 0,
  business_status TEXT NOT NULL DEFAULT 'open' CHECK(business_status IN ('open','temporarily_closed','closed')),
  published INTEGER NOT NULL DEFAULT 1, source_ref TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(price_min IS NULL OR price_min >= 0), CHECK(price_max IS NULL OR price_max >= price_min),
  CHECK(latitude IS NULL OR latitude BETWEEN 35.7 AND 36.2), CHECK(longitude IS NULL OR longitude BETWEEN 14.1 AND 14.7)
);
CREATE INDEX places_location ON places(island,locality);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id), author_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'Imported community feedback', kind TEXT NOT NULL CHECK(kind IN ('review','imported')),
  body TEXT NOT NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), visit_date TEXT, source_ref TEXT,
  visible INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(kind != 'imported' OR rating IS NULL), UNIQUE(place_id,author_id)
);
CREATE INDEX feedback_place ON feedback(place_id,visible);
CREATE TABLE ownerships (user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, place_id TEXT NOT NULL REFERENCES places(id), verified_by TEXT, verified_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,place_id));
CREATE TABLE replies (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL UNIQUE REFERENCES feedback(id), place_id TEXT NOT NULL REFERENCES places(id), author_id TEXT REFERENCES user(id) ON DELETE SET NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('review','reply','place','correction','photo','report','owner_claim')),
  author_id TEXT REFERENCES user(id) ON DELETE SET NULL, place_id TEXT REFERENCES places(id), target_id TEXT,
  payload TEXT NOT NULL, dedupe_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), decided_at TEXT, decided_by TEXT, decision_id TEXT, reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX submissions_pending ON submissions(dedupe_key) WHERE status='pending';
CREATE INDEX submissions_queue ON submissions(status,created_at);
CREATE TABLE photos (id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id), author_id TEXT REFERENCES user(id) ON DELETE SET NULL, object_key TEXT NOT NULL UNIQUE, thumb_key TEXT NOT NULL UNIQUE, caption TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX photos_place ON photos(place_id,status);
CREATE TABLE useful_links (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, last_checked TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE adverts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', placement TEXT NOT NULL CHECK(placement IN ('list','detail')), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0);
CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 1, expires_at INTEGER NOT NULL);
CREATE TABLE local_mail (id TEXT PRIMARY KEY, email TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
