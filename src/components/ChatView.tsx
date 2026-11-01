import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Phone,
  Video,
  Send,
  Paperclip,
  Flame,
  Droplets,
  Smile,
  AlertCircle,
  Loader2,
  Lock,
  ShieldCheck,
  Users,
  Image as ImageIcon,
  Camera,
  X,
  Maximize2,
  Download,
} from 'lucide-react';
import { ChatMessage, UserProfile, PublicUserProfile } from '../types';
import { evaluateMessageReward, appendCachedMessage, saveCachedMessages } from '../lib/storage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchRealMessages,
  sendRealMessageToSupabase,
  uploadGroupChatImage,
  resolveGroupMediaUrl,
} from '../lib/chatService';
import {
  getOrCreateDeviceIdentityKeyPair,
  fetchRecipientPublicKey,
  deriveConversationKey,
  decryptE2EEMessage,
} from '../lib/cryptoService';
import { GroupPhotoButtonAndModal } from './GroupPhotoModal';
import { GroupTodoSection } from './GroupTodoBoard';
import { GoogleMeetCallModal } from './GoogleMeetCallModal';

interface ChatTargetUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url: string;
  streak_days?: number;
  is_online?: boolean;
  conversation_id?: string;
  is_group?: boolean;
  member_count?: number;
  members?: PublicUserProfile[];
}

interface ChatViewProps {
  friend: ChatTargetUser;
  profile: UserProfile;
  conversationId?: string;
  onBack: () => void;
  onUpdateCoins: (earned: number) => void;
  originCoords?: { x: number; y: number } | null;
}

// Subcomponent to resolve and display private Supabase Storage images asynchronously
const GroupChatImage: React.FC<{
  mediaRef: string;
  alt: string;
  onClick: (url: string) => void;
}> = ({ mediaRef, alt, onClick }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);

    resolveGroupMediaUrl(mediaRef)
      .then((url) => {
        if (active) {
          if (url) {
            setResolvedUrl(url);
          } else {
            setHasError(true);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mediaRef]);

  if (isLoading) {
    return (
      <div className="w-56 h-48 rounded-2xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-[#ff3b69]" />
        <span className="text-[10px]">Loading photo...</span>
      </div>
    );
  }

  if (hasError || !resolvedUrl) {
    return (
      <div className="w-56 h-28 rounded-2xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 p-3 text-center">
        <AlertCircle className="w-4 h-4 text-slate-400 mb-1" />
        <span className="text-[10px]">Unable to load image</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(resolvedUrl)}
      className="relative group/img cursor-pointer overflow-hidden rounded-2xl max-w-xs sm:max-w-sm max-h-80 shadow-xs"
    >
      <img
        src={resolvedUrl}
        alt={alt}
        className="w-full h-auto object-cover max-h-80 transition-transform duration-200 group-hover/img:scale-[1.02]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/15 transition-colors flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-xs">
          <Maximize2 className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({
  friend,
  profile,
  conversationId,
  onBack,
  onUpdateCoins,
  originCoords,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isKeyNegotiating, setIsKeyNegotiating] = useState(!friend.is_group);
  const [conversationKey, setConversationKey] = useState<CryptoKey | null>(null);
  const [isE2EEActive, setIsE2EEActive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [coinDroplets, setCoinDroplets] = useState<{ id: string; amount: number; x: number }[]>([]);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [activeMeetCallType, setActiveMeetCallType] = useState<'Audio Call' | 'Video Call' | null>(
    null
  );

  // Group Image Upload states (exclusive to group chats)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeConvId = conversationId || friend.conversation_id || friend.id || 'default_conv';

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Set origin coordinates for liquid transition
  useEffect(() => {
    if (containerRef.current) {
      const x = originCoords?.x ? `${originCoords.x}px` : '50%';
      const y = originCoords?.y ? `${originCoords.y}px` : '50%';
      containerRef.current.style.setProperty('--origin-x', x);
      containerRef.current.style.setProperty('--origin-y', y);
    }
  }, [originCoords]);

  // Step 1: Establish E2EE ECDH Shared Key (for 1-on-1 chats) & Fetch Messages
  useEffect(() => {
    let isSubscribed = true;
    setIsLoadingMessages(true);

    const initChat = async () => {
      let derivedKey: CryptoKey | null = null;

      // 1-on-1 Chat: negotiate pairwise ECDH AES-256-GCM key
      if (!friend.is_group) {
        setIsKeyNegotiating(true);
        try {
          const { privateKey } = await getOrCreateDeviceIdentityKeyPair(profile.id);
          const recipientPubKey = await fetchRecipientPublicKey(friend.id);

          if (recipientPubKey) {
            derivedKey = await deriveConversationKey(privateKey, recipientPubKey, activeConvId);
            if (isSubscribed) {
              setConversationKey(derivedKey);
              setIsE2EEActive(true);
            }
          } else {
            console.info('Recipient has not published public key yet; message fallback active');
            if (isSubscribed) {
              setIsE2EEActive(false);
            }
          }
        } catch (cryptoErr) {
          console.warn('E2EE key derivation note:', cryptoErr);
          if (isSubscribed) {
            setIsE2EEActive(false);
          }
        } finally {
          if (isSubscribed) {
            setIsKeyNegotiating(false);
          }
        }
      } else {
        // Group chat uses Supabase RLS server-authoritative authenticated storage
        setIsKeyNegotiating(false);
        setIsE2EEActive(false);
      }

      // Fetch messages from Supabase
      try {
        const loadedMessages = await fetchRealMessages(
          activeConvId,
          profile.id,
          friend.is_group ? undefined : friend.id,
          derivedKey
        );
        if (isSubscribed) {
          setMessages(loadedMessages);
          setIsLoadingMessages(false);
        }
      } catch (err) {
        console.warn('Error loading messages:', err);
        if (isSubscribed) {
          setIsLoadingMessages(false);
        }
      }
    };

    initChat();

    // Step 2: Setup Supabase Realtime Listener for Instant Incoming Messages
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        const channelName =
          activeConvId && !activeConvId.startsWith('conv_')
            ? `chat_${activeConvId}`
            : `chat_pair_${[profile.id, friend.id].sort().join('_')}`;

        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
            },
            async (payload) => {
              const newMsg = payload.new as any;
              if (!newMsg) return;

              const isRelevant = friend.is_group
                ? newMsg.conversation_id === activeConvId
                : (newMsg.conversation_id && newMsg.conversation_id === activeConvId) ||
                  (newMsg.sender_id === friend.id && newMsg.receiver_id === profile.id) ||
                  (newMsg.sender_id === profile.id && newMsg.receiver_id === friend.id);

              if (isRelevant) {
                let displayContent = newMsg.content || '';
                let isE2EE = false;
                let decryptionError = false;

                // Decrypt incoming message if encrypted
                if (newMsg.ciphertext && newMsg.iv) {
                  if (conversationKey) {
                    const decrypted = await decryptE2EEMessage(
                      newMsg.ciphertext,
                      newMsg.iv,
                      conversationKey
                    );
                    if (decrypted !== null) {
                      displayContent = decrypted;
                      isE2EE = true;
                    } else {
                      displayContent = '🔒 Unable to decrypt this message';
                      decryptionError = true;
                    }
                  } else {
                    displayContent = '🔒 Encrypted message (key unavailable)';
                    decryptionError = true;
                  }
                }

                // If sender details not included in realtime payload, resolve from friend members
                let senderName = '';
                let senderAvatar = '';
                if (friend.is_group && friend.members) {
                  const found = friend.members.find((m) => m.id === newMsg.sender_id);
                  if (found) {
                    senderName = found.display_name || found.username;
                    senderAvatar = found.avatar_url;
                  }
                }

                const processedMsg: ChatMessage = {
                  id: newMsg.id,
                  conversation_id: newMsg.conversation_id,
                  sender_id: newMsg.sender_id,
                  sender_display_name: senderName,
                  sender_avatar_url: senderAvatar,
                  receiver_id: newMsg.receiver_id,
                  content: displayContent,
                  media_url: newMsg.media_url,
                  ciphertext: newMsg.ciphertext,
                  iv: newMsg.iv,
                  encryption_version: newMsg.encryption_version,
                  is_e2ee: isE2EE,
                  decryption_error: decryptionError,
                  coins_earned: newMsg.coins_earned || 2,
                  created_at: newMsg.created_at,
                  status: 'delivered',
                };

                setMessages((prev) => {
                  if (prev.some((m) => m.id === processedMsg.id)) {
                    return prev;
                  }
                  return [...prev, processedMsg];
                });
              }
            }
          )
          .subscribe();

        return () => {
          isSubscribed = false;
          supabase.removeChannel(channel);
        };
      }
    }

    return () => {
      isSubscribed = false;
    };
  }, [activeConvId, friend.id, friend.is_group, profile.id, conversationKey]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingMessages]);

  const handleBack = () => {
    setIsExiting(true);
    setTimeout(() => {
      onBack();
    }, 280);
  };

  const spawnCoinDroplet = (amount: number) => {
    const id = `${Date.now()}_${Math.random()}`;
    const x = Math.floor(Math.random() * 20) - 10;
    setCoinDroplets((prev) => [...prev, { id, amount, x }]);

    setTimeout(() => {
      setCoinDroplets((prev) => prev.filter((d) => d.id !== id));
    }, 1200);
  };

  const triggerCallNotice = (type: 'Audio Call' | 'Video Call') => {
    setActiveMeetCallType(type);
  };

  // Handle image file selection (group only)
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSendError('Please select a valid image file (PNG, JPG, WebP, GIF).');
      return;
    }

    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setSendError('Image size exceeds limit of 10MB.');
      return;
    }

    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setSelectedImageFile(file);
    setImagePreviewUrl(preview);
    setSendError(null);
  };

  const clearSelectedImage = () => {
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if ((!trimmed && !selectedImageFile) || isSending) return;

    if (trimmed.length > 5000) {
      setSendError('Message exceeds maximum limit of 5000 characters.');
      return;
    }

    setSendError(null);
    setIsSending(true);

    const reward = evaluateMessageReward(trimmed || 'photo', profile.daily_coins_earned);

    try {
      let uploadedMediaPath: string | undefined = undefined;

      // Upload image to Supabase Storage if an image was selected
      if (selectedImageFile && friend.is_group) {
        setIsUploadingImage(true);
        uploadedMediaPath = await uploadGroupChatImage(activeConvId, selectedImageFile);
        setIsUploadingImage(false);
      }

      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const verifiedSenderId = sessionData.session?.user?.id || profile.id;

          const savedMessage = await sendRealMessageToSupabase(
            activeConvId,
            verifiedSenderId,
            friend.is_group ? '' : friend.id,
            trimmed,
            friend.is_group ? null : conversationKey,
            uploadedMediaPath
          );

          appendCachedMessage(activeConvId, savedMessage);
          setMessages((prev) => {
            const next = prev.some((m) => m.id === savedMessage.id)
              ? prev
              : [...prev, savedMessage];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        }
      } else {
        const fallbackMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          conversation_id: activeConvId,
          sender_id: profile.id,
          sender_username: profile.username,
          sender_display_name: profile.display_name || profile.username,
          sender_avatar_url: profile.avatar_url,
          receiver_id: friend.is_group ? undefined : friend.id,
          content: trimmed,
          media_url: uploadedMediaPath || imagePreviewUrl || undefined,
          is_e2ee: Boolean(conversationKey),
          coins_earned: reward.coins,
          created_at: new Date().toISOString(),
          status: 'sent',
        };
        appendCachedMessage(activeConvId, fallbackMsg);
        setMessages((prev) => {
          const next = [...prev, fallbackMsg];
          saveCachedMessages(activeConvId, next);
          return next;
        });
      }

      if (reward.coins > 0) {
        spawnCoinDroplet(reward.coins);
        onUpdateCoins(reward.coins);
      }

      // Reset form & image
      setInputText('');
      clearSelectedImage();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setSendError(err?.message || 'Failed to send message. Please retry.');
    } finally {
      setIsSending(false);
      setIsUploadingImage(false);
      inputRef.current?.focus();
    }
  };

  const handleSendGroupPhoto = async (
    file: File,
    captionText: string,
    compressedDataUrl?: string
  ) => {
    if (!friend.is_group || isSending) return;
    setSendError(null);
    setIsSending(true);

    const reward = evaluateMessageReward(captionText || 'photo', profile.daily_coins_earned);

    try {
      let uploadedMediaPath = await uploadGroupChatImage(activeConvId, file);
      if (!uploadedMediaPath && compressedDataUrl) {
        uploadedMediaPath = compressedDataUrl;
      }

      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const verifiedSenderId = sessionData.session?.user?.id || profile.id;

          const savedMessage = await sendRealMessageToSupabase(
            activeConvId,
            verifiedSenderId,
            '',
            captionText,
            null,
            uploadedMediaPath
          );

          appendCachedMessage(activeConvId, savedMessage);
          setMessages((prev) => {
            const next = prev.some((m) => m.id === savedMessage.id)
              ? prev
              : [...prev, savedMessage];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        }
      } else {
        const fallbackMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          conversation_id: activeConvId,
          sender_id: profile.id,
          sender_username: profile.username,
          sender_display_name: profile.display_name || profile.username,
          sender_avatar_url: profile.avatar_url,
          content: captionText,
          media_url: uploadedMediaPath || compressedDataUrl,
          coins_earned: reward.coins,
          created_at: new Date().toISOString(),
          status: 'sent',
        };
        appendCachedMessage(activeConvId, fallbackMsg);
        setMessages((prev) => {
          const next = [...prev, fallbackMsg];
          saveCachedMessages(activeConvId, next);
          return next;
        });
      }

      if (reward.coins > 0) {
        spawnCoinDroplet(reward.coins);
        onUpdateCoins(reward.coins);
      }
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send group photo.');
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  const handlePostTodoSummary = async (summaryText: string) => {
    if (!friend.is_group || !summaryText.trim()) return;
    const reward = evaluateMessageReward(summaryText, profile.daily_coins_earned);
    const fallbackMsg: ChatMessage = {
      id: `msg_todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversation_id: activeConvId,
      sender_id: profile.id,
      sender_username: profile.username,
      sender_display_name: profile.display_name || profile.username,
      sender_avatar_url: profile.avatar_url,
      content: summaryText,
      coins_earned: reward.coins,
      created_at: new Date().toISOString(),
      status: 'sent',
    };

    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const verifiedSenderId = sessionData.session?.user?.id || profile.id;
          const savedMessage = await sendRealMessageToSupabase(
            activeConvId,
            verifiedSenderId,
            '',
            summaryText,
            null,
            undefined
          );
          appendCachedMessage(activeConvId, savedMessage);
          setMessages((prev) => {
            const next = prev.some((m) => m.id === savedMessage.id)
              ? prev
              : [...prev, savedMessage];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        } else {
          appendCachedMessage(activeConvId, fallbackMsg);
          setMessages((prev) => {
            const next = [...prev, fallbackMsg];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        }
      } else {
        appendCachedMessage(activeConvId, fallbackMsg);
        setMessages((prev) => {
          const next = [...prev, fallbackMsg];
          saveCachedMessages(activeConvId, next);
          return next;
        });
      }

      if (reward.coins > 0) {
        spawnCoinDroplet(reward.coins);
        onUpdateCoins(reward.coins);
      }
    } catch {
      appendCachedMessage(activeConvId, fallbackMsg);
      setMessages((prev) => {
        const next = [...prev, fallbackMsg];
        saveCachedMessages(activeConvId, next);
        return next;
      });
    }
  };

  const handleShareMeetLinkToChat = async (messageText: string) => {
    if (!messageText.trim()) return;
    const reward = evaluateMessageReward(messageText, profile.daily_coins_earned);
    const fallbackMsg: ChatMessage = {
      id: `msg_meet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversation_id: activeConvId,
      sender_id: profile.id,
      sender_username: profile.username,
      sender_display_name: profile.display_name || profile.username,
      sender_avatar_url: profile.avatar_url,
      receiver_id: friend.is_group ? undefined : friend.id,
      content: messageText,
      coins_earned: reward.coins,
      created_at: new Date().toISOString(),
      status: 'sent',
    };

    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const verifiedSenderId = sessionData.session?.user?.id || profile.id;
          const savedMessage = await sendRealMessageToSupabase(
            activeConvId,
            verifiedSenderId,
            friend.is_group ? '' : friend.id,
            messageText,
            friend.is_group ? null : conversationKey,
            undefined
          );
          appendCachedMessage(activeConvId, savedMessage);
          setMessages((prev) => {
            const next = prev.some((m) => m.id === savedMessage.id)
              ? prev
              : [...prev, savedMessage];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        } else {
          appendCachedMessage(activeConvId, fallbackMsg);
          setMessages((prev) => {
            const next = [...prev, fallbackMsg];
            saveCachedMessages(activeConvId, next);
            return next;
          });
        }
      } else {
        appendCachedMessage(activeConvId, fallbackMsg);
        setMessages((prev) => {
          const next = [...prev, fallbackMsg];
          saveCachedMessages(activeConvId, next);
          return next;
        });
      }

      if (reward.coins > 0) {
        spawnCoinDroplet(reward.coins);
        onUpdateCoins(reward.coins);
      }
    } catch {
      appendCachedMessage(activeConvId, fallbackMsg);
      setMessages((prev) => {
        const next = [...prev, fallbackMsg];
        saveCachedMessages(activeConvId, next);
        return next;
      });
    }
  };

  const formatMessageTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col transition-all duration-300 ${
        isExiting ? 'liquid-exit' : 'liquid-enter'
      }`}
      style={{
        background: `
          radial-gradient(circle at 15% 30%, #e0f2fe 0%, #f0f9ff 40%, transparent 70%),
          radial-gradient(circle at 85% 40%, #fdf2f8 0%, #ffe4e6 50%, transparent 70%),
          linear-gradient(180deg, #ffffff 0%, #faf8ff 50%, #fff1f2 100%)
        `,
      }}
    >
      {/* Light Header */}
      <header className="sticky top-0 z-20 w-full px-4 sm:px-6 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-100/80 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Left: Back chevron + Avatar + User/Group info */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#ff3b69] hover:bg-rose-50 transition-colors -ml-1 active:scale-90"
              title="Back to Messages"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.8]" />
            </button>

            <div className="relative">
              <div className="w-10 h-10 rounded-full p-[1.5px] bg-gradient-to-tr from-[#ff3b69] to-[#fb7185] shadow-xs">
                <img
                  src={friend.avatar_url}
                  alt={friend.display_name || friend.username}
                  className="w-full h-full rounded-full object-cover bg-white"
                  referrerPolicy="no-referrer"
                />
              </div>
              {friend.is_group ? (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ff3b69] border-2 border-white flex items-center justify-center text-white">
                  <Users className="w-2.5 h-2.5" />
                </span>
              ) : (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-display font-bold text-sm tracking-tight text-slate-900">
                  {friend.display_name || friend.username}
                </h2>
                {!friend.is_group && (
                  <div className="flex items-center gap-0.5 text-rose-500 font-bold text-[10px]">
                    <Flame className="w-3 h-3 fill-rose-500" />
                    <span>{friend.streak_days || 1}d</span>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 text-[10px]">
                {friend.is_group ? (
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#ff3b69]" />
                    <span>{friend.member_count || (friend.members?.length || 2)} members</span>
                  </span>
                ) : (
                  <>
                    <span className="text-slate-400 font-mono">@{friend.username}</span>
                    {isKeyNegotiating ? (
                      <span className="text-amber-500 flex items-center gap-0.5">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Verifying keys...</span>
                      </span>
                    ) : isE2EEActive ? (
                      <span
                        className="text-emerald-600 font-semibold flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.2 rounded-full"
                        title="Messages are end-to-end encrypted with AES-256-GCM. Supabase cannot read them."
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>End-to-End Encrypted</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Direct chat</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Call Actions */}
          <div className="flex items-center gap-2 text-[#ff3b69]">
            <button
              onClick={() => triggerCallNotice('Audio Call')}
              className="w-9 h-9 rounded-full hover:bg-rose-50 flex items-center justify-center transition-colors active:scale-90"
              title="Audio Call"
            >
              <Phone className="w-4 h-4 fill-current stroke-none" />
            </button>
            <button
              onClick={() => triggerCallNotice('Video Call')}
              className="w-9 h-9 rounded-full hover:bg-rose-50 flex items-center justify-center transition-colors active:scale-90"
              title="Video Call"
            >
              <Video className="w-4 h-4 fill-current stroke-none" />
            </button>
          </div>
        </div>
      </header>

      {friend.is_group && (
        <GroupTodoSection
          conversationId={activeConvId}
          groupName={friend.display_name || friend.username || 'Group Chat'}
          profile={profile}
          members={friend.members}
          onPostTodoChatSummary={handlePostTodoSummary}
        />
      )}

      {callNotice && (
        <div className="p-2 text-center text-xs font-semibold bg-rose-50 text-[#ff3b69] border-b border-rose-100 animate-pulse">
          {callNotice}
        </div>
      )}

      {sendError && (
        <div className="p-2.5 text-center text-xs font-semibold bg-rose-50 text-[#ff3b69] border-b border-rose-100 flex items-center justify-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{sendError}</span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 max-w-4xl w-full mx-auto flex flex-col">
        {isLoadingMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#ff3b69]" />
            <span>Establishing secure conversation...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center text-[#ff3b69] mb-3 shadow-inner">
              {friend.is_group ? <Users className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
            </div>
            <h3 className="font-display font-bold text-base text-slate-800 mb-1">
              {friend.is_group ? friend.display_name || 'Group Chat' : 'End-to-End Encrypted'}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mb-3 leading-relaxed">
              {friend.is_group
                ? 'Welcome to the group! Send a message or share photos with everyone.'
                : `Messages are encrypted on your device and can only be read by you and @${friend.username}.`}
            </p>
            <button
              onClick={() => setInputText('Hey everyone! 👋')}
              className="px-4 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-[#ff3b69] font-bold text-xs transition-colors"
            >
              Say "Hey everyone! 👋"
            </button>
          </div>
        ) : (
          <>
            <div className="text-center py-2 flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>
                {friend.is_group
                  ? 'Private group with Supabase Row Level Security'
                  : 'Messages are end-to-end encrypted'}
              </span>
            </div>

            {messages.map((msg) => {
              const isMine = msg.sender_id === profile.id;
              const senderDisplayName =
                msg.sender_display_name || msg.sender_username || (isMine ? 'You' : 'Member');
              const senderAvatar = msg.sender_avatar_url || friend.avatar_url;

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    isMine ? 'justify-end' : 'justify-start'
                  } group transition-all`}
                >
                  {!isMine && (
                    <img
                      src={senderAvatar}
                      alt={senderDisplayName}
                      className="w-7 h-7 rounded-full object-cover bg-white mb-1 shadow-xs border border-slate-200"
                    />
                  )}

                  {/* Message Bubble (WhatsApp style for media and text) */}
                  <div className="max-w-[82%] sm:max-w-[70%] flex flex-col items-end">
                    <div
                      className={`rounded-[22px] p-2 text-xs sm:text-sm font-medium leading-relaxed shadow-sm transition-transform active:scale-[0.99] ${
                        msg.decryption_error
                          ? 'bg-rose-50 text-rose-800 border border-rose-200 px-4 py-2.5'
                          : isMine
                          ? 'bg-gradient-to-r from-[#ff4b72] to-[#ff6b8b] text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-100 rounded-bl-xs'
                      }`}
                    >
                      {/* Sender name for group messages from others */}
                      {friend.is_group && !isMine && (
                        <div className="px-2 pt-0.5 pb-1">
                          <span className="text-[11px] font-bold text-[#ff3b69]">
                            {senderDisplayName}
                          </span>
                        </div>
                      )}

                      {/* Image Thumbnail in group */}
                      {msg.media_url && (
                        <div className="mb-1">
                          <GroupChatImage
                            mediaRef={msg.media_url}
                            alt="Group photo"
                            onClick={(url) => setLightboxImageUrl(url)}
                          />
                        </div>
                      )}

                      {/* Text content */}
                      {msg.content && (
                        <div
                          className={`break-words whitespace-pre-wrap ${
                            msg.media_url ? 'px-2 py-1' : 'px-3 py-1.5'
                          }`}
                        >
                          <p>{msg.content}</p>
                          {msg.content.includes('https://meet.google.com/') && (
                            <a
                              href={
                                msg.content.match(/https:\/\/meet\.google\.com\/[a-zA-Z0-9-]+/)?.[0] ||
                                'https://meet.google.com'
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all ${
                                isMine
                                  ? 'bg-white text-[#ff3b69] hover:bg-rose-50'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Join Google Meet</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-1 mt-0.5 px-1 text-[10px] ${
                        isMine ? 'text-slate-400 justify-end' : 'text-slate-400 justify-start'
                      }`}
                    >
                      {msg.is_e2ee && (
                        <span title="End-to-End Encrypted with AES-256-GCM">
                          <Lock className="w-2.5 h-2.5 text-emerald-500" />
                        </span>
                      )}
                      <span>{formatMessageTime(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div ref={messagesEndRef} />

        {/* Floating Coin Droplets */}
        {coinDroplets.map((d) => (
          <div
            key={d.id}
            className="fixed bottom-20 left-1/2 pointer-events-none -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400 text-slate-900 font-bold text-xs shadow-lg animate-droplet-squish"
            style={{ transform: `translate(calc(-50% + ${d.x}px), -20px)` }}
          >
            <Droplets className="w-3.5 h-3.5 text-amber-900 fill-amber-900" />
            <span>+{d.amount} Coin!</span>
          </div>
        ))}
      </div>

      {/* Image Preview Banner before sending (WhatsApp style) */}
      {imagePreviewUrl && (
        <div className="bg-slate-100/90 border-t border-slate-200/80 px-4 py-2 flex items-center justify-between gap-3 max-w-4xl mx-auto w-full backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-xs border border-white shrink-0">
              <img
                src={imagePreviewUrl}
                alt="Selected preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">Photo selected</p>
              <p className="text-[10px] text-slate-500 truncate">
                {selectedImageFile?.name} ({(Number(selectedImageFile?.size || 0) / 1024).toFixed(0)} KB)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearSelectedImage}
            className="w-7 h-7 rounded-full bg-white text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-xs transition-colors shrink-0"
            title="Cancel photo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Composer */}
      <footer className="sticky bottom-0 w-full px-4 sm:px-6 py-3 bg-white/90 backdrop-blur-md border-t border-slate-100/80 shadow-xs">
        {/* Hidden file input for Group Image Sharing */}
        {friend.is_group && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelected}
            className="hidden"
          />
        )}

        <form
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex items-center gap-2.5 relative"
        >
          {/* Group-Only WhatsApp-Style Picture Sender (Hidden in 1-to-1 chats) */}
          {friend.is_group && (
            <GroupPhotoButtonAndModal
              groupName={friend.display_name || friend.username || 'Group Chat'}
              isSending={isSending}
              onSendPhoto={handleSendGroupPhoto}
            />
          )}

          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                selectedImageFile
                  ? 'Add a caption to your photo...'
                  : friend.is_group
                  ? 'Message the group...'
                  : 'Send an encrypted message...'
              }
              className="w-full py-2.5 pl-4 pr-9 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/60 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69]/60 focus:bg-white transition-all shadow-inner"
            />
            <button
              type="button"
              onClick={() => setInputText((prev) => `${prev} 💖`)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#ff3b69] transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImageFile) || isSending}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all shadow-md shadow-pink-500/25 active:scale-90 shrink-0 ${
              inputText.trim() || selectedImageFile
                ? 'bg-gradient-to-r from-[#ff3b69] to-[#fb7185] hover:opacity-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            title="Send Message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </footer>

      {/* Lightbox Modal: Tap an image to view it larger */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImageUrl(null)}
        >
          {/* Top Bar */}
          <div className="w-full max-w-4xl flex items-center justify-between pb-3 text-white">
            <span className="text-xs font-semibold text-slate-300">Group Photo</span>
            <div className="flex items-center gap-3">
              <a
                href={lightboxImageUrl}
                target="_blank"
                rel="noreferrer"
                download="spark-image.jpg"
                onClick={(e) => e.stopPropagation()}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                title="Download / Open Full"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setLightboxImageUrl(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                title="Close Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Image */}
          <div
            className="max-w-4xl max-h-[82vh] overflow-hidden flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImageUrl}
              alt="Fullscreen View"
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Google Meet Audio / Video Call Modal */}
      <GoogleMeetCallModal
        isOpen={Boolean(activeMeetCallType)}
        callType={activeMeetCallType || 'Video Call'}
        targetTitle={
          friend.is_group
            ? friend.display_name || friend.username || 'Group Chat'
            : friend.display_name || `@${friend.username}`
        }
        isGroup={friend.is_group}
        onClose={() => setActiveMeetCallType(null)}
        onShareMeetLinkToChat={handleShareMeetLinkToChat}
      />
    </div>
  );
};
