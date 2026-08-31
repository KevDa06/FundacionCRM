import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sghdorrdliryxfkdvndu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaGRvcnJkbGlyeXhma2R2bmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDM1OTcsImV4cCI6MjEwMzQ3OTU5N30.ZR2UVFPTgEAKCkOliN2nqEHYB-B0Dt33n0YFcRcaLQU';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
