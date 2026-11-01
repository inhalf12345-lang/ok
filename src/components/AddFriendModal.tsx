import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  MessageSquare,
  Check,
  Copy,
  Flame,
  Loader2,
  Users,
  ChevronLeft,
  ShieldAlert,
  Flag,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { PublicUserProfile } from '../types';
import { searchRealUsers } from '../lib/chatService';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onStartChat: (targetUser: PublicUserProfile) => void;
  onInviteBonus?: () => void;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onStartChat,
  onInviteBonus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PublicUserProfile | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setSelectedUser(null);
      setToastMessage(null);
      return;
    }
  }, [isOpen]);

  // Debounced live search against real Supabase profiles (case-insensitive)
  useEffect(() => {
    const clean = searchQuery.trim().replace(/^@+/, '');
    if (!clean) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchRealUsers(clean, currentUserId);
        setSearchResults(results);
        setHasSearched(true);
      } catch (e) {
        console.warn('Search error:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId]);

  if (!isOpen) return null;

  const inviteUrl = `${window.location.origin}`;

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    if (onInviteBonus) onInviteBonus();
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleBlockUser = (user: PublicUserProfile) => {
    setBlockedUsers((prev) => new Set(prev).add(user.id));
    showToast(`@${user.username} has been blocked.`);
  };

  const handleReportUser = (user: PublicUserProfile) => {
    showToast(`Report submitted for @${user.username}. Thank you for keeping Spark safe.`);
  };

  const isUserBlocked = (userId: string) => blockedUsers.has(userId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800 animate-droplet-squish">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            {selectedUser ? (
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors mr-1"
                title="Back to search results"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69]">
                <Search className="w-4 h-4" />
              </div>
            )}
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                {selectedUser ? 'User Profile' : 'Search Users'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {selectedUser
                  ? `@${selectedUser.username}`
                  : 'Find people by @username & start messaging'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notification Toast */}
        {toastMessage && (
          <div className="mx-4 mt-3 px-3.5 py-2 rounded-2xl bg-slate-900 text-white text-xs font-medium flex items-center gap-2 shadow-lg animate-fluid-glide">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="flex-1">{toastMessage}</span>
          </div>
        )}

        {/* VIEW 1: SELECTED USER PROFILE PREVIEW */}
        {selectedUser ? (
          <div className="p-5 flex flex-col items-center text-center space-y-4">
            {/* Avatar & Badges */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full p-[2.5px] bg-gradient-to-tr from-[#ff3b69] to-[#38bdf8] shadow-md">
                <img
                  src={selectedUser.avatar_url}
                  alt={selectedUser.username}
                  className="w-full h-full rounded-full object-cover bg-white"
                />
              </div>
              {selectedUser.id === currentUserId && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold shadow-sm whitespace-nowrap">
                  You
                </span>
              )}
            </div>

            {/* User Identity Details */}
            <div className="space-y-1 w-full">
              <h3 className="font-display font-bold text-base text-slate-900">
                {selectedUser.display_name || selectedUser.username}
              </h3>
              <p className="text-xs font-mono font-semibold text-[#ff3b69]">
                @{selectedUser.username}
              </p>

              {/* Bio Card */}
              {selectedUser.bio ? (
                <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 italic">
                  "{selectedUser.bio}"
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1 italic">
                  No bio provided yet
                </p>
              )}

              {/* Spark Streak Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 text-xs font-semibold mt-2">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>{selectedUser.streak_days || 1} day spark streak</span>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full pt-2 space-y-2">
              {selectedUser.id === currentUserId ? (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  This is your public profile. Other users can find you by your username.
                </div>
              ) : isUserBlocked(selectedUser.id) ? (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-600 font-medium">
                  This user is blocked. Unblock them to send messages.
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onStartChat(selectedUser);
                      onClose();
                    }}
                    className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Message @{selectedUser.username}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleBlockUser(selectedUser)}
                      className="py-2 px-3 rounded-full border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                      <span>Block</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReportUser(selectedUser)}
                      className="py-2 px-3 rounded-full border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5 text-slate-500" />
                      <span>Report</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* VIEW 2: SEARCH INPUT & RESULTS LIST */
          <div className="p-4 space-y-4">
            {/* Username Search Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Search by Username
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. @rahul, @arjun, neha..."
                  className="w-full py-2.5 pl-10 pr-9 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner font-mono"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-[#ff3b69] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>

            {/* Results List */}
            <div className="min-h-[160px] max-h-64 overflow-y-auto space-y-2">
              {isSearching ? (
                <div className="py-10 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#ff3b69]" />
                  <span>Searching registered users...</span>
                </div>
              ) : hasSearched && searchResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-600">No users found</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try searching another username or share your invite link.
                  </p>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const blocked = isUserBlocked(user.id);

                  return (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-100/70 cursor-pointer transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-10 h-10 rounded-full object-cover bg-white border border-slate-200"
                          />
                          {isSelf && (
                            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-white text-[9px] font-bold">
                              You
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-display font-bold text-xs text-slate-900 truncate">
                              {user.display_name || user.username}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            @{user.username}
                          </p>
                          {user.bio && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[170px] italic">
                              {user.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isSelf ? (
                          <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 text-[11px] font-semibold">
                            Profile
                          </span>
                        ) : blocked ? (
                          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-600 text-[11px] font-semibold">
                            Blocked
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartChat(user);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white text-xs font-bold flex items-center gap-1 shadow-sm hover:opacity-95 active:scale-95 transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Message</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-10 flex flex-col items-center justify-center text-xs text-slate-400 gap-1.5 text-center px-4">
                  <Users className="w-8 h-8 text-slate-300" />
                  <p className="font-medium text-slate-600">Type a username to start searching</p>
                  <p className="text-[10px] text-slate-400">
                    Supports exact match or prefix (e.g. @rahul, alex)
                  </p>
                </div>
              )}
            </div>

            {/* Share App Link */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Invite a Friend</span>
                <span className="text-[10px] text-[#ff3b69] font-bold">Share Link</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className="flex-1 py-1.5 px-3 rounded-full text-xs font-mono bg-white border border-slate-200 text-slate-600 truncate"
                />
                <button
                  onClick={handleCopyInvite}
                  className="px-3 py-1.5 rounded-full bg-[#ff3b69] text-white text-xs font-semibold flex items-center gap-1 hover:opacity-95 active:scale-95 transition-all shrink-0"
                >
                  {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedInvite ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

