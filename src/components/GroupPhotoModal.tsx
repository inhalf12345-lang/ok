import React, { useRef, useState, useEffect } from 'react';
import { Camera, Image as ImageIcon, Send, X, Loader2, Sparkles } from 'lucide-react';
import { compressImageFile } from '../lib/storage';

interface GroupPhotoModalProps {
  groupName: string;
  isSending: boolean;
  onSendPhoto: (file: File, caption: string, compressedDataUrl?: string) => Promise<void>;
}

export const GroupPhotoButtonAndModal: React.FC<GroupPhotoModalProps> = ({
  groupName,
  isSending,
  onSendPhoto,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setShowMenu(false);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB.');
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCaption('');
  };

  const handleClosePreview = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setError(null);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleConfirmSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isSending) return;

    try {
      let compressed: string | undefined;
      try {
        compressed = await compressImageFile(selectedFile);
      } catch {
        compressed = undefined;
      }
      await onSendPhoto(selectedFile, caption.trim(), compressed);
      handleClosePreview();
    } catch (err: any) {
      setError(err?.message || 'Failed to send photo.');
    }
  };

  return (
    <>
      {/* Hidden inputs for Gallery and Camera */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Group-Only Attachment Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="w-9 h-9 rounded-full bg-rose-50 text-[#ff3b69] flex items-center justify-center hover:bg-rose-100 active:scale-90 transition-all shrink-0"
          title="Send Picture to Group"
        >
          <Camera className="w-4 h-4" />
        </button>

        {/* Quick WhatsApp-style Picker Popover (Camera vs Gallery) */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute bottom-12 left-0 z-40 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 min-w-[160px] animate-fluid-glide">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-50 text-xs font-semibold text-slate-700 hover:text-[#ff3b69] transition-colors text-left whitespace-nowrap"
              >
                <div className="w-7 h-7 rounded-full bg-rose-100 text-[#ff3b69] flex items-center justify-center shrink-0">
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>
                <span>Photo Gallery</span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-50 text-xs font-semibold text-slate-700 hover:text-[#ff3b69] transition-colors text-left whitespace-nowrap"
              >
                <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <span>Take Photo</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* WhatsApp-Style Full-Screen Photo Preview & Caption Composer */}
      {selectedFile && previewUrl && (
        <div className="fixed inset-0 z-60 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-4 text-white">
          {/* Top Bar */}
          <div className="max-w-3xl w-full mx-auto flex items-center justify-between py-2">
            <button
              type="button"
              onClick={handleClosePreview}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <p className="text-xs font-bold text-white">{groupName}</p>
              <p className="text-[10px] text-slate-400">Preview Group Photo</p>
            </div>

            <div className="w-9" />
          </div>

          {error && (
            <div className="max-w-md mx-auto px-4 py-2 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs text-center">
              {error}
            </div>
          )}

          {/* Center Image Preview */}
          <div className="flex-1 flex items-center justify-center overflow-hidden my-3">
            <img
              src={previewUrl}
              alt="Preview before sending"
              className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </div>

          {/* Bottom WhatsApp-Style Caption Input + Send Button */}
          <div className="max-w-2xl w-full mx-auto pb-2 space-y-2">
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    handleConfirmSend(e);
                  }
                }}
                placeholder="Add a caption..."
                className="flex-1 py-3 px-4 rounded-full bg-white/10 border border-white/15 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white/15 transition-all"
              />

              <button
                type="button"
                disabled={isSending}
                onClick={handleConfirmSend}
                className="w-11 h-11 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white flex items-center justify-center shadow-lg shadow-pink-500/30 hover:opacity-95 active:scale-90 transition-all shrink-0 disabled:opacity-50"
                title="Send Photo to Group"
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
              <span>Sending to {groupName}</span>
              <span className="flex items-center gap-1 text-amber-300 font-semibold">
                <Sparkles className="w-3 h-3" />
                <span>+2 Spark Coins</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
