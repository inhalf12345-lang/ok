import React from 'react';
import { X, Trophy, Flame, Crown, Medal, Timer } from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { getTimeUntilNextMonday } from '../lib/storage';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  entries,
}) => {
  if (!isOpen) return null;

  const timeRemaining = getTimeUntilNextMonday();

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 font-bold text-xs shadow-xs">
            <Crown className="w-3.5 h-3.5 fill-current" />
          </div>
        );
      case 2:
        return (
          <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-800 font-bold text-xs shadow-xs">
            <Medal className="w-3.5 h-3.5 fill-current" />
          </div>
        );
      case 3:
        return (
          <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
            <Medal className="w-3.5 h-3.5 fill-current" />
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-mono-numbers text-xs font-bold text-slate-500">
            {rank}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                Weekly Leaderboard
              </h2>
              <p className="text-[11px] text-slate-500">Top active conversationalists</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Weekly Countdown Bar */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-[#ff3b69]" />
            <span>Cycle resets Monday</span>
          </div>
          <span className="font-mono-numbers text-slate-700 font-bold">{timeRemaining}</span>
        </div>

        {/* Podium Top 3 */}
        {entries.length >= 3 && (
          <div className="p-4 border-b border-slate-100 grid grid-cols-3 gap-2 text-center bg-slate-50/50">
            {/* Rank 2 */}
            <div className="flex flex-col items-center justify-end">
              <div className="relative mb-1.5">
                <img
                  src={entries[1].avatar_url}
                  alt={entries[1].username}
                  className="w-12 h-12 rounded-full object-cover bg-white border-2 border-slate-300"
                />
                <div className="absolute -bottom-1 -right-1">{getRankBadge(2)}</div>
              </div>
              <span className="text-xs font-bold text-slate-800 truncate max-w-[80px]">
                {entries[1].username}
              </span>
              <span className="font-mono-numbers text-[10px] text-amber-600 font-bold">
                {entries[1].weekly_coins} 🪙
              </span>
            </div>

            {/* Rank 1 */}
            <div className="flex flex-col items-center justify-end -mt-2">
              <div className="relative mb-1.5">
                <img
                  src={entries[0].avatar_url}
                  alt={entries[0].username}
                  className="w-14 h-14 rounded-full object-cover bg-white border-2 border-amber-400 shadow-xs"
                />
                <div className="absolute -bottom-1 -right-1">{getRankBadge(1)}</div>
              </div>
              <span className="text-xs font-extrabold text-slate-900 truncate max-w-[90px]">
                {entries[0].username}
              </span>
              <span className="font-mono-numbers text-xs text-amber-600 font-black">
                {entries[0].weekly_coins} 🪙
              </span>
            </div>

            {/* Rank 3 */}
            <div className="flex flex-col items-center justify-end">
              <div className="relative mb-1.5">
                <img
                  src={entries[2].avatar_url}
                  alt={entries[2].username}
                  className="w-12 h-12 rounded-full object-cover bg-white border-2 border-amber-600"
                />
                <div className="absolute -bottom-1 -right-1">{getRankBadge(3)}</div>
              </div>
              <span className="text-xs font-bold text-slate-800 truncate max-w-[80px]">
                {entries[2].username}
              </span>
              <span className="font-mono-numbers text-[10px] text-amber-600 font-bold">
                {entries[2].weekly_coins} 🪙
              </span>
            </div>
          </div>
        )}

        {/* List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1 max-h-[44vh]">
          {entries.map((entry) => (
            <div
              key={entry.user_id}
              className={`p-2.5 rounded-2xl flex items-center justify-between gap-2.5 transition-colors ${
                entry.is_current_user
                  ? 'bg-rose-50/80 border border-rose-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="shrink-0">{getRankBadge(entry.rank)}</div>
                <img
                  src={entry.avatar_url}
                  alt={entry.username}
                  className="w-9 h-9 rounded-full object-cover bg-slate-100"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900 truncate max-w-[120px]">
                      {entry.username}
                    </span>
                    {entry.is_current_user && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#ff3b69] text-white font-bold">
                        YOU
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Flame className="w-3 h-3 text-rose-500 fill-rose-500" />
                    <span>{entry.streak_days}d streak</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono-numbers text-xs font-bold text-amber-600">
                  {entry.weekly_coins} 🪙
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
