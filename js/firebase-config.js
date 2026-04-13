// ===== Supabase Configuration =====
const SUPABASE_URL = 'https://vvhyzveydnheyvygiqen.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2aHl6dmV5ZG5oZXl2eWdpcWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NzkzMDMsImV4cCI6MjA5MTU1NTMwM30.K7IFqzl5qw8bEYIHee_o4LXpv1fTtT0xRGY-v1z9NEk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
