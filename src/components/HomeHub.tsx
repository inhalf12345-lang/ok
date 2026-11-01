import React, { useState } from 'react';
import {
  Search,
  Plus,
  Flame,
  MessageSquare,
  Video,
  ShoppingBag,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  Trophy,
  UserPlus,
  Loader2,
  Users,
} from 'lucide-react';
import { DailyQuest, RealConversation, UserProfile, UserStory } from '../types';

interface HomeHubProps {
  profile: UserProfile;
  conversations: RealConversation[];
  isLoadingConversations?: boolean;
  quests: DailyQuest[];
  stories: UserStory[];
  onSelectConversation: (conversation: RealConversation, coords?: { x: number; y: number }) => void;
  onOpenAddFriend: () => void;
  onOpenProfile: () => void;
  onOpenShop: () => void;
  onOpenLeaderboard: () => void;
  onOpenCreateStory: () => void;
  onViewStory: (story: UserStory) => void;
  onClaimQuest: (questId: string) => void;
  onOpenCreateGroup?: () => void;
}

export const HomeHub: React.FC<HomeHubProps> = ({
  profile,
  conversations,
  isLoadingConversations = false,
  quests,
  stories,
  onSelectConversation,
  onOpenAddFriend,
  onOpenProfile,
  onOpenShop,
  onOpenLeaderboard,
  onOpenCreateStory,
  onViewStory,
  onClaimQuest,
  onOpenCreateGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'stories' | 'quests' | 'shop'>('chats');
  const [isQuestsExpanded, setIsQuestsExpanded] = useState(false);

  const filteredConversations = conversations.filter((c) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    if (c.is_group) {
      return (
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.last_message && c.last_message.content.toLowerCase().includes(query))
      );
    }
    return (
      c.other_user.username.toLowerCase().includes(query) ||
      (c.other_user.display_name && c.other_user.display_name.toLowerCase().includes(query)) ||
      (c.last_message && c.last_message.content.toLowerCase().includes(query))
    );
  });

  const claimableQuests = quests.filter((q) => q.progress >= q.goal && !q.completed);
  const unreadCount = conversations.filter((c) => c.has_unread).length;

  const handleRowClick = (
    e: React.MouseEvent<HTMLDivElement>,
    conv: RealConversation
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || rect.left + rect.width / 2;
    const y = e.clientY || rect.top + rect.height / 2;
    onSelectConversation(conv, { x, y });
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Yesterday';
      return `${days}d`;
    } catch {
      return '';
    }
  };

  return (
    <div className="relative w-full flex flex-col flex-1 pb-24 bg-white/95 text-slate-800">
      <div className="max-w-4xl mx-auto w-full">
        {/* 1. Header & Search Row matching reference */}
        <div className="px-5 sm:px-8 pt-4 pb-3">
          {/* Title & Profile in reference style */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display font-black text-2xl tracking-tight text-slate-900">
              Messages
            </h1>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenLeaderboard}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
                title="Weekly Leaderboard"
              >
                <Trophy className="w-4 h-4 text-purple-500" />
              </button>
              <button
                onClick={onOpenProfile}
                className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-[#ff3b69] to-[#38bdf8] shadow-sm transition-transform active:scale-95"
                title="Profile"
              >
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="w-full h-full rounded-full object-cover bg-white"
                  referrerPolicy="no-referrer"
                />
              </button>
            </div>
          </div>

          {/* Light search field & Compact Find Someone button */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full py-2.5 pl-10 pr-4 rounded-full text-xs bg-slate-100/70 border border-slate-200/60 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69]/60 focus:bg-white transition-all shadow-inner"
              />
            </div>

            {onOpenCreateGroup && (
              <button
                onClick={onOpenCreateGroup}
                className="h-10 px-3.5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200/70 text-[#ff3b69] text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 whitespace-nowrap"
                title="Create Group Chat"
              >
                <Users className="w-4 h-4 text-[#ff3b69]" />
                <span>New Group</span>
              </button>
            )}

            <button
              onClick={onOpenAddFriend}
              className="h-10 px-3.5 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-pink-500/20 hover:opacity-95 active:scale-95 transition-all shrink-0"
              title="Search by Username & Start Chat"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Find Users</span>
            </button>
          </div>
        </div>

        {/* 2. Stories Row (Only Real stories from current user or friends) */}
        <div className="px-5 sm:px-8 py-2 overflow-x-auto scrollbar-none flex items-center gap-3.5">
          {/* Add story button */}
          <div
            onClick={onOpenCreateStory}
            className="flex flex-col items-center gap-1 cursor-pointer shrink-0 group"
          >
            <div className="relative w-14 h-14 rounded-full p-[2px] bg-slate-100 border border-dashed border-[#ff3b69]/40 flex items-center justify-center transition-transform group-hover:scale-105 active:scale-95">
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-full h-full rounded-full object-cover bg-white opacity-85"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#ff3b69] text-white flex items-center justify-center border-2 border-white shadow-xs">
                <Plus className="w-3 h-3 stroke-[3]" />
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-600 max-w-[64px] truncate">
              Your story
            </span>
          </div>

          {/* Real stories list */}
          {stories.map((story) => (
            <div
              key={story.id}
              onClick={() => onViewStory(story)}
              className="flex flex-col items-center gap-1 cursor-pointer shrink-0 group"
            >
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-[#ff3b69] via-[#fb7185] to-[#f472b6] shadow-xs transition-transform group-hover:scale-105 active:scale-95">
                <img
                  src={story.avatar_url}
                  alt={story.username}
                  className="w-full h-full rounded-full object-cover bg-white"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-[11px] font-medium text-slate-700 max-w-[64px] truncate">
                {story.username}
              </span>
            </div>
          ))}
        </div>

        {/* 3. Compact Daily Flow bar */}
        <div className="px-5 sm:px-8 pt-2 pb-1">
          <div
            onClick={() => setIsQuestsExpanded(!isQuestsExpanded)}
            className="p-3 rounded-2xl bg-slate-50/80 hover:bg-slate-100/80 border border-slate-100 flex items-center justify-between cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69]">
                <Flame className="w-4 h-4 fill-[#ff3b69]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-xs text-slate-900">
                    Daily Spark Flow
                  </span>
                  <span className="font-mono-numbers text-[11px] font-semibold text-amber-600">
                    +{profile.daily_coins_earned} 🪙
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {claimableQuests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold animate-pulse">
                  {claimableQuests.length} Claimable!
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isQuestsExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>

          {/* Expandable Quest Tasks */}
          {isQuestsExpanded && (
            <div className="mt-2 p-3 bg-white rounded-2xl border border-slate-100 space-y-2 shadow-sm">
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  onClick={() => {
                    if (quest.progress >= quest.goal && !quest.completed) {
                      onClaimQuest(quest.id);
                    }
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    quest.completed
                      ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800'
                      : quest.progress >= quest.goal
                      ? 'bg-rose-50 border-rose-200 text-rose-900 cursor-pointer animate-pulse'
                      : 'bg-slate-50/60 border-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold truncate">{quest.title}</span>
                      <span className="font-bold text-amber-600 font-mono-numbers">
                        +{quest.reward_coins} 🪙
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          quest.completed
                            ? 'bg-emerald-400'
                            : 'bg-gradient-to-r from-[#ff3b69] via-purple-400 to-[#38bdf8]'
                        }`}
                        style={{
                          width: `${Math.min(100, (quest.progress / quest.goal) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    {quest.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : quest.progress >= quest.goal ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClaimQuest(quest.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#ff3b69] text-white font-bold text-xs shadow-sm hover:opacity-95"
                      >
                        Claim!
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono-numbers text-slate-400">
                        {quest.progress}/{quest.goal}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Real Chat List */}
        <div className="px-5 sm:px-8 pt-3 flex-1 flex flex-col">
          {isLoadingConversations ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#ff3b69]" />
              <span>Loading your conversations...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            /* Empty State: exactly as required by specification */
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69] mb-3 shadow-inner">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="font-display font-bold text-base text-slate-800 mb-1">
                No conversations yet
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mb-5 leading-relaxed">
                Connect with another user on Spark by searching their unique @username.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  onClick={onOpenAddFriend}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-pink-500/20 hover:opacity-95 active:scale-95 transition-all whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Find someone</span>
                </button>
                {onOpenCreateGroup && (
                  <button
                    onClick={onOpenCreateGroup}
                    className="px-5 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[#ff3b69] font-bold text-xs flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"
                  >
                    <Users className="w-4 h-4" />
                    <span>Create Group</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/80">
              {filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={(e) => handleRowClick(e, conv)}
                  className="py-3.5 flex items-center justify-between gap-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/80 rounded-2xl px-2 transition-colors"
                >
                  {/* Left: Avatar with online/group status */}
                  <div className="relative shrink-0">
                    <div className="w-13 h-13 rounded-full p-[1.5px] bg-slate-200">
                      <img
                        src={conv.avatar_url || conv.other_user.avatar_url}
                        alt={conv.name || conv.other_user.username}
                        className="w-full h-full rounded-full object-cover bg-white"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {conv.is_group ? (
                      <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#ff3b69] border-2 border-white flex items-center justify-center text-white">
                        <Users className="w-2.5 h-2.5" />
                      </span>
                    ) : conv.other_user.is_online ? (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
                    ) : null}
                  </div>

                  {/* Middle: Name & Latest message */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-display font-bold text-sm tracking-tight text-slate-900 truncate">
                          {conv.is_group
                            ? conv.name || 'Group Chat'
                            : conv.other_user.display_name || conv.other_user.username}
                        </span>
                        {conv.is_group ? (
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">
                            {conv.member_count || conv.members?.length || 2} members
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono shrink-0">
                            @{conv.other_user.username}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium shrink-0">
                        {formatRelativeTime(conv.last_message?.created_at || conv.updated_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-slate-500 truncate leading-snug">
                        {conv.last_message?.media_url ? (
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            <span>📷 Photo</span>
                            {conv.last_message.content && (
                              <span className="text-slate-400 font-normal">
                                · {conv.last_message.content}
                              </span>
                            )}
                          </span>
                        ) : conv.last_message ? (
                          conv.last_message.content
                        ) : (
                          'Tap to start chatting...'
                        )}
                      </p>
                      {conv.has_unread && (
                        <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[#ff3b69]" />
                      )}
                    </div>
                  </div>

                  {/* Right: Flame streak or Group badge */}
                  {conv.is_group ? (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 shrink-0">
                      <Users className="w-3.5 h-3.5 text-[#ff3b69]" />
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-0.5 text-xs font-bold text-rose-500 shrink-0"
                      title={`${conv.other_user.streak_days || 1} days streak`}
                    >
                      <Flame className="w-3.5 h-3.5 fill-rose-500" />
                      <span className="font-mono-numbers">{conv.other_user.streak_days || 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Bottom Navigation Bar */}
      <div className="fixed bottom-3 left-4 right-4 max-w-md mx-auto z-30">
        <nav
          className="w-full h-15 rounded-full bg-gradient-to-r from-[#ff3b69] via-[#fb7185] to-[#f43f5e] shadow-xl shadow-rose-500/35 px-4 flex items-center justify-around text-white"
          aria-label="Bottom Navigation"
        >
          {/* Chats Tab */}
          <button
            onClick={() => setActiveTab('chats')}
            className={`relative flex flex-col items-center justify-center p-2 rounded-full transition-transform active:scale-95 ${
              activeTab === 'chats' ? 'opacity-100' : 'opacity-80 hover:opacity-100'
            }`}
            title="Chats"
          >
            <MessageSquare className="w-5 h-5 fill-white/20 stroke-[2.2]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-white text-[#ff3b69] text-[9px] font-black shadow-sm">
                +{unreadCount}
              </span>
            )}
          </button>

          {/* Stories / Camera Tab */}
          <button
            onClick={onOpenCreateStory}
            className="p-2 rounded-full opacity-80 hover:opacity-100 transition-opacity active:scale-95"
            title="Create Story"
          >
            <Video className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Center Plus Button (Directly opens real user search!) */}
          <button
            onClick={onOpenAddFriend}
            className="w-11 h-11 rounded-full bg-white text-[#ff3b69] flex items-center justify-center shadow-md shadow-black/15 transition-transform hover:scale-105 active:scale-90 -mt-5 border-2 border-[#ff3b69]/20"
            title="Search by Username & Start New Chat"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>

          {/* Daily Quests Tab */}
          <button
            onClick={() => setIsQuestsExpanded(!isQuestsExpanded)}
            className="p-2 rounded-full opacity-80 hover:opacity-100 transition-opacity active:scale-95"
            title="Daily Quests"
          >
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Shop Tab */}
          <button
            onClick={onOpenShop}
            className="p-2 rounded-full opacity-80 hover:opacity-100 transition-opacity active:scale-95"
            title="Rewards Shop"
          >
            <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
          </button>
        </nav>
      </div>
    </div>
  );
};
