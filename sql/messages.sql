-- ===================================================================
-- Kairo Messages - Two-way Yes/No communication between parent & child
-- ===================================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL,
  device_id TEXT,
  question TEXT NOT NULL,
  answer TEXT CHECK (answer IN ('yes', 'no')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon insert messages" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon select messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Anon update messages" ON messages FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(profile_id, sent_at DESC);
