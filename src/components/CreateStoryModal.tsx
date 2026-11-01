import React, { useState, useRef } from 'react';
import { X, Upload, AlertCircle, Camera, Check } from 'lucide-react';
import { UserProfile, UserStory } from '../types';
import { compressImageFile } from '../lib/storage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onStoryCreated: (story: UserStory) => void;
}

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  isOpen,
  onClose,
  profile,
  onStoryCreated,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.src = url;
        tempVideo.onloadedmetadata = () => {
          if (tempVideo.duration > 11) {
            setErrorMsg('Video exceeds 10 seconds! Please select a clip of 10s or shorter.');
            setIsProcessing(false);
            return;
          }
          setSelectedFile(file);
          setPreviewUrl(url);
          setMediaType('video');
          setIsProcessing(false);
        };
      } else if (file.type.startsWith('image/')) {
        const compressedBase64 = await compressImageFile(file);
        setSelectedFile(file);
        setPreviewUrl(compressedBase64);
        setMediaType('image');
        setIsProcessing(false);
      } else {
        setErrorMsg('Please upload a valid image or video file.');
        setIsProcessing(false);
      }
    } catch (err: any) {
      setErrorMsg('Failed to process media: ' + (err?.message || 'Unknown error'));
      setIsProcessing(false);
    }
  };

  const handlePublishStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewUrl) {
      setErrorMsg('Please select a photo or clip first.');
      return;
    }

    setIsProcessing(true);
    let finalMediaUrl = previewUrl;

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase && selectedFile) {
        try {
          const ext = selectedFile.name.split('.').pop() || 'jpg';
          const fileName = `${profile.id}/${Date.now()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('stories')
            .upload(fileName, selectedFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicData } = supabase.storage
              .from('stories')
              .getPublicUrl(fileName);

            if (publicData?.publicUrl) {
              finalMediaUrl = publicData.publicUrl;
            }
          }
        } catch (storageErr) {
          console.warn('Supabase storage upload fallback:', storageErr);
        }
      }
    }

    const now = Date.now();
    const newStory: UserStory = {
      id: 'story_user_' + now,
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      media_url: finalMediaUrl,
      media_type: mediaType,
      caption: caption.trim() || undefined,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      spark_reactions: 0,
    };

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        supabase
          .from('stories')
          .insert({
            user_id: profile.id,
            media_url: finalMediaUrl,
            media_type: mediaType,
            caption: caption.trim() || null,
          })
          .then();
      }
    }

    onStoryCreated(newStory);
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69]">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">
                Add 24h Story
              </h2>
              <p className="text-[11px] text-slate-500">Auto-expires after 24 hours</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border-b border-rose-100 text-xs text-[#ff3b69] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handlePublishStory} className="p-4 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {previewUrl ? (
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center group">
              {mediaType === 'video' ? (
                <video src={previewUrl} autoPlay playsInline loop muted className="w-full h-full object-cover" />
              ) : (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setSelectedFile(null);
                }}
                className="absolute top-2 right-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md text-slate-800 text-xs font-semibold hover:bg-white shadow-sm transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 hover:bg-rose-50/40 hover:border-[#ff3b69]/40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-[#ff3b69]" />
              <div className="text-center">
                <span className="text-xs font-bold text-slate-700 block">
                  Select Photo or Video
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Max 10s video clip · Auto-compressed
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a moment caption..."
              className="w-full py-2.5 px-3.5 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={!previewUrl || isProcessing}
            className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-pink-500/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
          >
            <span>{isProcessing ? 'Publishing...' : 'Share Story (24h)'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
