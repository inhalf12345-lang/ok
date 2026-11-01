import React from 'react';
import { Flame, Coins, Database, ShieldCheck, LogOut } from 'lucide-react';
import { UserProfile } from '../types';

interface TopNavProps {
  profile: UserProfile;
  isSupabaseConnected: boolean;
  onOpenSupabaseGuide: () => void;
  onOpenProfile: () => void;
  onOpenShop: () => void;
  onOpenLeaderboard: () => void;
  onSignOut?: () => void;
  animatingCoins?: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  profile,
  isSupabaseConnected,
  onOpenSupabaseGuide,
  onOpenProfile,
  onOpenShop,
  onOpenLeaderboard,
  onSignOut,
  animatingCoins = false,
}) => {
  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-100/80 px-4 sm:px-6 py-3 transition-colors">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Spark Logo & Name */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ff3b69] to-[#fb7185] flex items-center justify-center text-white shadow-sm shadow-pink-500/25">
            <span className="text-sm font-black">⚡</span>
          </div>
          <span className="font-display font-extrabold text-lg tracking-tight text-slate-900">
            Spark
          </span>
        </div>

        {/* Center / Right: Streak, Coins & Profile Avatar */}
        <div className="flex items-center gap-2">
          {/* Flame streak */}
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-xs font-bold"
            title={`${profile.streak_days} Day Streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span className="font-mono-numbers">{profile.streak_days}d</span>
          </div>

          {/* Coins counter */}
          <button
            onClick={onOpenShop}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 ${
              animatingCoins
                ? 'scale-105 bg-amber-400 text-slate-900 shadow-md'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
            title="Coins Balance - Tap for Rewards"
          >
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-mono-numbers">{profile.coins.toLocaleString()}</span>
          </button>

          {/* Supabase status icon */}
          <button
            onClick={onOpenSupabaseGuide}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isSupabaseConnected
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-sky-50 text-sky-600'
            }`}
            title={isSupabaseConnected ? 'Supabase Connected' : 'Connect Supabase'}
          >
            {isSupabaseConnected ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Profile Avatar */}
          <button
            onClick={onOpenProfile}
            className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-[#ff3b69] via-purple-400 to-[#38bdf8] transition-transform active:scale-95 shadow-sm"
            title={`${profile.display_name || profile.username} - View Account`}
          >
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-full h-full rounded-full object-cover bg-white"
              referrerPolicy="no-referrer"
            />
          </button>

          {/* Sign Out Button */}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-7 h-7 rounded-full hover:bg-rose-50 text-slate-400 hover:text-[#ff3b69] flex items-center justify-center transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
