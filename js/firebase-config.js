// ===== Supabase Configuration =====
const SUPABASE_URL = 'https://vvhyzveydnheyvygiqen.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2aHl6dmV5ZG5oZXl2eWdpcWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NzkzMDMsImV4cCI6MjA5MTU1NTMwM30.K7IFqzl5qw8bEYIHee_o4LXpv1fTtT0xRGY-v1z9NEk';

// The Supabase UMD SDK exposes itself as window.supabase.
// We overwrite that global with the actual client instance so all
// downstream code that uses `supabase.from(...)` works correctly.
(function () {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = client;
})();
