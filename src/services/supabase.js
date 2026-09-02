import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://sghdorrdliryxfkdvndu.supabase.co').trim();
// Strip any accidental trailing slashes or /rest/v1 paths
const SUPABASE_URL = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/rest\/?$/i, '')
  .replace(/\/+$/, '');

const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaGRvcnJkbGlyeXhma2R2bmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDM1OTcsImV4cCI6MjEwMzQ3OTU5N30.ZR2UVFPTgEAKCkOliN2nqEHYB-B0Dt33n0YFcRcaLQU').trim();

export const AUTH_SYSTEM_EMAIL = (import.meta.env.VITE_AUTH_SYSTEM_EMAIL || 'admin@fundacion.org').trim();

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
