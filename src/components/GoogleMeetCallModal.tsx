import React, { useState, useEffect } from 'react';
import {
  Phone,
  Video,
  X,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Send,
  LogOut,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initMeetGoogleAuth,
  signInWithGoogleForMeet,
  getMeetAccessToken,
  getCurrentMeetGoogleUser,
  signOutGoogleMeet,
  createGoogleMeetSpace,
  GoogleMeetSpace,
} from '../lib/googleMeetService';

interface GoogleMeetCallModalProps {
  isOpen: boolean;
  callType: 'Audio Call' | 'Video Call';
  targetTitle: string;
  isGroup?: boolean;
  onClose: () => void;
  onShareMeetLinkToChat: (messageText: string) => Promise<void>;
}

export const GoogleMeetCallModal: React.FC<GoogleMeetCallModalProps> = ({
  isOpen,
  callType,
  targetTitle,
  isGroup,
  onClose,
  onShareMeetLinkToChat,
}) => {
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState<boolean>(false);
  const [isConfirmedStep, setIsConfirmedStep] = useState<boolean>(false);
  const [createdSpace, setCreatedSpace] = useState<GoogleMeetSpace | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [sharedToChat, setSharedToChat] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = initMeetGoogleAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(getCurrentMeetGoogleUser());
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setCreatedSpace(null);
      setIsConfirmedStep(false);
      setSharedToChat(false);
      getMeetAccessToken().then((token) => {
        setNeedsAuth(!token);
        setGoogleUser(getCurrentMeetGoogleUser());
      });
    }
  }, [isOpen, callType]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setIsLoggingIn(true);
    try {
      const result = await signInWithGoogleForMeet();
      if (result) {
        setGoogleUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Google Sign-In was cancelled or failed. Please try again.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmAndCreateMeet = async () => {
    setErrorMsg(null);
    const token = await getMeetAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsCreatingSpace(true);
    try {
      const space = await createGoogleMeetSpace();
      setCreatedSpace(space);
      setIsConfirmedStep(true);

      // Automatically share the invite card into the chat stream after user confirmed creation
      if (space.meetingUri) {
        const icon = callType === 'Video Call' ? '📹' : '📞';
        const modeLabel =
          callType === 'Video Call'
            ? 'Google Meet Video Call'
            : 'Google Meet Audio Call (Camera Off)';
        const inviteMessage = `${icon} ${modeLabel} started for ${targetTitle}!\nJoin Google Meet: ${space.meetingUri}${
          space.meetingCode ? `\nMeeting Code: ${space.meetingCode}` : ''
        }`;
        await onShareMeetLinkToChat(inviteMessage);
        setSharedToChat(true);
      }
    } catch (err: any) {
      if (err?.message === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMsg(err?.message || 'Could not create Google Meet space.');
      }
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdSpace?.meetingUri) return;
    try {
      await navigator.clipboard.writeText(createdSpace.meetingUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSwitchGoogleAccount = async () => {
    await signOutGoogleMeet();
    setNeedsAuth(true);
    setGoogleUser(null);
    setCreatedSpace(null);
    setIsConfirmedStep(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-rose-100 overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              {callType === 'Video Call' ? (
                <Video className="w-5 h-5 text-white" />
              ) : (
                <Phone className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100 block">
                Google Meet Integration
              </span>
              <h3 className="font-display font-black text-base leading-tight">
                {callType} · {targetTitle}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#ff3b69] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Authenticate with Google if no active token */}
          {needsAuth ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-[#ff3b69]">
                {callType === 'Video Call' ? (
                  <Video className="w-7 h-7" />
                ) : (
                  <Phone className="w-7 h-7" />
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  Connect Google Meet for {callType}s
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Sign in with your Google account to create an instant Google Meet room and share
                  the call link in {isGroup ? 'this group' : 'this chat'}.
                </p>
              </div>

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-full bg-white border border-slate-300 hover:bg-slate-50 active:scale-[0.99] text-slate-800 font-semibold text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper flex items-center gap-3">
                    <div className="gsi-material-button-icon w-5 h-5">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        className="w-5 h-5 block"
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ) : !isConfirmedStep || !createdSpace ? (
            /* Step 2: Explicit User Confirmation before creating a Google Meet space and posting to chat */
            <div className="space-y-4">
              {googleUser && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-slate-600 truncate">
                      Connected as{' '}
                      <strong className="text-slate-900">
                        {googleUser.email || googleUser.displayName}
                      </strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchGoogleAccount}
                    className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 shrink-0"
                    title="Switch Google Account"
                  >
                    <LogOut className="w-3 h-3" />
                    Switch
                  </button>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  Confirm New Google Meet {callType}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This will create a new Google Meet conference space in your Google account and
                  post the join link to <strong>{targetTitle}</strong> so everyone can join the{' '}
                  {callType.toLowerCase()}.
                </p>
                {callType === 'Audio Call' && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-2.5 py-1.5 font-medium">
                    Tip: For an audio-only call, turn off your camera on the Google Meet lobby
                    screen before joining.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isCreatingSpace}
                  className="flex-1 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAndCreateMeet}
                  disabled={isCreatingSpace}
                  className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#ff3b69] to-[#fb7185] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-rose-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  {isCreatingSpace ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Meet...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Confirm & Start {callType}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Step 3: Created Google Meet Space Ready to Join */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  <Check className="w-3 h-3" /> Google Meet Room Ready
                </span>
                <h4 className="font-bold text-slate-900 text-sm">
                  {callType} with {targetTitle}
                </h4>
                {createdSpace.meetingCode && (
                  <p className="text-xs text-slate-600 font-mono">
                    Code: <strong className="text-slate-900">{createdSpace.meetingCode}</strong>
                  </p>
                )}
                <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-xl p-2 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={createdSpace.meetingUri}
                    className="flex-1 text-xs text-slate-700 font-medium bg-transparent focus:outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                {sharedToChat && (
                  <p className="text-[11px] text-emerald-700 font-medium flex items-center justify-center gap-1 pt-1">
                    <Send className="w-3 h-3" /> Invite link posted to chat (+2 Spark Coins)
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-colors"
                >
                  Done
                </button>
                <a
                  href={createdSpace.meetingUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Join Google Meet Now</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
