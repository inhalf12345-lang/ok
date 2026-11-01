import React, { useState, useEffect } from 'react';
import { X, Clock, Heart } from 'lucide-react';
import { UserStory } from '../types';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: UserStory | null;
  onReactSpark?: (storyId: string) => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  onClose,
  story,
  onReactSpark,
}) => {
  const [progress, setProgress] = useState(0);
  const [sparkCount, setSparkCount] = useState(story?.spark_reactions || 0);
  const [reacted, setReacted] = useState(false);

  useEffect(() => {
    if (!isOpen || !story) {
      setProgress(0);
      setReacted(false);
      return;
    }

    setSparkCount(story.spark_reactions || 0);

    const interval = 50;
    const totalDuration = 7000;
    const step = (interval / totalDuration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          onClose();
          return 100;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isOpen, story, onClose]);

  if (!isOpen || !story) return null;

  const getExpiresInText = () => {
    const diffMs = new Date(story.expires_at).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m left`;
  };

  const handleFluidReaction = () => {
    if (reacted) return;
    setSparkCount((prev) => prev + 1);
    setReacted(true);

    if (onReactSpark) {
      onReactSpark(story.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm h-[82vh] rounded-[36px] bg-slate-900 border border-white/20 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Story Progress Bar */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#ff3b69] via-pink-400 to-[#38bdf8] transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Top Author Details & Close */}
        <div className="absolute top-6 left-3 right-3 z-30 flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
            <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-[#ff3b69] to-[#fb7185]">
              <img
                src={story.avatar_url}
                alt={story.username}
                className="w-full h-full rounded-full object-cover bg-white"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="font-display font-bold text-xs text-white drop-shadow block">
                {story.username}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-pink-200">
                <Clock className="w-2.5 h-2.5" />
                <span>{getExpiresInText()}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 flex items-center justify-center border border-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Media Canvas */}
        <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
          {story.media_type === 'video' ? (
            <video
              src={story.media_url}
              autoPlay
              playsInline
              loop
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={story.media_url}
              alt="Story"
              className="w-full h-full object-cover"
            />
          )}

          {story.caption && (
            <div className="absolute bottom-16 left-3 right-3 p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-medium leading-relaxed text-center">
              {story.caption}
            </div>
          )}
        </div>

        {/* Bottom Reaction Bar */}
        <div className="p-3 bg-black/60 backdrop-blur-md border-t border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-white/90 font-mono-numbers">
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
            <span>{sparkCount} reactions</span>
          </div>

          <button
            onClick={handleFluidReaction}
            disabled={reacted}
            className={`px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              reacted
                ? 'bg-white/20 text-white'
                : 'bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white hover:opacity-95'
            }`}
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{reacted ? 'Loved! (+1 🪙)' : 'Send Love (+1 🪙)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
