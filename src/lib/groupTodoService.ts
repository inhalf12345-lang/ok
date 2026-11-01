import { getSupabase, isSupabaseConfigured } from './supabase';
import { PublicUserProfile } from '../types';

export interface TodoTaskItem {
  id: string;
  text: string;
  completed: boolean;
  completed_at?: string;
}

export interface MemberDailyTodoList {
  id: string;
  conversation_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  date_key: string; // YYYY-MM-DD
  tasks: TodoTaskItem[];
  status: 'in_progress' | 'submitted' | 'auto_submitted';
  submitted_at?: string;
  updated_at: string;
}

const GROUP_TODO_STORAGE_PREFIX = 'spark_group_todos_v1_';

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTimeUntilDeadline(): {
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
  isCheckInWindow: boolean;
} {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const diffMs = Math.max(0, midnight.getTime() - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  // Prompt user to check & submit when approaching deadline (last 2 hours before midnight, or around 12pm/12am check-in)
  const isCheckInWindow = hours < 2 || now.getHours() === 12 || now.getHours() === 23;

  return {
    hours,
    minutes,
    seconds,
    label: `${hours}h ${minutes}m`,
    isCheckInWindow,
  };
}

function getStorageKey(conversationId: string, dateKey: string): string {
  return `${GROUP_TODO_STORAGE_PREFIX}${conversationId}_${dateKey}`;
}

/**
 * Generates starter member to-do lists for the test group so multi-person progress is immediately visible.
 */
function seedStarterGroupTodos(
  conversationId: string,
  dateKey: string,
  members?: PublicUserProfile[]
): MemberDailyTodoList[] {
  if (!conversationId.includes('test') && (!members || members.length === 0)) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const defaultMembers: PublicUserProfile[] =
    members && members.length > 0
      ? members
      : [
          {
            id: 'test_user_arjun',
            username: 'arjun_v',
            display_name: 'Arjun Verma',
            avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Arjun&backgroundColor=f1f5f9',
          },
          {
            id: 'test_user_neha',
            username: 'neha_spark',
            display_name: 'Neha Kapoor',
            avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Neha&backgroundColor=f1f5f9',
          },
          {
            id: 'test_user_rohan',
            username: 'rohan_k',
            display_name: 'Rohan Khanna',
            avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Rohan&backgroundColor=f1f5f9',
          },
        ];

  const sampleTaskSets: { tasks: { text: string; completed: boolean }[]; status: 'in_progress' | 'submitted' }[] = [
    {
      status: 'in_progress',
      tasks: [
        { text: 'Morning 5km run & hydration', completed: true },
        { text: 'Finish UI sprint review deck', completed: true },
        { text: 'Push API integration PR', completed: false },
        { text: 'Read 20 pages before bed', completed: false },
      ],
    },
    {
      status: 'submitted',
      tasks: [
        { text: 'Finalize brand illustrations', completed: true },
        { text: 'Client feedback call at 2 PM', completed: true },
        { text: 'Organize design system tokens', completed: true },
      ],
    },
    {
      status: 'in_progress',
      tasks: [
        { text: 'Fix database migration script', completed: true },
        { text: 'Gym session (Upper body)', completed: false },
        { text: 'Review group pull requests', completed: false },
      ],
    },
  ];

  return defaultMembers.slice(0, 3).map((m, idx) => {
    const template = sampleTaskSets[idx % sampleTaskSets.length];
    return {
      id: `todo_${conversationId}_${m.id}_${dateKey}`,
      conversation_id: conversationId,
      user_id: m.id,
      username: m.username,
      display_name: m.display_name || m.username,
      avatar_url: m.avatar_url,
      date_key: dateKey,
      tasks: template.tasks.map((t, i) => ({
        id: `task_${m.id}_${i}`,
        text: t.text,
        completed: t.completed,
        completed_at: t.completed ? nowIso : undefined,
      })),
      status: template.status,
      submitted_at: template.status === 'submitted' ? nowIso : undefined,
      updated_at: nowIso,
    };
  });
}

/**
 * Loads all members' daily to-do lists for a group conversation on a given date.
 * Automatically auto-submits any unsubmitted past lists if the deadline has passed.
 */
export function getGroupDailyTodos(
  conversationId: string,
  members?: PublicUserProfile[],
  dateKey: string = getTodayDateKey()
): MemberDailyTodoList[] {
  const safeConvId = conversationId || 'default_group';
  const key = getStorageKey(safeConvId, dateKey);
  const latestKey = `${GROUP_TODO_STORAGE_PREFIX}${safeConvId}_latest`;
  try {
    const raw = localStorage.getItem(key) || localStorage.getItem(latestKey);
    if (raw) {
      const parsed: MemberDailyTodoList[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  const seeded = seedStarterGroupTodos(safeConvId, dateKey, members);
  if (seeded.length > 0) {
    saveGroupDailyTodos(safeConvId, seeded, dateKey);
  }
  return seeded;
}

export function saveGroupDailyTodos(
  conversationId: string,
  lists: MemberDailyTodoList[],
  dateKey: string = getTodayDateKey()
): void {
  const safeConvId = conversationId || 'default_group';
  const key = getStorageKey(safeConvId, dateKey);
  const latestKey = `${GROUP_TODO_STORAGE_PREFIX}${safeConvId}_latest`;
  try {
    const serialized = JSON.stringify(lists);
    localStorage.setItem(key, serialized);
    localStorage.setItem(latestKey, serialized);
  } catch (e) {
    console.warn('Failed to save group daily todos:', e);
  }
}

export function getDraftTodoTasks(conversationId: string, userId: string): TodoTaskItem[] | null {
  const safeConvId = conversationId || 'default_group';
  try {
    const raw = localStorage.getItem(`${GROUP_TODO_STORAGE_PREFIX}draft_${safeConvId}_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

export function saveDraftTodoTasks(
  conversationId: string,
  userId: string,
  tasks: TodoTaskItem[]
): void {
  const safeConvId = conversationId || 'default_group';
  try {
    localStorage.setItem(
      `${GROUP_TODO_STORAGE_PREFIX}draft_${safeConvId}_${userId}`,
      JSON.stringify(tasks)
    );
  } catch {}
}

/**
 * Creates or updates a user's daily to-do list for a group and optionally broadcasts to Supabase.
 */
export async function upsertMemberDailyTodoList(
  conversationId: string,
  user: { id: string; username: string; display_name?: string; avatar_url: string },
  tasks: TodoTaskItem[],
  status: 'in_progress' | 'submitted' | 'auto_submitted' = 'in_progress',
  members?: PublicUserProfile[]
): Promise<MemberDailyTodoList[]> {
  const dateKey = getTodayDateKey();
  const existingLists = getGroupDailyTodos(conversationId, members, dateKey);
  const nowIso = new Date().toISOString();

  const updatedEntry: MemberDailyTodoList = {
    id: `todo_${conversationId}_${user.id}_${dateKey}`,
    conversation_id: conversationId,
    user_id: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    avatar_url: user.avatar_url,
    date_key: dateKey,
    tasks,
    status,
    submitted_at:
      status === 'submitted' || status === 'auto_submitted' ? nowIso : undefined,
    updated_at: nowIso,
  };

  const idx = existingLists.findIndex((item) => item.user_id === user.id);
  let nextLists: MemberDailyTodoList[];
  if (idx >= 0) {
    nextLists = [...existingLists];
    nextLists[idx] = updatedEntry;
  } else {
    nextLists = [updatedEntry, ...existingLists];
  }

  saveGroupDailyTodos(conversationId, nextLists, dateKey);

  // Sync via Supabase Realtime broadcast channel so other live group members see instant progress
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const channel = supabase.channel(`group_todos_${conversationId}`);
        channel.subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'todo_updated',
              payload: updatedEntry,
            });
          }
        });
      } catch {}
    }
  }

  return nextLists;
}

/**
 * Automatically submits any 'in_progress' to-do lists in the group when the deadline is reached.
 */
export function autoSubmitPendingGroupTodos(
  conversationId: string,
  members?: PublicUserProfile[]
): { lists: MemberDailyTodoList[]; autoSubmittedUsers: MemberDailyTodoList[] } {
  const dateKey = getTodayDateKey();
  const existing = getGroupDailyTodos(conversationId, members, dateKey);
  const nowIso = new Date().toISOString();
  const autoSubmittedUsers: MemberDailyTodoList[] = [];

  const updated = existing.map((entry) => {
    if (entry.status === 'in_progress') {
      const nextEntry: MemberDailyTodoList = {
        ...entry,
        status: 'auto_submitted',
        submitted_at: nowIso,
        updated_at: nowIso,
      };
      autoSubmittedUsers.push(nextEntry);
      return nextEntry;
    }
    return entry;
  });

  if (autoSubmittedUsers.length > 0) {
    saveGroupDailyTodos(conversationId, updated, dateKey);
  }

  return { lists: updated, autoSubmittedUsers };
}

/**
 * Formats a clean chat message summary for when a user shares or submits their To-Do list in the group.
 */
export function formatTodoSummaryMessage(
  entry: MemberDailyTodoList,
  action: 'created' | 'updated' | 'submitted' | 'auto_submitted'
): string {
  const completedCount = entry.tasks.filter((t) => t.completed).length;
  const totalCount = entry.tasks.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const header =
    action === 'created'
      ? `📋 Today's To-Do List (${completedCount}/${totalCount} · ${percent}%)`
      : action === 'submitted'
      ? `✅ Final To-Do Check-In Submitted (${completedCount}/${totalCount} · ${percent}%)`
      : action === 'auto_submitted'
      ? `🕛 12:00 Auto-Submitted To-Do Report (${completedCount}/${totalCount} · ${percent}%)`
      : `⚡ To-Do Progress Updated (${completedCount}/${totalCount} · ${percent}%)`;

  const lines = entry.tasks.map((t) => `${t.completed ? '☑️' : '⬜'} ${t.text}`);
  return `${header}\n${lines.join('\n')}`;
}
