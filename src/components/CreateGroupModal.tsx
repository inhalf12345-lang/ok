import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Search,
  Check,
  Plus,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import { PublicUserProfile, RealConversation } from '../types';
import { searchRealUsers, createRealGroupConversation } from '../lib/chatService';
import { DEFAULT_TEST_GROUP_MEMBERS } from '../lib/storage';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  existingConversations?: RealConversation[];
  onGroupCreated: (conversationId: string) => void;
}

const GROUP_AVATAR_PRESETS = [
  'SparkSquad',
  'CosmicCrew',
  'NeonOrbit',
  'AlphaTeam',
  'NightOwls',
  'HyperLoop',
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  existingConversations = [],
  onGroupCreated,
}) => {
  const [groupName, setGroupName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('SparkSquad');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<PublicUserProfile[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract unique 1-on-1 contacts from existing conversations + 4 ready test contacts for quick selection
  const recentContacts: PublicUserProfile[] = React.useMemo(() => {
    const map = new Map<string, PublicUserProfile>();
    for (const conv of existingConversations) {
      if (!conv.is_group && conv.other_user && conv.other_user.id !== currentUserId) {
        map.set(conv.other_user.id, {
          id: conv.other_user.id,
          username: conv.other_user.username,
          display_name: conv.other_user.display_name || conv.other_user.username,
          avatar_url: conv.other_user.avatar_url,
          streak_days: conv.other_user.streak_days || 1,
        });
      }
    }
    for (const member of DEFAULT_TEST_GROUP_MEMBERS) {
      if (!map.has(member.id)) {
        map.set(member.id, member);
      }
    }
    return Array.from(map.values());
  }, [existingConversations, currentUserId]);

  useEffect(() => {
    if (!isOpen) {
      setGroupName('');
      setAvatarSeed('SparkSquad');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedMembers([]);
      setIsCreating(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Debounced live user search
  useEffect(() => {
    const clean = searchQuery.trim().replace(/^@+/, '');
    if (!clean) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchRealUsers(clean, currentUserId);
        setSearchResults(results.filter((u) => u.id !== currentUserId));
      } catch (err) {
        console.warn('Error searching users for group:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId]);

  if (!isOpen) return null;

  const groupAvatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
    avatarSeed || groupName || 'SparkGroup'
  )}&backgroundColor=ffe4e6`;

  const toggleMember = (user: PublicUserProfile) => {
    setErrorMsg(null);
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m.id === user.id);
      if (exists) {
        return prev.filter((m) => m.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const handleRandomizeAvatar = () => {
    const nextSeed = 'group_' + Math.random().toString(36).substring(2, 8);
    setAvatarSeed(nextSeed);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = groupName.trim();
    if (trimmedName.length < 2) {
      setErrorMsg('Please enter a group name (at least 2 characters).');
      return;
    }

    if (selectedMembers.length === 0) {
      setErrorMsg('Please select at least 1 member to create a group.');
      return;
    }

    setIsCreating(true);
    try {
      const memberIds = selectedMembers.map((m) => m.id);
      const newConvId = await createRealGroupConversation(
        currentUserId,
        trimmedName,
        memberIds,
        groupAvatarUrl,
        selectedMembers
      );
      onGroupCreated(newConvId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const displayList = searchQuery.trim() ? searchResults : recentContacts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800 animate-droplet-squish max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                Create Group Chat
              </h2>
              <p className="text-[11px] text-slate-500">
                Name your group & invite members by @username
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreateGroup} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-2 text-xs text-[#ff3b69]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Avatar + Name Row */}
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="w-15 h-15 rounded-2xl p-[2px] bg-gradient-to-tr from-[#ff3b69] to-[#38bdf8] shadow-sm">
                <img
                  src={groupAvatarUrl}
                  alt="Group Avatar"
                  className="w-full h-full rounded-[14px] object-cover bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleRandomizeAvatar}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#ff3b69] text-white flex items-center justify-center shadow-xs hover:opacity-90"
                title="Randomize Group Icon"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Group Name <span className="text-[#ff3b69]">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={40}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Weekend Squad, Design Team..."
                className="w-full py-2.5 px-4 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Preset Icon Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[10px] font-semibold text-slate-400 mr-1 shrink-0">
              Icon style:
            </span>
            {GROUP_AVATAR_PRESETS.map((seed) => (
              <button
                key={seed}
                type="button"
                onClick={() => setAvatarSeed(seed)}
                className={`w-7 h-7 rounded-lg p-0.5 border transition-all shrink-0 ${
                  avatarSeed === seed
                    ? 'border-[#ff3b69] scale-105 bg-rose-50'
                    : 'border-slate-200 opacity-75 hover:opacity-100'
                }`}
              >
                <img
                  src={`https://api.dicebear.com/7.x/identicon/svg?seed=${seed}&backgroundColor=ffe4e6`}
                  alt={seed}
                  className="w-full h-full rounded-md object-cover"
                />
              </button>
            ))}
          </div>

          {/* Selected Members Chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">
                Selected Members ({selectedMembers.length})
              </label>
              {selectedMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMembers([])}
                  className="text-[11px] text-slate-400 hover:text-rose-500 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedMembers.length === 0 ? (
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-400 text-center">
                Search and tap users below to add them to this group
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-rose-50/40 border border-rose-100 max-h-24 overflow-y-auto">
                {selectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-white border border-rose-200/80 text-xs font-medium text-slate-800 shadow-2xs"
                  >
                    <img
                      src={member.avatar_url}
                      alt={member.username}
                      className="w-4 h-4 rounded-full object-cover bg-slate-100"
                    />
                    <span className="text-[11px] font-mono font-semibold text-slate-700">
                      @{member.username}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMember(member)}
                      className="text-slate-400 hover:text-[#ff3b69] transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search Users Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600">
              Add Members by @username
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search @username or name..."
                className="w-full py-2.5 pl-10 pr-9 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner font-mono"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-[#ff3b69] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* User Results / Recent Contacts List */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>
                {searchQuery.trim() ? 'Search Results' : 'Suggested Contacts'}
              </span>
            </div>

            <div className="min-h-[140px] max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
              {isSearching ? (
                <div className="py-8 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#ff3b69]" />
                  <span>Finding users...</span>
                </div>
              ) : displayList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 px-4">
                  <UserPlus className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="font-medium text-slate-600">
                    {searchQuery.trim()
                      ? 'No matching users found'
                      : 'Type a @username above to search users'}
                  </p>
                </div>
              ) : (
                displayList.map((user) => {
                  const isSelected = selectedMembers.some((m) => m.id === user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleMember(user)}
                      className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-rose-50/70 border-[#ff3b69]/40'
                          : 'bg-slate-50/80 border-slate-100 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={user.avatar_url}
                          alt={user.username}
                          className="w-9 h-9 rounded-full object-cover bg-white border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-xs text-slate-900 truncate">
                            {user.display_name || user.username}
                          </h4>
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            @{user.username}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-[#ff3b69] text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-400'
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isCreating || !groupName.trim() || selectedMembers.length === 0}
            className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Group...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  Create Group ({selectedMembers.length + 1} members)
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
