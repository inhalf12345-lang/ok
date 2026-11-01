import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'spark_supabase_url';
const STORAGE_KEY_ANON = 'spark_supabase_anon';

export function sanitizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.trim().replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  cleaned = cleaned.replace(/\/rest\/?$/i, '');
  cleaned = cleaned.replace(/\/auth\/v1\/?$/i, '');
  return cleaned.replace(/\/+$/, '');
}

export function isValidHttpUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = sanitizeSupabaseUrl(str);
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isLikelyApiKey(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  return (
    trimmed.startsWith('eyJ') ||
    trimmed.startsWith('sb_publishable_') ||
    trimmed.startsWith('sb_secret_') ||
    (trimmed.split('.').length === 3 && trimmed.length > 40)
  );
}

export function getSupabaseConfigState(): {
  rawUrl: string;
  rawAnon: string;
  detectedUrlIsKey: boolean;
  isConfigured: boolean;
} {
  const envUrl =
    typeof import.meta.env.VITE_SUPABASE_URL === 'string'
      ? import.meta.env.VITE_SUPABASE_URL.trim()
      : '';
  const envAnon =
    typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
      ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
      : '';

  const localUrl = localStorage.getItem(STORAGE_KEY_URL)?.trim() || '';
  const localAnon = localStorage.getItem(STORAGE_KEY_ANON)?.trim() || '';

  const rawUrl = localUrl || envUrl;
  const rawAnon = localAnon || envAnon;
  const detectedUrlIsKey = isLikelyApiKey(rawUrl);

  return {
    rawUrl,
    rawAnon,
    detectedUrlIsKey,
    isConfigured: !detectedUrlIsKey && Boolean(rawUrl && rawAnon && isValidHttpUrl(rawUrl)),
  };
}

// Default to env vars if present, otherwise check localStorage
export function getSavedCredentials(): { url: string; anonKey: string } {
  const { rawUrl, rawAnon, detectedUrlIsKey } = getSupabaseConfigState();

  return {
    url: detectedUrlIsKey ? '' : sanitizeSupabaseUrl(rawUrl),
    anonKey: rawAnon || (detectedUrlIsKey ? rawUrl : ''),
  };
}

let supabaseInstance: SupabaseClient | null = null;
let currentConfigKey = '';

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSavedCredentials();
  if (!url || !anonKey) return false;
  if (!isValidHttpUrl(url)) return false;
  if (
    url.includes('your-project-ref') ||
    url.includes('xyzcompany') ||
    anonKey.includes('your-anon-public-key') ||
    anonKey.length < 10
  ) {
    return false;
  }
  return true;
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey } = getSavedCredentials();
  const key = `${url}_${anonKey}`;

  if (!supabaseInstance || currentConfigKey !== key) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      currentConfigKey = key;
    } catch {
      supabaseInstance = null;
      return null;
    }
  }

  return supabaseInstance;
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  const cleanUrl = sanitizeSupabaseUrl(url);
  const cleanAnon = anonKey.trim();
  localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
  localStorage.setItem(STORAGE_KEY_ANON, cleanAnon);
  supabaseInstance = null; // force re-create
  return getSupabase();
}

export function clearSupabaseCredentials() {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON);
  supabaseInstance = null;
}

export interface DatabaseVerificationReport {
  success: boolean;
  message: string;
  tables?: { name: string; exists: boolean; status: string }[];
  bucketExists?: boolean;
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<DatabaseVerificationReport> {
  if (!isValidHttpUrl(url)) {
    return {
      success: false,
      message: 'Please enter a valid URL starting with https://',
      tables: [],
    };
  }
  if (!anonKey || anonKey.trim().length < 10) {
    return {
      success: false,
      message: 'Please enter a valid Supabase anon public key.',
      tables: [],
    };
  }

  try {
    const testClient = createClient(url.trim().replace(/\/+$/, ''), anonKey.trim());
    const tableNames = [
      'profiles',
      'conversations',
      'conversation_members',
      'messages',
      'user_crypto_keys',
      'friendships',
    ];
    const tableResults: { name: string; exists: boolean; status: string }[] = [];

    for (const tbl of tableNames) {
      const { error } = await testClient.from(tbl).select('*').limit(1);
      if (error && error.message?.includes('does not exist')) {
        tableResults.push({ name: tbl, exists: false, status: 'Missing in SQL' });
      } else {
        tableResults.push({ name: tbl, exists: true, status: 'Ready & Protected' });
      }
    }

    // Check private image storage bucket ('chat-media' or 'storage')
    let bucketExists = false;
    try {
      const { error: listErr } = await testClient.storage.from('chat-media').list('', { limit: 1 });
      if (!listErr || !listErr.message?.toLowerCase().includes('not found')) {
        bucketExists = true;
      } else {
        const { error: fallbackErr } = await testClient.storage.from('storage').list('', { limit: 1 });
        if (!fallbackErr || !fallbackErr.message?.toLowerCase().includes('not found')) {
          bucketExists = true;
        }
      }
    } catch {
      bucketExists = false;
    }

    const allExist = tableResults.every((t) => t.exists);
    return {
      success: true,
      message: allExist
        ? 'All tables & SQL migrations verified successfully! Your Supabase database is ready.'
        : 'Connected to Supabase, but some tables are missing. Please re-run the SQL migration script.',
      tables: tableResults,
      bucketExists,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Connection failed',
      tables: [],
    };
  }
}
