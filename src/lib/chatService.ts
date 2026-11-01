import { getSupabase, isSupabaseConfigured } from './supabase';
import { ChatMessage, PublicUserProfile, RealConversation } from '../types';
import {
  encryptE2EEMessage,
  decryptE2EEMessage,
  E2EE_VERSION,
} from './cryptoService';
import {
  isLocalUsernameTaken,
  getLocalAccounts,
  getLocalProfile,
  getLocalStoredConversations,
  saveLocalStoredConversations,
  getCachedMessages,
  saveCachedMessages,
  findLocalAccountById,
} from './storage';

/**
 * Validates username format client-side before any network activity.
 * Rules: 3-20 characters, only letters, numbers, and underscores, no whitespace.
 */
export function validateUsernameFormat(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = (raw || '').trim();
  const withoutAt = trimmed.replace(/^@+/, '');
  const normalized = withoutAt.toLowerCase();

  if (!normalized) {
    return { valid: false, normalized: '', error: 'Username cannot be empty.' };
  }
  if (/\s/.test(withoutAt)) {
    return { valid: false, normalized, error: 'Usernames cannot contain spaces.' };
  }
  if (normalized.length < 3) {
    return { valid: false, normalized, error: 'Must be at least 3 characters long.' };
  }
  if (normalized.length > 20) {
    return { valid: false, normalized, error: 'Cannot exceed 20 characters.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(withoutAt)) {
    return {
      valid: false,
      normalized,
      error: 'Only letters, numbers, and underscores (_) are allowed.',
    };
  }

  return { valid: true, normalized };
}

/**
 * Checks if a normalized username is available in Supabase and local accounts.
 * Uses secure RPC function if available, falling back to direct indexed lookup.
 * Protects against exposing sensitive account info.
 */
export async function checkUsernameAvailability(
  rawUsername: string,
  excludeUserId?: string
): Promise<{
  valid: boolean;
  available: boolean;
  normalized: string;
  message: string;
}> {
  const validation = validateUsernameFormat(rawUsername);
  if (!validation.valid) {
    return {
      valid: false,
      available: false,
      normalized: validation.normalized,
      message: validation.error || 'Invalid username format',
    };
  }

  if (isLocalUsernameTaken(validation.normalized, excludeUserId)) {
    return {
      valid: true,
      available: false,
      normalized: validation.normalized,
      message: 'Username already taken',
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      valid: true,
      available: true,
      normalized: validation.normalized,
      message: 'Username available',
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      valid: true,
      available: true,
      normalized: validation.normalized,
      message: 'Username available',
    };
  }

  try {
    // 1. Try secure RPC function first
    const { data: rpcAvailable, error: rpcError } = await supabase.rpc(
      'check_username_available',
      { target_username: validation.normalized }
    );

    if (!rpcError && typeof rpcAvailable === 'boolean') {
      return {
        valid: true,
        available: rpcAvailable,
        normalized: validation.normalized,
        message: rpcAvailable ? 'Username available' : 'Username already taken',
      };
    }

    // 2. Direct query fallback against indexed lowercase username
    let query = supabase
      .from('profiles')
      .select('id')
      .ilike('username', validation.normalized)
      .limit(1);

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query;
    if (error) {
      // If table is not initialized yet or RLS blocks unauthenticated read, allow format-valid username
      return {
        valid: true,
        available: true,
        normalized: validation.normalized,
        message: 'Username available',
      };
    }

    const isAvailable = !data || data.length === 0;
    return {
      valid: true,
      available: isAvailable,
      normalized: validation.normalized,
      message: isAvailable ? 'Username available' : 'Username already taken',
    };
  } catch {
    return {
      valid: true,
      available: true,
      normalized: validation.normalized,
      message: 'Username available',
    };
  }
}

/**
 * Searches real registered users in the Supabase `profiles` table and local registered profiles.
 * Supports "alex", "@alex", "Alex", "alex_123" (case-insensitive).
 * Only returns public safe fields: id, username, display_name, avatar_url, bio, streak_days.
 * Never exposes email, auth keys, or private fields.
 */
export async function searchRealUsers(
  query: string,
  _currentUserId: string
): Promise<PublicUserProfile[]> {
  const clean = query.trim().replace(/^@+/, '').toLowerCase();
  if (!clean || clean.length < 1) return [];

  const resultsMap = new Map<string, PublicUserProfile>();

  // 1. Include registered local accounts with usernames
  const localAccounts = getLocalAccounts();
  for (const acc of localAccounts) {
    const p = acc.profile;
    if (p && p.id && p.username) {
      const uLower = p.username.toLowerCase();
      const dLower = (p.display_name || p.username).toLowerCase();
      if (uLower.includes(clean) || dLower.includes(clean)) {
        resultsMap.set(p.id, {
          id: p.id,
          username: p.username,
          display_name: p.display_name || p.username,
          avatar_url:
            p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.username}`,
          bio: p.bio || '',
          streak_days: p.streak_days || 1,
        });
      }
    }
  }

  const currentLocal = getLocalProfile();
  if (currentLocal && currentLocal.id && currentLocal.username) {
    const uLower = currentLocal.username.toLowerCase();
    const dLower = (currentLocal.display_name || currentLocal.username).toLowerCase();
    if (uLower.includes(clean) || dLower.includes(clean)) {
      resultsMap.set(currentLocal.id, {
        id: currentLocal.id,
        username: currentLocal.username,
        display_name: currentLocal.display_name || currentLocal.username,
        avatar_url:
          currentLocal.avatar_url ||
          `https://api.dicebear.com/7.x/bottts/svg?seed=${currentLocal.username}`,
        bio: currentLocal.bio || '',
        streak_days: currentLocal.streak_days || 1,
      });
    }
  }

  // 2. Query Supabase profiles if configured
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, streak_days')
          .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
          .limit(15);

        if (!error && data) {
          for (const p of data) {
            if (p.id && p.username) {
              resultsMap.set(p.id, {
                id: p.id,
                username: p.username,
                display_name: p.display_name || p.username,
                avatar_url:
                  p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.username}`,
                bio: p.bio || '',
                streak_days: p.streak_days || 1,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Exception during searchRealUsers:', e);
      }
    }
  }

  const list = Array.from(resultsMap.values());

  // Prioritize exact username match first, then prefix match
  return list.sort((a, b) => {
    const aUser = a.username.toLowerCase();
    const bUser = b.username.toLowerCase();
    if (aUser === clean && bUser !== clean) return -1;
    if (bUser === clean && aUser !== clean) return 1;
    if (aUser.startsWith(clean) && !bUser.startsWith(clean)) return -1;
    if (bUser.startsWith(clean) && !aUser.startsWith(clean)) return 1;
    return aUser.localeCompare(bUser);
  });
}

/**
 * Gets an existing 1-to-1 conversation between two users, or creates a new one.
 * Enforces that only one conversation exists between any two users.
 */
export async function getOrCreateRealConversation(
  currentUserId: string,
  targetUserId: string
): Promise<string> {
  if (currentUserId === targetUserId) {
    throw new Error('Cannot start a conversation with yourself.');
  }

  const sorted = [currentUserId, targetUserId].sort();
  const fallbackConvId = `conv_${sorted[0].substring(0, 8)}_${sorted[1].substring(0, 8)}`;

  const saveFallbackLocalConv = (convId: string) => {
    const targetAccount = findLocalAccountById(targetUserId);
    const targetProf = targetAccount?.profile;
    if (targetProf) {
      const existingConvs = getLocalStoredConversations(currentUserId);
      if (!existingConvs.some((c: any) => c.id === convId)) {
        const newConv: RealConversation = {
          id: convId,
          is_group: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          other_user: {
            id: targetProf.id,
            username: targetProf.username,
            display_name: targetProf.display_name || targetProf.username,
            avatar_url: targetProf.avatar_url,
            is_online: true,
            streak_days: targetProf.streak_days || 1,
            equipped_frame: targetProf.equipped_frame || 'frame_pulsar',
          },
          has_unread: false,
        };
        saveLocalStoredConversations(currentUserId, [newConv, ...existingConvs]);
      }
    }
  };

  if (!isSupabaseConfigured()) {
    saveFallbackLocalConv(fallbackConvId);
    return fallbackConvId;
  }

  const supabase = getSupabase();
  if (!supabase) {
    saveFallbackLocalConv(fallbackConvId);
    return fallbackConvId;
  }

  try {
    // 1. Find conversations the current user is a member of
    const { data: myMemberships, error: myError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (!myError && myMemberships && myMemberships.length > 0) {
      const myConvIds = myMemberships.map((m: any) => m.conversation_id);

      // Check if target user is in any of these same conversations
      const { data: sharedMemberships, error: sharedError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', myConvIds)
        .eq('user_id', targetUserId)
        .limit(1);

      if (!sharedError && sharedMemberships && sharedMemberships.length > 0) {
        return sharedMemberships[0].conversation_id;
      }
    }

    // 2. No shared conversation found -> Create a new conversation
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({ updated_at: new Date().toISOString() })
      .select('id')
      .single();

    if (createError || !newConv?.id) {
      saveFallbackLocalConv(fallbackConvId);
      return fallbackConvId;
    }

    const conversationId = newConv.id;

    // 3. Add both members to conversation_members
    await supabase.from('conversation_members').insert([
      { conversation_id: conversationId, user_id: currentUserId },
      { conversation_id: conversationId, user_id: targetUserId },
    ]);

    return conversationId;
  } catch (err) {
    console.warn('Error in getOrCreateRealConversation, using fallback:', err);
    saveFallbackLocalConv(fallbackConvId);
    return fallbackConvId;
  }
}

/**
 * Fetches real conversations (both 1-to-1 and group chats) for the current authenticated user.
 */
export async function fetchUserRealConversations(
  currentUserId: string
): Promise<RealConversation[]> {
  const localStored = getLocalStoredConversations(currentUserId);

  if (!isSupabaseConfigured()) {
    return localStored;
  }

  const supabase = getSupabase();
  if (!supabase) return localStored;

  try {
    // 1. Get all conversation IDs this user is part of
    const { data: myMemberships, error: memberError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (memberError || !myMemberships || myMemberships.length === 0) {
      const direct = await fetchConversationsFromMessagesDirect(currentUserId);
      return direct.length > 0 ? direct : localStored;
    }

    const conversationIds = myMemberships.map((m: any) => m.conversation_id);

    // 2. Fetch conversation records to check for group vs 1-to-1
    const { data: convRecords } = await supabase
      .from('conversations')
      .select('id, is_group, name, avatar_url, created_by, created_at, updated_at')
      .in('id', conversationIds);

    const convMap = new Map<string, any>();
    (convRecords || []).forEach((c: any) => convMap.set(c.id, c));

    // 3. Fetch all members of these conversations
    const { data: allMembers, error: membersError } = await supabase
      .from('conversation_members')
      .select(
        'conversation_id, user_id, profiles(id, username, display_name, avatar_url, streak_days, equipped_frame)'
      )
      .in('conversation_id', conversationIds);

    if (membersError || !allMembers) {
      const direct = await fetchConversationsFromMessagesDirect(currentUserId);
      return direct.length > 0 ? direct : localStored;
    }

    // Group members by conversation_id
    const convMembersMap = new Map<string, any[]>();
    for (const m of allMembers) {
      if (!convMembersMap.has(m.conversation_id)) {
        convMembersMap.set(m.conversation_id, []);
      }
      convMembersMap.get(m.conversation_id)?.push(m);
    }

    const conversationsList: RealConversation[] = [];

    // 4. Build RealConversation objects for each conversation
    for (const convId of conversationIds) {
      const convMeta = convMap.get(convId);
      const members = convMembersMap.get(convId) || [];
      const isGroup = Boolean(convMeta?.is_group);

      // Fetch last message for this conversation
      const { data: lastMsgData } = await supabase
        .from('messages')
        .select('id, content, media_url, ciphertext, iv, sender_id, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let snippet = 'Tap to start chatting...';
      if (lastMsgData) {
        if (lastMsgData.media_url) {
          snippet = lastMsgData.content ? `📷 ${lastMsgData.content}` : '📷 Photo';
        } else if (lastMsgData.ciphertext) {
          snippet = '🔒 End-to-end encrypted message';
        } else {
          snippet = lastMsgData.content || 'Message';
        }
      }

      if (isGroup) {
        // Group Conversation Representation
        const groupMembersList = members
          .map((m: any) => m.profiles)
          .filter(Boolean)
          .map((p: any) => ({
            id: p.id,
            username: p.username,
            display_name: p.display_name || p.username,
            avatar_url: p.avatar_url,
            streak_days: p.streak_days || 1,
          }));

        const groupName = convMeta?.name || 'Group Chat';
        const groupAvatar =
          convMeta?.avatar_url ||
          `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupName)}&backgroundColor=ffe4e6`;

        conversationsList.push({
          id: convId,
          is_group: true,
          name: groupName,
          avatar_url: groupAvatar,
          member_count: members.length,
          members: groupMembersList,
          created_by: convMeta?.created_by,
          created_at: convMeta?.created_at || new Date().toISOString(),
          updated_at: lastMsgData?.created_at || convMeta?.updated_at || new Date().toISOString(),
          other_user: {
            id: convId,
            username: groupName.toLowerCase().replace(/\s+/g, '_'),
            display_name: groupName,
            avatar_url: groupAvatar,
            is_online: true,
            streak_days: 1,
            equipped_frame: 'frame_pulsar',
          },
          last_message: lastMsgData
            ? {
                id: lastMsgData.id,
                content: snippet,
                sender_id: lastMsgData.sender_id,
                created_at: lastMsgData.created_at,
                media_url: lastMsgData.media_url,
              }
            : undefined,
          has_unread: lastMsgData ? lastMsgData.sender_id !== currentUserId : false,
        });
      } else {
        // 1-to-1 Conversation Representation
        const otherMemberItem = members.find((m: any) => m.user_id !== currentUserId);
        const otherProfile = otherMemberItem?.profiles;
        if (!otherProfile) continue;

        conversationsList.push({
          id: convId,
          is_group: false,
          created_at: convMeta?.created_at || new Date().toISOString(),
          updated_at: lastMsgData?.created_at || convMeta?.updated_at || new Date().toISOString(),
          other_user: {
            id: otherProfile.id,
            username: otherProfile.username,
            display_name: otherProfile.display_name || otherProfile.username,
            avatar_url:
              otherProfile.avatar_url ||
              `https://api.dicebear.com/7.x/bottts/svg?seed=${otherProfile.username}`,
            is_online: true,
            streak_days: otherProfile.streak_days || 1,
            equipped_frame: otherProfile.equipped_frame || 'frame_pulsar',
          },
          last_message: lastMsgData
            ? {
                id: lastMsgData.id,
                content: snippet,
                sender_id: lastMsgData.sender_id,
                created_at: lastMsgData.created_at,
                media_url: lastMsgData.media_url,
              }
            : undefined,
          has_unread: lastMsgData ? lastMsgData.sender_id !== currentUserId : false,
        });
      }
    }

    // Merge any locally stored conversations not yet in Supabase
    for (const loc of localStored) {
      if (!conversationsList.some((c) => c.id === loc.id)) {
        conversationsList.push(loc);
      }
    }

    // Sort by latest message date descending
    conversationsList.sort((a, b) => {
      const timeA = new Date(a.last_message?.created_at || a.updated_at).getTime();
      const timeB = new Date(b.last_message?.created_at || b.updated_at).getTime();
      return timeB - timeA;
    });

    return conversationsList;
  } catch (err) {
    console.warn('Error fetching real conversations:', err);
    return localStored;
  }
}

async function fetchConversationsFromMessagesDirect(
  currentUserId: string
): Promise<RealConversation[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, content, media_url, ciphertext, iv, created_at, conversation_id')
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !msgs || msgs.length === 0) return [];

    const partnerMap = new Map<string, any>();
    for (const m of msgs) {
      const partnerId = m.sender_id === currentUserId ? m.receiver_id : m.sender_id;
      if (!partnerId) continue;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, m);
      }
    }

    const partnerIds = Array.from(partnerMap.keys());
    if (partnerIds.length === 0) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, streak_days, equipped_frame')
      .in('id', partnerIds);

    if (!profiles || profiles.length === 0) return [];

    const result: RealConversation[] = [];
    for (const p of profiles) {
      const lastM = partnerMap.get(p.id);
      let snippet = 'Message';
      if (lastM.media_url) {
        snippet = lastM.content ? `📷 ${lastM.content}` : '📷 Photo';
      } else if (lastM.ciphertext) {
        snippet = '🔒 End-to-end encrypted message';
      } else {
        snippet = lastM.content || 'Message';
      }

      result.push({
        id: lastM.conversation_id || `conv_${p.id}`,
        created_at: lastM.created_at,
        updated_at: lastM.created_at,
        other_user: {
          id: p.id,
          username: p.username,
          display_name: p.display_name || p.username,
          avatar_url: p.avatar_url,
          is_online: true,
          streak_days: p.streak_days || 1,
          equipped_frame: p.equipped_frame || 'frame_pulsar',
        },
        last_message: {
          id: lastM.id,
          content: snippet,
          sender_id: lastM.sender_id,
          created_at: lastM.created_at,
          media_url: lastM.media_url,
        },
        has_unread: lastM.sender_id !== currentUserId,
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Creates a real group conversation in Supabase and adds all selected members.
 */
export async function createRealGroupConversation(
  creatorId: string,
  groupName: string,
  memberUserIds: string[],
  groupAvatarUrl?: string,
  selectedMemberProfiles?: PublicUserProfile[]
): Promise<string> {
  const cleanName = groupName.trim();
  if (cleanName.length < 2) {
    throw new Error('Group name must be at least 2 characters.');
  }

  // Ensure unique member list including the creator
  const allMemberIds = Array.from(new Set([creatorId, ...memberUserIds]));
  if (allMemberIds.length < 2) {
    throw new Error('Please select at least 1 other member to create a group.');
  }

  const defaultAvatar =
    groupAvatarUrl ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=ffe4e6`;

  const saveLocalGroupRecord = (convId: string) => {
    const existing = getLocalStoredConversations(creatorId);
    const newGroupConv: RealConversation = {
      id: convId,
      is_group: true,
      name: cleanName,
      avatar_url: defaultAvatar,
      member_count: allMemberIds.length,
      members: selectedMemberProfiles,
      created_by: creatorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      other_user: {
        id: convId,
        username: cleanName.toLowerCase().replace(/\s+/g, '_'),
        display_name: cleanName,
        avatar_url: defaultAvatar,
        is_online: true,
        streak_days: 1,
        equipped_frame: 'frame_pulsar',
      },
      has_unread: false,
    };
    const filtered = existing.filter((c) => c.id !== convId);
    saveLocalStoredConversations(creatorId, [newGroupConv, ...filtered]);
    return convId;
  };

  const createLocalFallbackGroup = () => {
    const localConvId = `group_${Date.now()}`;
    return saveLocalGroupRecord(localConvId);
  };

  if (!isSupabaseConfigured()) {
    return createLocalFallbackGroup();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return createLocalFallbackGroup();
  }

  try {
    // 1. Insert group row into conversations table
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert({
        is_group: true,
        name: cleanName,
        avatar_url: defaultAvatar,
        created_by: creatorId,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (convError || !convData?.id) {
      return createLocalFallbackGroup();
    }

    const newConvId = convData.id;

    // 2. Add all members to conversation_members
    const membershipRows = allMemberIds.map((userId) => ({
      conversation_id: newConvId,
      user_id: userId,
    }));

    await supabase.from('conversation_members').insert(membershipRows);

    return saveLocalGroupRecord(newConvId);
  } catch {
    return createLocalFallbackGroup();
  }
}

/**
 * Uploads an image for a group conversation into Supabase Storage private bucket 'chat-media'.
 * Saves only the image path/reference in messages.media_url.
 */
export async function uploadGroupChatImage(
  conversationId: string,
  file: File
): Promise<string> {
  if (!isSupabaseConfigured()) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const cleanConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `${cleanConvId}/${fileName}`;

  try {
    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.warn('Storage upload note, falling back to data URL:', error.message);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }

    return data?.path || filePath;
  } catch (e) {
    console.warn('Upload error, using fallback:', e);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

// In-memory cache for resolved signed URLs
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a private media reference path to a viewable signed URL.
 * Only members of that group can access them via Supabase RLS / auth.
 */
export async function resolveGroupMediaUrl(mediaRef: string): Promise<string> {
  if (!mediaRef) return '';
  if (
    mediaRef.startsWith('data:') ||
    mediaRef.startsWith('http://') ||
    mediaRef.startsWith('https://')
  ) {
    return mediaRef;
  }

  const cached = signedUrlCache.get(mediaRef);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const supabase = getSupabase();
  if (!supabase) return '';

  try {
    const { data, error } = await supabase.storage
      .from('chat-media')
      .createSignedUrl(mediaRef, 3600); // 1-hour secure URL

    if (!error && data?.signedUrl) {
      signedUrlCache.set(mediaRef, {
        url: data.signedUrl,
        expiresAt: Date.now() + 3500 * 1000,
      });
      return data.signedUrl;
    }

    // Public URL fallback if bucket is set to public
    const { data: publicData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(mediaRef);

    return publicData?.publicUrl || '';
  } catch {
    return '';
  }
}

/**
 * Fetches real messages for a conversation from Supabase and decrypts them on the client device.
 * For group chats, fetches media_url and sender profiles so sender names and images render correctly.
 */
export async function fetchRealMessages(
  conversationId: string,
  currentUserId: string,
  otherUserId?: string,
  conversationKey?: CryptoKey | null
): Promise<ChatMessage[]> {
  const cacheKey = conversationId || otherUserId || 'default';
  const cached = getCachedMessages(cacheKey);

  if (!isSupabaseConfigured()) {
    return cached;
  }

  const supabase = getSupabase();
  if (!supabase) return cached;

  try {
    let query = supabase
      .from('messages')
      .select(
        'id, conversation_id, sender_id, receiver_id, content, media_url, ciphertext, iv, encryption_version, coins_earned, created_at, profiles:sender_id(id, username, display_name, avatar_url)'
      )
      .order('created_at', { ascending: true })
      .limit(100);

    if (conversationId && !conversationId.startsWith('conv_') && !conversationId.startsWith('group_')) {
      query = query.eq('conversation_id', conversationId);
    } else if (otherUserId) {
      query = query.or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
      );
    } else {
      query = query.eq('conversation_id', conversationId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Error fetching messages:', error);
      return cached;
    }

    const processedMessages: ChatMessage[] = [];

    for (const m of (data || [])) {
      let displayContent = m.content || '';
      let isE2EE = false;
      let decryptionError = false;

      if (m.ciphertext && m.iv) {
        if (conversationKey) {
          const decrypted = await decryptE2EEMessage(m.ciphertext, m.iv, conversationKey);
          if (decrypted !== null) {
            displayContent = decrypted;
            isE2EE = true;
          } else {
            displayContent = '🔒 Unable to decrypt this message';
            decryptionError = true;
          }
        } else {
          displayContent = '🔒 Encrypted message (key establishing...)';
          decryptionError = true;
        }
      } else {
        displayContent = m.content || '';
        isE2EE = false;
      }

      const senderProf = (m as any).profiles;

      processedMessages.push({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_username: senderProf?.username,
        sender_display_name: senderProf?.display_name || senderProf?.username,
        sender_avatar_url: senderProf?.avatar_url,
        receiver_id: m.receiver_id,
        content: displayContent,
        media_url: m.media_url,
        ciphertext: m.ciphertext,
        iv: m.iv,
        encryption_version: m.encryption_version,
        is_e2ee: isE2EE,
        decryption_error: decryptionError,
        coins_earned: m.coins_earned || 2,
        created_at: m.created_at,
        status: 'delivered',
      });
    }

    const mergedMap = new Map<string, ChatMessage>();
    for (const cMsg of cached) {
      if (cMsg && cMsg.id) mergedMap.set(cMsg.id, cMsg);
    }
    for (const sMsg of processedMessages) {
      if (sMsg && sMsg.id) mergedMap.set(sMsg.id, sMsg);
    }

    const mergedMessages = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    saveCachedMessages(cacheKey, mergedMessages);
    return mergedMessages;
  } catch (err) {
    console.warn('Exception in fetchRealMessages:', err);
    return cached;
  }
}

/**
 * Sends a real message to Supabase. Supports optional group media_url.
 */
export async function sendRealMessageToSupabase(
  conversationId: string,
  verifiedSenderId: string,
  targetUserId: string,
  plaintext: string,
  conversationKey?: CryptoKey | null,
  mediaUrl?: string
): Promise<ChatMessage> {
  const cleanContent = (plaintext || '').trim();
  if (!cleanContent && !mediaUrl) {
    throw new Error('Message cannot be empty.');
  }

  if (cleanContent.length > 5000) {
    throw new Error('Message exceeds maximum allowed length of 5000 characters.');
  }

  const newId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const cacheKey = conversationId || targetUserId || 'default';
  const senderProfile = getLocalProfile();

  const saveLocalFallbackMsg = (msg: ChatMessage) => {
    const existing = getCachedMessages(cacheKey);
    saveCachedMessages(cacheKey, [...existing, msg]);
    return msg;
  };

  let ciphertext: string | undefined;
  let iv: string | undefined;
  let isE2EE = false;

  // Perform Client-Side Authenticated Encryption for text in 1-to-1 conversations
  if (conversationKey && !mediaUrl) {
    const encrypted = await encryptE2EEMessage(cleanContent, conversationKey);
    ciphertext = encrypted.ciphertext;
    iv = encrypted.iv;
    isE2EE = true;
  }

  const baseMessage: ChatMessage = {
    id: newId,
    conversation_id: conversationId,
    sender_id: verifiedSenderId,
    sender_username: senderProfile.username,
    sender_display_name: senderProfile.display_name || senderProfile.username,
    sender_avatar_url: senderProfile.avatar_url,
    receiver_id: targetUserId,
    content: cleanContent,
    media_url: mediaUrl,
    ciphertext,
    iv,
    encryption_version: isE2EE ? E2EE_VERSION : undefined,
    is_e2ee: isE2EE,
    coins_earned: 2,
    created_at: now,
    status: 'sent',
  };

  if (!isSupabaseConfigured()) {
    return saveLocalFallbackMsg(baseMessage);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return saveLocalFallbackMsg(baseMessage);
  }

  // Supabase Payload
  const payload: any = {
    sender_id: verifiedSenderId,
    content: isE2EE ? '' : cleanContent,
    media_url: mediaUrl || null,
    ciphertext: ciphertext || null,
    iv: iv || null,
    encryption_version: isE2EE ? E2EE_VERSION : null,
    coins_earned: 2,
  };

  if (targetUserId && targetUserId !== conversationId) {
    payload.receiver_id = targetUserId;
  }
  if (conversationId && !conversationId.startsWith('conv_') && !conversationId.startsWith('group_')) {
    payload.conversation_id = conversationId;
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      return saveLocalFallbackMsg(baseMessage);
    }

    // Update conversation timestamp
    if (conversationId && !conversationId.startsWith('conv_') && !conversationId.startsWith('group_')) {
      supabase
        .from('conversations')
        .update({ updated_at: now })
        .eq('id', conversationId)
        .then();
    }

    const savedMsg: ChatMessage = {
      ...baseMessage,
      id: data.id || newId,
      conversation_id: data.conversation_id || conversationId,
      created_at: data.created_at || now,
    };
    return saveLocalFallbackMsg(savedMsg);
  } catch {
    return saveLocalFallbackMsg(baseMessage);
  }
}


