-- =============================================================================
-- Kairo's Help - IoT Wearable Device Schema
-- Supabase SQL schema for device_alerts and emergency_profiles extensions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- device_alerts table
-- Stores every alert sent by Kairo wearable devices (SOS, fall, geofence, heartbeat).
-- Each alert references an emergency profile and includes GPS + battery data.
-- -----------------------------------------------------------------------------
CREATE TABLE device_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL REFERENCES emergency_profiles(id),
  device_id TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('sos', 'fall', 'geofence', 'heartbeat')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  battery_level INTEGER CHECK (battery_level BETWEEN 0 AND 100),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT false
);

-- -----------------------------------------------------------------------------
-- Extend emergency_profiles with device linking columns
-- device_id:     the hardware identifier of the paired Kairo wearable
-- device_linked: whether a device is currently paired to this profile
-- -----------------------------------------------------------------------------
ALTER TABLE emergency_profiles ADD COLUMN IF NOT EXISTS device_id TEXT DEFAULT NULL;
ALTER TABLE emergency_profiles ADD COLUMN IF NOT EXISTS device_linked BOOLEAN DEFAULT false;

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Open policies for anonymous access (device firmware uses the anon key).
-- In production, tighten these to match your auth strategy.
-- -----------------------------------------------------------------------------
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON device_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON device_alerts
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous update resolved" ON device_alerts
  FOR UPDATE USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Enable Supabase Realtime for device_alerts
-- This lets the web dashboard receive live alert pushes over WebSocket.
-- -----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE device_alerts;

-- -----------------------------------------------------------------------------
-- Index for fast dashboard queries
-- Covers the common pattern: "show unresolved alerts for a profile, newest first"
-- -----------------------------------------------------------------------------
CREATE INDEX idx_device_alerts_profile
  ON device_alerts(profile_id, resolved, timestamp DESC);
