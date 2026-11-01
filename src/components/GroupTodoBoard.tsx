import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Send,
  X,
  Sparkles,
  Users,
  Bell,
  ChevronRight,
  Check,
  AlertCircle,
} from 'lucide-react';
import { PublicUserProfile, UserProfile } from '../types';
import {
  MemberDailyTodoList,
  TodoTaskItem,
  getGroupDailyTodos,
  saveGroupDailyTodos,
  getDraftTodoTasks,
  saveDraftTodoTasks,
  upsertMemberDailyTodoList,
  autoSubmitPendingGroupTodos,
  formatTodoSummaryMessage,
  getTimeUntilDeadline,
} from '../lib/groupTodoService';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { TodoBoard } from './TodoBoard';

interface GroupTodoSectionProps {
  conversationId: string;
  groupName: string;
  profile: UserProfile;
  members?: PublicUserProfile[];
  onPostTodoChatSummary: (summaryText: string) => Promise<void>;
}

export const GroupTodoSection: React.FC<GroupTodoSectionProps> = ({
  conversationId,
  groupName,
  profile,
  members,
  onPostTodoChatSummary,
}) => {
  const [todoLists, setTodoLists] = useState<MemberDailyTodoList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'group_progress' | 'my_todo'>('group_progress');
  const [newTaskText, setNewTaskText] = useState('');
  const [draftTasks, setDraftTasks] = useState<TodoTaskItem[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  // 12:00 Check & Auto-Submit Prompt state
  const [isCheckInPromptOpen, setIsCheckInPromptOpen] = useState(false);
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState<number | null>(null);
  const [deadlineInfo, setDeadlineInfo] = useState(getTimeUntilDeadline);

  // Load initial group todos & setup realtime listener
  useEffect(() => {
    const loaded = getGroupDailyTodos(conversationId, members);
    setTodoLists(loaded);

    const myExisting = loaded.find((l) => l.user_id === profile.id);
    const savedDraft = getDraftTodoTasks(conversationId, profile.id);
    if (myExisting && myExisting.tasks.length > 0) {
      setDraftTasks(myExisting.tasks);
      saveDraftTodoTasks(conversationId, profile.id, myExisting.tasks);
    } else if (savedDraft && savedDraft.length > 0) {
      setDraftTasks(savedDraft);
    } else {
      const starter = [
        { id: `t_${Date.now()}_1`, text: 'Complete priority work tasks', completed: false },
        { id: `t_${Date.now()}_2`, text: '30 mins workout / walk', completed: false },
      ];
      setDraftTasks(starter);
      saveDraftTodoTasks(conversationId, profile.id, starter);
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        const channel = supabase
          .channel(`group_todos_${conversationId}`)
          .on('broadcast', { event: 'todo_updated' }, (payload) => {
            const incoming = payload.payload as MemberDailyTodoList;
            if (incoming && incoming.user_id) {
              setTodoLists((prev) => {
                const idx = prev.findIndex((i) => i.user_id === incoming.user_id);
                let next: MemberDailyTodoList[];
                if (idx >= 0) {
                  next = [...prev];
                  next[idx] = incoming;
                } else {
                  next = [incoming, ...prev];
                }
                saveGroupDailyTodos(conversationId, next);
                return next;
              });
            }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    }
  }, [conversationId, profile.id, members]);

  // Periodic clock check for 12:00 check-in window & midnight auto-submit
  useEffect(() => {
    const interval = setInterval(() => {
      const info = getTimeUntilDeadline();
      setDeadlineInfo(info);

      const now = new Date();
      // If it hits 23:59 (end of day) and user hasn't submitted yet, trigger auto-submit
      if (now.getHours() === 23 && now.getMinutes() === 59 && now.getSeconds() >= 50) {
        handleRunAutoSubmit();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [conversationId, todoLists]);

  // Countdown timer when the 12:00 Check-In Prompt is open; auto-submits when countdown hits 0
  useEffect(() => {
    if (!isCheckInPromptOpen || autoSubmitCountdown === null) return;

    if (autoSubmitCountdown <= 0) {
      handleRunAutoSubmit();
      setIsCheckInPromptOpen(false);
      setAutoSubmitCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setAutoSubmitCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCheckInPromptOpen, autoSubmitCountdown]);

  const myTodoList = todoLists.find((l) => l.user_id === profile.id);
  const isMyListLocked =
    myTodoList?.status === 'submitted' || myTodoList?.status === 'auto_submitted';

  const handleAddDraftTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTaskText.trim();
    if (!clean) return;
    const newItem: TodoTaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      completed: false,
    };
    const updatedTasks = [...draftTasks, newItem];
    setDraftTasks(updatedTasks);
    saveDraftTodoTasks(conversationId, profile.id, updatedTasks);
    setNewTaskText('');

    if (myTodoList && !isMyListLocked) {
      const nextLists = await upsertMemberDailyTodoList(
        conversationId,
        profile,
        updatedTasks,
        'in_progress',
        members
      );
      setTodoLists(nextLists);
    }
  };

  const handleRemoveDraftTask = async (taskId: string) => {
    const updatedTasks = draftTasks.filter((t) => t.id !== taskId);
    setDraftTasks(updatedTasks);
    saveDraftTodoTasks(conversationId, profile.id, updatedTasks);

    if (myTodoList && !isMyListLocked && updatedTasks.length > 0) {
      const nextLists = await upsertMemberDailyTodoList(
        conversationId,
        profile,
        updatedTasks,
        'in_progress',
        members
      );
      setTodoLists(nextLists);
    }
  };

  const handleToggleTask = async (targetUserId: string, taskId: string) => {
    if (targetUserId !== profile.id) return;
    if (isMyListLocked) return;

    const sourceTasks = myTodoList ? myTodoList.tasks : draftTasks;
    const updatedTasks = sourceTasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            completed: !t.completed,
            completed_at: !t.completed ? new Date().toISOString() : undefined,
          }
        : t
    );

    setDraftTasks(updatedTasks);
    saveDraftTodoTasks(conversationId, profile.id, updatedTasks);

    const nextLists = await upsertMemberDailyTodoList(
      conversationId,
      profile,
      updatedTasks,
      'in_progress',
      members
    );
    setTodoLists(nextLists);
  };

  const handleSendOrUpdateMyTodoList = async (
    submitStatus: 'in_progress' | 'submitted' = 'in_progress'
  ) => {
    if (draftTasks.length === 0 || isPosting) return;
    setIsPosting(true);

    try {
      const hadExisting = Boolean(myTodoList);
      const nextLists = await upsertMemberDailyTodoList(
        conversationId,
        profile,
        draftTasks,
        submitStatus,
        members
      );
      setTodoLists(nextLists);

      const savedMine = nextLists.find((l) => l.user_id === profile.id);
      if (savedMine) {
        const actionType =
          submitStatus === 'submitted'
            ? 'submitted'
            : hadExisting
            ? 'updated'
            : 'created';
        const summaryMsg = formatTodoSummaryMessage(savedMine, actionType);
        await onPostTodoChatSummary(summaryMsg);
      }

      setActiveTab('group_progress');
      setIsCheckInPromptOpen(false);
      setAutoSubmitCountdown(null);
    } finally {
      setIsPosting(false);
    }
  };

  // Runs automatic submission for any member (including current user) who hasn't submitted by 12:00 deadline
  const handleRunAutoSubmit = async () => {
    const { lists, autoSubmittedUsers } = autoSubmitPendingGroupTodos(conversationId, members);
    setTodoLists(lists);

    if (autoSubmittedUsers.length > 0) {
      const lines = autoSubmittedUsers.map((u) => {
        const done = u.tasks.filter((t) => t.completed).length;
        const total = u.tasks.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return `• ${u.display_name} (@${u.username}): ${done}/${total} tasks (${pct}%) [Auto-Submitted]`;
      });

      const reportText = `🕛 12:00 Daily To-Do Auto-Submit Report\nUnchecked lists were automatically submitted:\n${lines.join(
        '\n'
      )}`;
      await onPostTodoChatSummary(reportText);
    }
  };

  // Trigger the 12:00 Check & Submit prompt with a 15-second auto-submit countdown so user can test it live
  const trigger12PmCheckPrompt = () => {
    setIsModalOpen(false);
    setIsCheckInPromptOpen(true);
    setAutoSubmitCountdown(15);
  };

  // Compute group aggregate stats
  const totalMembersWithTodos = todoLists.length;

  return (
    <>
      {/* 1. Compact Live Progress Strip at the top of the Group Chat */}
      <div className="bg-white/95 border-b border-slate-100 px-4 sm:px-6 py-2 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Title & Member Progress Pills */}
          <div
            onClick={() => {
              setActiveTab('group_progress');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-[#ff3b69] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xs text-slate-900 truncate">
                  Today's Group To-Do Progress
                </span>
                <span className="text-[10px] text-slate-400 font-mono-numbers shrink-0">
                  · {totalMembersWithTodos} active
                </span>
              </div>

              {/* Mini member progress bars */}
              <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none pt-1">
                {todoLists.map((item) => {
                  const done = item.tasks.filter((t) => t.completed).length;
                  const total = item.tasks.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <div
                      key={item.user_id}
                      className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-200/70 rounded-full pl-1 pr-2 py-0.5"
                    >
                      <img
                        src={item.avatar_url}
                        alt={item.username}
                        className="w-4 h-4 rounded-full object-cover bg-white"
                      />
                      <span className="text-[10px] font-semibold text-slate-700 max-w-[64px] truncate">
                        {item.user_id === profile.id ? 'You' : item.display_name.split(' ')[0]}
                      </span>
                      <span
                        className={`text-[10px] font-mono-numbers font-bold ${
                          pct === 100
                            ? 'text-emerald-600'
                            : item.status === 'auto_submitted'
                            ? 'text-amber-600'
                            : 'text-[#ff3b69]'
                        }`}
                      >
                        {done}/{total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('my_todo');
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-[11px] flex items-center gap-1 shadow-xs hover:opacity-95 active:scale-95 transition-all whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{myTodoList ? 'My To-Do' : 'Send To-Do'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('group_progress');
                setIsModalOpen(true);
              }}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              title="View Group To-Do Board"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 12:00 Check & Auto-Submit Prompt Modal */}
      {isCheckInPromptOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-[32px] bg-white border border-slate-100 shadow-2xl overflow-hidden text-slate-800 animate-droplet-squish">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base">
                    12:00 Daily To-Do Check-In
                  </h3>
                  <p className="text-[11px] text-white/90">
                    Check your completed tasks & submit before auto-submit!
                  </p>
                </div>
              </div>

              {autoSubmitCountdown !== null && (
                <div className="px-2.5 py-1 rounded-full bg-black/25 text-white font-mono-numbers text-xs font-bold shrink-0">
                  Auto in {autoSubmitCountdown}s
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Review and check off your tasks for today. If you don't submit before the timer ends, your current progress will be <strong>automatically submitted</strong> to {groupName}.
                </span>
              </div>

              {/* Interactive Checklist for Current User */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Your Today's Tasks ({draftTasks.filter((t) => t.completed).length}/{draftTasks.length} completed)
                </label>

                {draftTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(profile.id, task.id)}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      task.completed
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        task.completed ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {task.text}
                    </span>

                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        task.completed
                          ? 'bg-emerald-500 text-white'
                          : 'border border-slate-300 bg-white'
                      }`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  disabled={isPosting}
                  onClick={() => handleSendOrUpdateMyTodoList('submitted')}
                  className="flex-1 py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Check & Submit Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCheckInPromptOpen(false);
                    setAutoSubmitCountdown(null);
                    handleRunAutoSubmit();
                  }}
                  className="py-3 px-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Auto-Submit Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Full Group Daily To-Do & Live Progress Board Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800 max-h-[90vh] animate-droplet-squish">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-50 flex items-center justify-center text-[#ff3b69]">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                    {groupName} · Today's To-Do Board
                  </h2>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#ff3b69]" />
                    <span>Auto-submits at 12:00 ({deadlineInfo.label} left)</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented Tabs + Test 12:00 Check-In Button */}
            <div className="px-4 sm:px-5 pt-3 pb-2 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('group_progress')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === 'group_progress'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Group Progress ({todoLists.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('my_todo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === 'my_todo'
                      ? 'bg-white text-[#ff3b69] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My To-Do List
                </button>
              </div>

              <button
                type="button"
                onClick={trigger12PmCheckPrompt}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-amber-800 text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Test the 12:00 Check & Auto-Submit flow right now"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600" />
                <span>Test 12:00 Check & Auto-Submit</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {activeTab === 'group_progress' ? (
                /* TAB 1: TodoBoard Component — Real-Time Member Progress Bars & Automated 12 PM Submission Tracker */
                <TodoBoard
                  groupName={groupName}
                  currentUserId={profile.id}
                  todoLists={todoLists}
                  hasCurrentUserList={Boolean(myTodoList)}
                  isCurrentUserLocked={isMyListLocked}
                  onToggleTask={handleToggleTask}
                  onOpenCreateMyTodo={() => setActiveTab('my_todo')}
                  onTrigger12PmCheckIn={trigger12PmCheckPrompt}
                  onInstantAutoSubmitAll={handleRunAutoSubmit}
                  onSubmitMyListNow={() => handleSendOrUpdateMyTodoList('submitted')}
                />
              ) : (
                /* TAB 2: CREATE / EDIT MY TODAY'S TO-DO LIST */
                <div className="space-y-4">
                  {isMyListLocked && (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Your list for today is{' '}
                          <strong>
                            {myTodoList?.status === 'auto_submitted'
                              ? 'Auto-Submitted'
                              : 'Submitted'}
                          </strong>
                          .
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          upsertMemberDailyTodoList(
                            conversationId,
                            profile,
                            draftTasks,
                            'in_progress',
                            members
                          ).then(setTodoLists)
                        }
                        className="text-[11px] font-bold text-emerald-700 underline shrink-0"
                      >
                        Re-open to edit
                      </button>
                    </div>
                  )}

                  {/* Add New Task Input */}
                  {!isMyListLocked && (
                    <form onSubmit={handleAddDraftTask} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        placeholder="Add a task for today (e.g. Finish chapter 4)..."
                        className="flex-1 py-2.5 px-4 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                      />
                      <button
                        type="submit"
                        disabled={!newTaskText.trim()}
                        className="px-4 py-2.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 transition-all shrink-0 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </form>
                  )}

                  {/* Draft Tasks List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                      <span className="font-semibold text-slate-700">
                        My Today's Tasks ({draftTasks.filter((t) => t.completed).length}/
                        {draftTasks.length} completed)
                      </span>
                      <span>Tap a task to check/uncheck</span>
                    </div>

                    {draftTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        Add at least 1 task above to share your Today's To-Do list with the group.
                      </div>
                    ) : (
                      draftTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition-all ${
                            task.completed
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : 'bg-slate-50 border-slate-200/80'
                          }`}
                        >
                          <div
                            onClick={() => handleToggleTask(profile.id, task.id)}
                            className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0"
                          >
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                task.completed
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-white border border-slate-300'
                              }`}
                            >
                              {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span
                              className={`text-xs font-medium truncate ${
                                task.completed ? 'line-through text-slate-400' : 'text-slate-800'
                              }`}
                            >
                              {task.text}
                            </span>
                          </div>

                          {!isMyListLocked && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftTask(task.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 transition-colors shrink-0"
                              title="Remove task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Send to Group / Submit Final Buttons */}
                  {!isMyListLocked && (
                    <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                      <button
                        type="button"
                        disabled={draftTasks.length === 0 || isPosting}
                        onClick={() => handleSendOrUpdateMyTodoList('in_progress')}
                        className="flex-1 py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {myTodoList ? 'Update & Share Progress in Group' : "Send Today's To-Do to Group"}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={draftTasks.length === 0 || isPosting}
                        onClick={() => handleSendOrUpdateMyTodoList('submitted')}
                        className="py-3 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Check & Final Submit</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
