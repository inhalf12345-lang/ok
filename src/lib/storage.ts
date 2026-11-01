import { ChatMessage, DailyQuest, FriendOrb, FriendRequest, LeaderboardEntry, ShopItem, UserProfile, UserStory } from '../types';

const CHAT_CACHE_PREFIX = 'spark_chat_cache_';
const PROFILE_KEY = 'spark_local_profile';
const FRIENDS_KEY = 'spark_local_friends';
const QUESTS_KEY = 'spark_local_quests';
const REQUESTS_KEY = 'spark_local_requests';
const STORIES_KEY = 'spark_local_stories';
const LAST_SENT_TEXT_KEY = 'spark_last_sent_text';
const LAST_SENT_TIME_KEY = 'spark_last_sent_time';
const LOCAL_ACCOUNTS_KEY = 'spark_local_accounts_v1';
const ACTIVE_LOCAL_USER_KEY = 'spark_active_local_user';
const LOCAL_CONVERSATIONS_KEY = 'spark_local_conversations_v1';

export interface LocalAccountRecord {
  id: string;
  email: string;
  password?: string;
  profile?: UserProfile;
  created_at: string;
}

export function generateConsistentUserId(email: string): string {
  const clean = email.trim().toLowerCase();
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0, ch; i < clean.length; i++) {
    ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  return `${hex1}-${hex2.slice(0, 4)}-4${hex2.slice(5, 8)}-a${hex3.slice(1, 4)}-${hex1}${hex3.slice(0, 4)}`;
}

export function getLocalAccounts(): LocalAccountRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalAccounts(accounts: LocalAccountRecord[]) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Failed to save local accounts:', e);
  }
}

export function findLocalAccountByEmail(email: string): LocalAccountRecord | undefined {
  const clean = email.trim().toLowerCase();
  return getLocalAccounts().find((a) => a.email.toLowerCase() === clean);
}

export function findLocalAccountById(userId: string): LocalAccountRecord | undefined {
  return getLocalAccounts().find((a) => a.id === userId);
}

export function upsertLocalAccount(
  email: string,
  password?: string,
  userId?: string,
  profile?: UserProfile
): LocalAccountRecord {
  const cleanEmail = email.trim().toLowerCase();
  const accounts = getLocalAccounts();
  const existingIdx = accounts.findIndex(
    (a) => a.email.toLowerCase() === cleanEmail || (userId && a.id === userId)
  );

  if (existingIdx >= 0) {
    const existing = accounts[existingIdx];
    const updated: LocalAccountRecord = {
      ...existing,
      id: userId || existing.id || generateConsistentUserId(cleanEmail),
      email: cleanEmail || existing.email,
      password: password || existing.password,
      profile: profile || existing.profile,
    };
    accounts[existingIdx] = updated;
    saveLocalAccounts(accounts);
    return updated;
  }

  const newAccount: LocalAccountRecord = {
    id: userId || generateConsistentUserId(cleanEmail),
    email: cleanEmail,
    password,
    profile,
    created_at: new Date().toISOString(),
  };
  accounts.push(newAccount);
  saveLocalAccounts(accounts);
  return newAccount;
}

export function isLocalUsernameTaken(normalizedUsername: string, excludeUserId?: string): boolean {
  const target = normalizedUsername.trim().toLowerCase();
  if (!target) return false;
  const accounts = getLocalAccounts();
  for (const acc of accounts) {
    if (acc.profile?.username && acc.profile.username.toLowerCase() === target) {
      if (!excludeUserId || acc.id !== excludeUserId) {
        return true;
      }
    }
  }
  return false;
}

const STAY_SIGNED_IN_KEY = 'spark_stay_signed_in_v1';

export function saveActiveLocalSession(userId: string, email?: string) {
  try {
    localStorage.setItem(STAY_SIGNED_IN_KEY, 'true');
    localStorage.setItem(
      ACTIVE_LOCAL_USER_KEY,
      JSON.stringify({ id: userId, email: email || '', updated_at: new Date().toISOString() })
    );
  } catch {}
}

export function getActiveLocalSession(): { id: string; email: string } | null {
  try {
    if (localStorage.getItem(STAY_SIGNED_IN_KEY) === 'false') {
      return null;
    }
    const raw = localStorage.getItem(ACTIVE_LOCAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id) return parsed;
  } catch {}
  return null;
}

export function getPersistentSignedInProfile(): UserProfile | null {
  try {
    if (localStorage.getItem(STAY_SIGNED_IN_KEY) === 'false') {
      return null;
    }
    const active = getActiveLocalSession();
    const storedProfile = getLocalProfile();

    if (active?.id) {
      const account =
        findLocalAccountById(active.id) ||
        (active.email ? findLocalAccountByEmail(active.email) : undefined);
      if (account?.profile && account.profile.id && account.profile.username) {
        return account.profile;
      }
      if (storedProfile && storedProfile.id === active.id && storedProfile.username) {
        return storedProfile;
      }
    }

    if (storedProfile && storedProfile.id && storedProfile.username) {
      return storedProfile;
    }
  } catch {}
  return null;
}

export const DEFAULT_TEST_GROUP_MEMBERS = [
  {
    id: 'test_user_arjun',
    username: 'arjun_v',
    display_name: 'Arjun Verma',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Arjun&backgroundColor=f1f5f9',
    bio: 'Always down for a quick Spark!',
    streak_days: 7,
  },
  {
    id: 'test_user_neha',
    username: 'neha_spark',
    display_name: 'Neha Kapoor',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Neha&backgroundColor=f1f5f9',
    bio: 'Design & photography',
    streak_days: 12,
  },
  {
    id: 'test_user_rohan',
    username: 'rohan_k',
    display_name: 'Rohan Khanna',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Rohan&backgroundColor=f1f5f9',
    bio: 'Building cool things',
    streak_days: 5,
  },
  {
    id: 'test_user_priya',
    username: 'priya_m',
    display_name: 'Priya Mehta',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Priya&backgroundColor=f1f5f9',
    bio: 'Coffee + late night chats',
    streak_days: 9,
  },
];

export function getLocalStoredConversations(userId: string): any[] {
  const defaultTestGroup = {
    id: 'group_spark_test_squad',
    is_group: true,
    name: 'Spark Test Squad',
    avatar_url: 'https://api.dicebear.com/7.x/identicon/svg?seed=SparkTestSquad&backgroundColor=ffe4e6',
    member_count: 4,
    members: DEFAULT_TEST_GROUP_MEMBERS,
    created_by: userId || 'system',
    created_at: '2026-11-01T08:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    other_user: {
      id: 'group_spark_test_squad',
      username: 'spark_test_squad',
      display_name: 'Spark Test Squad',
      avatar_url: 'https://api.dicebear.com/7.x/identicon/svg?seed=SparkTestSquad&backgroundColor=ffe4e6',
      is_online: true,
      streak_days: 1,
      equipped_frame: 'frame_pulsar',
    },
    last_message: {
      id: 'msg_welcome_group',
      content: 'Tap here to test sending pictures & today To-Do list in the group! 📷',
      sender_id: 'test_user_neha',
      created_at: '2026-11-01T08:00:00.000Z',
    },
    has_unread: false,
  };

  const mergedMap = new Map<string, any>();

  try {
    const rawUser = userId ? localStorage.getItem(`${LOCAL_CONVERSATIONS_KEY}_${userId}`) : null;
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (Array.isArray(parsed)) {
        parsed.forEach((c: any) => {
          if (c && c.id) mergedMap.set(c.id, c);
        });
      }
    }
    const rawGlobal = localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
    if (rawGlobal) {
      const parsedGlobal = JSON.parse(rawGlobal);
      if (Array.isArray(parsedGlobal)) {
        parsedGlobal.forEach((c: any) => {
          if (c && c.id && !mergedMap.has(c.id)) {
            mergedMap.set(c.id, c);
          }
        });
      }
    }
  } catch {}

  if (!mergedMap.has(defaultTestGroup.id)) {
    mergedMap.set(defaultTestGroup.id, defaultTestGroup);
  }

  // Hydrate latest cached message into each conversation so chat previews always stay updated
  const result = Array.from(mergedMap.values()).map((conv) => {
    const cachedMsgs = getCachedMessages(conv.id);
    if (cachedMsgs.length > 0) {
      const latest = cachedMsgs[cachedMsgs.length - 1];
      const snippet = latest.media_url
        ? latest.content
          ? `📷 ${latest.content}`
          : '📷 Photo'
        : latest.content || conv.last_message?.content || 'Message';
      return {
        ...conv,
        updated_at: latest.created_at || conv.updated_at,
        last_message: {
          id: latest.id,
          content: snippet,
          sender_id: latest.sender_id,
          created_at: latest.created_at,
          media_url: latest.media_url,
        },
      };
    }
    return conv;
  });

  result.sort((a, b) => {
    const tA = new Date(a.last_message?.created_at || a.updated_at || 0).getTime();
    const tB = new Date(b.last_message?.created_at || b.updated_at || 0).getTime();
    return tB - tA;
  });

  return result;
}

export function saveLocalStoredConversations(userId: string, conversations: any[]) {
  try {
    if (userId) {
      localStorage.setItem(`${LOCAL_CONVERSATIONS_KEY}_${userId}`, JSON.stringify(conversations));
    }
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {}
}

export const DAILY_COIN_CAP = 100;
export const COINS_PER_MESSAGE = 2;
export const MIN_MESSAGE_LENGTH = 3;
export const SPAM_COOLDOWN_MS = 2500; // 2.5s cooldown

// Default starter profile structure
export const DEFAULT_STARTER_PROFILE: UserProfile = {
  id: '',
  username: '',
  display_name: '',
  avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=spark1&backgroundColor=f1f5f9',
  avatar_style: 'cosmic_neon',
  bio: '',
  coins: 50,
  streak_days: 1,
  daily_coins_earned: 0,
  daily_coins_date: new Date().toISOString().split('T')[0],
  weekly_coins: 0,
  equipped_frame: 'frame_pulsar',
  equipped_theme: 'theme_cosmic',
  equipped_outfit: 'outfit_voyager',
  unlocked_items: ['frame_pulsar', 'theme_cosmic', 'outfit_voyager'],
  created_at: new Date().toISOString(),
};

// Initial friend orbs - zero fake users in production
export const DEFAULT_FRIEND_ORBS: FriendOrb[] = [];

export const DEFAULT_DAILY_QUESTS: DailyQuest[] = [
  {
    id: 'quest_1',
    title: 'Ignite Sparks',
    description: 'Send messages to friends to ignite the daily spark grid',
    reward_coins: 15,
    progress: 0,
    goal: 3,
    completed: false,
    icon_type: 'flame',
  },
  {
    id: 'quest_2',
    title: 'Orbital Exchange',
    description: 'Chat with friends in your orbit today',
    reward_coins: 25,
    progress: 0,
    goal: 2,
    completed: false,
    icon_type: 'message',
  },
  {
    id: 'quest_3',
    title: 'Flame Guardian',
    description: 'Maintain an active streak with your top friend',
    reward_coins: 30,
    progress: 0,
    goal: 1,
    completed: false,
    icon_type: 'streak',
  },
];

export const DEFAULT_FRIEND_REQUESTS: FriendRequest[] = [];

// Initial active stories - zero fake stories in production
export const DEFAULT_STORIES: UserStory[] = [];

// Shop Catalog: Outfits, Chat Themes, Profile Frames
export const SHOP_ITEMS: ShopItem[] = [
  // Profile Frames
  {
    id: 'frame_pulsar',
    category: 'frame',
    name: 'Pulsar Energy Ring',
    description: 'A classic neon cyan energy loop radiating from your orbit.',
    price: 0,
    color_glow: '#38bdf8',
    gradient_css: 'from-cyan-400 to-blue-500 shadow-[0_0_20px_rgba(56,189,248,0.5)]',
    badge: 'Starter',
    icon_name: 'CircleDot',
  },
  {
    id: 'frame_flame',
    category: 'frame',
    name: 'Solar Dragon Flame',
    description: 'Forged in stellar plasma. Crackles with fiery embers and streak power.',
    price: 80,
    color_glow: '#f43f5e',
    gradient_css: 'from-amber-400 via-rose-500 to-yellow-300 shadow-[0_0_25px_rgba(244,63,94,0.6)] animate-pulse',
    badge: 'Popular',
    icon_name: 'Flame',
  },
  {
    id: 'frame_crystal',
    category: 'frame',
    name: 'Astral Crystal Shard',
    description: 'Geometric diamond shards harvested from deep void comets.',
    price: 120,
    color_glow: '#c084fc',
    gradient_css: 'from-fuchsia-500 via-purple-400 to-indigo-400 shadow-[0_0_25px_rgba(192,132,252,0.6)]',
    badge: 'Rare',
    icon_name: 'Sparkles',
  },
  {
    id: 'frame_neon_circuit',
    category: 'frame',
    name: 'Hyper Electric Circuit',
    description: 'Cybernetic micro-traces that pulse with raw data packet voltage.',
    price: 150,
    color_glow: '#10b981',
    gradient_css: 'from-emerald-400 via-teal-300 to-cyan-400 shadow-[0_0_25px_rgba(16,185,129,0.6)]',
    badge: 'Legendary',
    icon_name: 'Cpu',
  },

  // Chat Themes
  {
    id: 'theme_cosmic',
    category: 'theme',
    name: 'Deep Space Hologram',
    description: 'Cool starlight neon gradients with cyan & indigo glowing cards.',
    price: 0,
    color_glow: '#6366f1',
    gradient_css: 'from-cyan-500 via-indigo-500 to-purple-500',
    badge: 'Default',
    icon_name: 'Palette',
  },
  {
    id: 'theme_solar',
    category: 'theme',
    name: 'Solar Flare Amber',
    description: 'Blazing golden messages with warm sunset auroras and molten sparks.',
    price: 90,
    color_glow: '#f59e0b',
    gradient_css: 'from-amber-400 via-orange-500 to-red-500',
    badge: 'Warm Glow',
    icon_name: 'Sun',
  },
  {
    id: 'theme_cyber',
    category: 'theme',
    name: 'Matrix Cyberpunk',
    description: 'Acid emerald terminal borders with electric green sparks.',
    price: 110,
    color_glow: '#10b981',
    gradient_css: 'from-emerald-400 via-teal-500 to-cyan-500',
    badge: 'Hacker',
    icon_name: 'Terminal',
  },
  {
    id: 'theme_void',
    category: 'theme',
    name: 'Violet Void Eclipse',
    description: 'Ultra-dark obsidian glass with intense ultraviolet perimeter flares.',
    price: 130,
    color_glow: '#a855f7',
    gradient_css: 'from-purple-500 via-pink-600 to-indigo-600',
    badge: 'Mystic',
    icon_name: 'Moon',
  },

  // Avatar Outfits / Skins
  {
    id: 'outfit_voyager',
    category: 'outfit',
    name: 'Star Voyager Helm',
    description: 'Standard issue interstellar exploration pressurized suit.',
    price: 0,
    color_glow: '#38bdf8',
    gradient_css: 'from-cyan-400 to-indigo-500',
    badge: 'Starter',
    icon_name: 'Compass',
  },
  {
    id: 'outfit_cyberpunk',
    category: 'outfit',
    name: 'Neo Tokyo Ronin',
    description: 'Futuristic visor helmet with neon red optics and audio visor.',
    price: 100,
    color_glow: '#f43f5e',
    gradient_css: 'from-rose-500 via-fuchsia-500 to-indigo-500',
    badge: 'Cyber',
    icon_name: 'Zap',
  },
  {
    id: 'outfit_golden_mecha',
    category: 'outfit',
    name: 'Golden Sun Mecha',
    description: 'Heavy gold titanium armor plates reflecting pure solar light.',
    price: 180,
    color_glow: '#eab308',
    gradient_css: 'from-yellow-400 via-amber-500 to-orange-400',
    badge: 'Prestige',
    icon_name: 'Shield',
  },
  {
    id: 'outfit_astral_god',
    category: 'outfit',
    name: 'Celestial Astral Mantle',
    description: 'Formed from concentrated gravitational lensing. Truly divine presence.',
    price: 240,
    color_glow: '#c084fc',
    gradient_css: 'from-indigo-400 via-purple-500 to-pink-500',
    badge: 'God Tier',
    icon_name: 'Crown',
  },
];

// Device cache helpers
export function getCachedMessages(friendId: string): ChatMessage[] {
  if (!friendId) return [];
  try {
    const raw = localStorage.getItem(`${CHAT_CACHE_PREFIX}${friendId}`);
    if (!raw) return [];
    const list: ChatMessage[] = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(-100) : [];
  } catch {
    return [];
  }
}

export function saveCachedMessages(friendId: string, messages: ChatMessage[]) {
  if (!friendId) return;
  const latest = messages.slice(-100);
  try {
    localStorage.setItem(`${CHAT_CACHE_PREFIX}${friendId}`, JSON.stringify(latest));
  } catch (e) {
    // If localStorage quota is reached due to multiple high-res photos, trim older base64 media urls while keeping recent photos & all text messages
    try {
      const compacted = latest.map((m, idx) => {
        if (idx < latest.length - 10 && m.media_url && m.media_url.startsWith('data:')) {
          return { ...m, media_url: undefined, content: m.content || '📷 [Photo]' };
        }
        return m;
      });
      localStorage.setItem(`${CHAT_CACHE_PREFIX}${friendId}`, JSON.stringify(compacted));
    } catch (innerErr) {
      console.warn('Storage quota warning when caching chat:', innerErr);
    }
  }
}

export function appendCachedMessage(friendId: string, message: ChatMessage): ChatMessage[] {
  if (!friendId) return [message];
  const existing = getCachedMessages(friendId);
  if (existing.some((m) => m.id === message.id)) {
    return existing;
  }
  const updated = [...existing, message];
  saveCachedMessages(friendId, updated);
  return updated;
}

export function getLocalProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      if (p.daily_coins_date !== today) {
        p.daily_coins_date = today;
        p.daily_coins_earned = 0;
      }
      // Ensure phase 2 and 3 fields exist
      if (!p.equipped_frame) p.equipped_frame = 'frame_pulsar';
      if (!p.equipped_theme) p.equipped_theme = 'theme_cosmic';
      if (!p.equipped_outfit) p.equipped_outfit = 'outfit_voyager';
      if (!p.unlocked_items) p.unlocked_items = ['frame_pulsar', 'theme_cosmic', 'outfit_voyager'];
      if (typeof p.weekly_coins !== 'number') p.weekly_coins = 68;
      return p;
    }
  } catch {}
  return DEFAULT_STARTER_PROFILE;
}

export function saveLocalProfile(profile: UserProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if (profile.id && profile.username) {
      localStorage.setItem(STAY_SIGNED_IN_KEY, 'true');
    }
    if (profile.id) {
      saveActiveLocalSession(profile.id, profile.email);
      const existing = findLocalAccountById(profile.id) || (profile.email ? findLocalAccountByEmail(profile.email) : undefined);
      upsertLocalAccount(
        profile.email || existing?.email || `${profile.username || 'user'}@spark.local`,
        existing?.password,
        profile.id,
        profile
      );
    }
  } catch (e) {
    console.error('Failed to save profile locally:', e);
  }
}

export function getLocalFriends(): FriendOrb[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_FRIEND_ORBS;
}

export function saveLocalFriends(friends: FriendOrb[]) {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  } catch {}
}

export function getLocalQuests(): DailyQuest[] {
  try {
    const raw = localStorage.getItem(QUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_DAILY_QUESTS;
}

export function saveLocalQuests(quests: DailyQuest[]) {
  try {
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
  } catch {}
}

export function getLocalRequests(): FriendRequest[] {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_FRIEND_REQUESTS;
}

export function saveLocalRequests(requests: FriendRequest[]) {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  } catch {}
}

export function getLocalStories(): UserStory[] {
  try {
    const raw = localStorage.getItem(STORIES_KEY);
    if (raw) {
      const list: UserStory[] = JSON.parse(raw);
      const now = new Date().getTime();
      // Filter out stories older than 24 hours (auto-delete rule)
      const active = list.filter((s) => new Date(s.expires_at).getTime() > now);
      return active.length > 0 ? active : DEFAULT_STORIES;
    }
  } catch {}
  return DEFAULT_STORIES;
}

export function saveLocalStories(stories: UserStory[]) {
  try {
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories));
  } catch {}
}

// Client-side image compression helper (Efficiency Rule: compress before upload)
export async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 800; // max width or height

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as lightweight JPEG with 0.72 quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Anti-Spam & Reward Verification
export function evaluateMessageReward(
  content: string,
  currentDailyEarned: number
): { canReward: boolean; coins: number; reason?: string } {
  const trimmed = content.trim();

  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { canReward: false, coins: 0, reason: 'Message too short to earn sparks.' };
  }

  if (currentDailyEarned >= DAILY_COIN_CAP) {
    return { canReward: false, coins: 0, reason: 'Daily spark reward cap reached (100 coins).' };
  }

  const lastText = sessionStorage.getItem(LAST_SENT_TEXT_KEY) || '';
  if (trimmed.toLowerCase() === lastText.toLowerCase()) {
    return { canReward: false, coins: 0, reason: 'Duplicate message detected. No duplicate spark.' };
  }

  const lastTime = parseInt(sessionStorage.getItem(LAST_SENT_TIME_KEY) || '0', 10);
  const now = Date.now();
  if (now - lastTime < SPAM_COOLDOWN_MS) {
    return { canReward: false, coins: 0, reason: 'Pacing spark generator... cool down a moment!' };
  }

  sessionStorage.setItem(LAST_SENT_TEXT_KEY, trimmed);
  sessionStorage.setItem(LAST_SENT_TIME_KEY, now.toString());

  return { canReward: true, coins: COINS_PER_MESSAGE };
}

// Zero fake starter messages in production
export function getInitialDemoMessages(userId: string, friendId: string): ChatMessage[] {
  return [];
}

// Weekly Leaderboard Builder: sorts current user and friends by weekly_coins
export function getWeeklyLeaderboard(profile: UserProfile, friends: FriendOrb[]): LeaderboardEntry[] {
  const list: {
    user_id: string;
    username: string;
    avatar_url: string;
    weekly_coins: number;
    streak_days: number;
    is_current_user: boolean;
    equipped_frame: string;
  }[] = [
    {
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      weekly_coins: profile.weekly_coins || 68,
      streak_days: profile.streak_days,
      is_current_user: true,
      equipped_frame: profile.equipped_frame || 'frame_pulsar',
    },
    ...friends.map((f) => {
      // derive believable weekly coin score from streak
      const baselineCoins = f.streak_days * 8 + (f.username.charCodeAt(0) % 30);
      return {
        user_id: f.id,
        username: f.username,
        avatar_url: f.avatar_url,
        weekly_coins: baselineCoins,
        streak_days: f.streak_days,
        is_current_user: false,
        equipped_frame: f.equipped_frame || 'frame_pulsar',
      };
    }),
  ];

  // Sort descending by weekly coins
  list.sort((a, b) => b.weekly_coins - a.weekly_coins);

  return list.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));
}

// Calculate countdown to next Monday 00:00 UTC (Weekly leaderboard reset)
export function getTimeUntilNextMonday(): string {
  const now = new Date();
  const nextMonday = new Date(now);
  const day = nextMonday.getUTCDay();
  const diff = (7 - day + 1) % 7 || 7; // days until next Monday
  nextMonday.setUTCDate(nextMonday.getUTCDate() + diff);
  nextMonday.setUTCHours(0, 0, 0, 0);

  const diffMs = nextMonday.getTime() - now.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

// Local session cleanup on explicit user signout — preserves stored chats, groups, todos, quests, and accounts
export function clearUserSessionData() {
  localStorage.setItem(STAY_SIGNED_IN_KEY, 'false');
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LAST_SENT_TEXT_KEY);
  localStorage.removeItem(LAST_SENT_TIME_KEY);
  localStorage.removeItem('spark_active_local_user');
  localStorage.removeItem('spark_demo_mode_active');
  try {
    sessionStorage.clear();
  } catch {}
}
