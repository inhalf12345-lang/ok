import React, { useState } from 'react';
import {
  X,
  Coins,
  Check,
  Flame,
  Palette,
  CircleDot,
  Cpu,
  Sun,
  Terminal,
  Moon,
  Compass,
  Zap,
  Shield,
  Crown,
  ShoppingBag,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ShopCategory, ShopItem, UserProfile } from '../types';
import { SHOP_ITEMS } from '../lib/storage';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  onDeductCoins: (amount: number) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  onDeductCoins,
}) => {
  const [activeCategory, setActiveCategory] = useState<ShopCategory>('frame');
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentItems = SHOP_ITEMS.filter((item) => item.category === activeCategory);

  const isUnlocked = (itemId: string) => {
    return (
      profile.unlocked_items.includes(itemId) ||
      itemId === 'frame_pulsar' ||
      itemId === 'theme_cosmic' ||
      itemId === 'outfit_voyager'
    );
  };

  const isEquipped = (item: ShopItem) => {
    if (item.category === 'frame') return profile.equipped_frame === item.id;
    if (item.category === 'theme') return profile.equipped_theme === item.id;
    if (item.category === 'outfit') return profile.equipped_outfit === item.id;
    return false;
  };

  const handleEquip = (item: ShopItem) => {
    const updated: UserProfile = { ...profile };
    if (item.category === 'frame') updated.equipped_frame = item.id;
    if (item.category === 'theme') updated.equipped_theme = item.id;
    if (item.category === 'outfit') updated.equipped_outfit = item.id;

    onUpdateProfile(updated);
    setPurchaseToast(`Equipped ${item.name}!`);
    setTimeout(() => setPurchaseToast(null), 2500);
  };

  const handlePurchase = (item: ShopItem) => {
    if (profile.coins < item.price) {
      setPurchaseToast(`Need ${item.price - profile.coins} more coins! Chat to earn.`);
      setTimeout(() => setPurchaseToast(null), 3000);
      return;
    }

    try {
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.6, x: 0.5 },
        colors: ['#ff3b69', '#38bdf8', '#fb7185', '#ffd700'],
      });
    } catch {}

    const updatedUnlocked = [...profile.unlocked_items, item.id];
    const updated: UserProfile = {
      ...profile,
      coins: profile.coins - item.price,
      unlocked_items: updatedUnlocked,
    };

    if (item.category === 'frame') updated.equipped_frame = item.id;
    if (item.category === 'theme') updated.equipped_theme = item.id;
    if (item.category === 'outfit') updated.equipped_outfit = item.id;

    onUpdateProfile(updated);
    onDeductCoins(item.price);
    setPurchaseToast(`Unlocked & equipped ${item.name}!`);
    setTimeout(() => setPurchaseToast(null), 2500);
  };

  const renderIcon = (name: string) => {
    switch (name) {
      case 'CircleDot':
        return <CircleDot className="w-5 h-5 text-[#ff3b69]" />;
      case 'Flame':
        return <Flame className="w-5 h-5 text-rose-500" />;
      case 'Cpu':
        return <Cpu className="w-5 h-5 text-teal-500" />;
      case 'Palette':
        return <Palette className="w-5 h-5 text-indigo-500" />;
      case 'Sun':
        return <Sun className="w-5 h-5 text-amber-500" />;
      case 'Terminal':
        return <Terminal className="w-5 h-5 text-emerald-500" />;
      case 'Moon':
        return <Moon className="w-5 h-5 text-purple-500" />;
      case 'Compass':
        return <Compass className="w-5 h-5 text-sky-500" />;
      case 'Zap':
        return <Zap className="w-5 h-5 text-rose-500" />;
      case 'Shield':
        return <Shield className="w-5 h-5 text-amber-500" />;
      case 'Crown':
        return <Crown className="w-5 h-5 text-pink-500" />;
      default:
        return <ShoppingBag className="w-5 h-5 text-[#ff3b69]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                Rewards Boutique
              </h2>
              <p className="text-[11px] text-slate-500">Customize your look with earned coins</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono-numbers">{profile.coins.toLocaleString()}</span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveCategory('frame')}
            className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeCategory === 'frame'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Frames</span>
          </button>

          <button
            onClick={() => setActiveCategory('theme')}
            className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeCategory === 'theme'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Themes</span>
          </button>

          <button
            onClick={() => setActiveCategory('outfit')}
            className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeCategory === 'outfit'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Styles</span>
          </button>
        </div>

        {purchaseToast && (
          <div className="p-2.5 bg-rose-50 border-b border-rose-100 text-center text-xs font-bold text-[#ff3b69]">
            {purchaseToast}
          </div>
        )}

        {/* Catalog */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[55vh]">
          {currentItems.map((item) => {
            const unlocked = isUnlocked(item.id);
            const equipped = isEquipped(item);

            return (
              <div
                key={item.id}
                className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  equipped
                    ? 'border-[#ff3b69] bg-rose-50/40 shadow-xs'
                    : unlocked
                    ? 'border-slate-200 bg-white hover:bg-slate-50'
                    : 'border-slate-100 bg-slate-50/60 opacity-80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center p-2 shrink-0">
                    {renderIcon(item.icon_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-display font-bold text-xs text-slate-900">{item.name}</h4>
                      {item.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-100 text-[#ff3b69] font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-numbers text-xs font-bold text-amber-600">
                    {item.price === 0 ? 'FREE' : `${item.price} 🪙`}
                  </span>

                  {equipped ? (
                    <div className="px-2.5 py-1 rounded-full bg-rose-100 text-[#ff3b69] text-xs font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Used</span>
                    </div>
                  ) : unlocked ? (
                    <button
                      onClick={() => handleEquip(item)}
                      className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all active:scale-95"
                    >
                      Equip
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchase(item)}
                      className="px-3 py-1 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white text-xs font-bold shadow-xs hover:opacity-95 active:scale-95 transition-all"
                    >
                      Unlock
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 text-center">
          Earn coins by holding streaks, sending messages, and completing daily flow quests!
        </div>
      </div>
    </div>
  );
};
