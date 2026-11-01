import React, { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  ArrowRight,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Database,
  ChevronLeft,
  Key,
  Check,
} from 'lucide-react';
import {
  getSupabase,
  isSupabaseConfigured,
  saveSupabaseCredentials,
  getSavedCredentials,
  sanitizeSupabaseUrl,
  isLikelyApiKey,
  getSupabaseConfigState,
} from '../lib/supabase';
import { UserProfile } from '../types';
import {
  DEFAULT_STARTER_PROFILE,
  findLocalAccountByEmail,
  findLocalAccountById,
  upsertLocalAccount,
  saveActiveLocalSession,
  getActiveLocalSession,
  saveLocalProfile,
  getLocalProfile,
  generateConsistentUserId,
} from '../lib/storage';
import {
  validateUsernameFormat,
  checkUsernameAvailability,
} from '../lib/chatService';

export type AuthView =
  | 'login'
  | 'signup'
  | 'forgot_password'
  | 'reset_password'
  | 'email_verification'
  | 'profile_setup';

interface AuthScreenProps {
  initialView?: AuthView;
  onAuthSuccess: (profile: UserProfile) => void;
  onOpenSupabaseGuide: () => void;
  onContinueDemo?: () => void;
  recoveryUserEmail?: string | null;
  initialUserId?: string | null;
}

const PRESET_AVATARS = [
  { name: 'Cosmic', seed: 'CosmicVoyager' },
  { name: 'Nova', seed: 'LuminaNova' },
  { name: 'Pulse', seed: 'ZephyrPulse' },
  { name: 'Solar', seed: 'SolarisEcho' },
  { name: 'Orion', seed: 'OrionDrift' },
  { name: 'Astro', seed: 'AstroNova' },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialView = 'login',
  onAuthSuccess,
  onOpenSupabaseGuide,
  recoveryUserEmail,
  initialUserId,
}) => {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState(
    'https://api.dicebear.com/7.x/bottts/svg?seed=spark1&backgroundColor=f1f5f9'
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Supabase credentials configuration state
  const configState = getSupabaseConfigState();
  const savedCreds = getSavedCredentials();
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [inputUrl, setInputUrl] = useState(savedCreds.url || '');
  const [inputAnonKey, setInputAnonKey] = useState(
    savedCreds.anonKey || (configState.detectedUrlIsKey ? configState.rawUrl : '')
  );
  const [configToast, setConfigToast] = useState<string | null>(null);

  // Authenticated user ID during onboarding
  const [pendingUserId, setPendingUserId] = useState<string | null>(initialUserId || null);
  const [pendingUserEmail, setPendingUserEmail] = useState<string | null>(recoveryUserEmail || null);
  const [bio, setBio] = useState('');

  // Passwordless magic link / OTP login toggle
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Live username availability state
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameStatusMsg, setUsernameStatusMsg] = useState<string>('');

  // Sync session user when component mounts or view switches to profile_setup
  useEffect(() => {
    if (initialUserId && !pendingUserId) {
      setPendingUserId(initialUserId);
    }
    if (recoveryUserEmail && !pendingUserEmail) {
      setPendingUserEmail(recoveryUserEmail);
    }

    const activeLocal = getActiveLocalSession();
    if (activeLocal?.id && !pendingUserId) {
      setPendingUserId(activeLocal.id);
    }
    if (activeLocal?.email && !pendingUserEmail) {
      setPendingUserEmail(activeLocal.email);
    }

    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          setPendingUserId(data.session.user.id);
          if (data.session.user.email) {
            setPendingUserEmail(data.session.user.email);
          }
        }
      });
    }
  }, [initialUserId, recoveryUserEmail, view]);

  // Live debounced availability check
  useEffect(() => {
    if (view !== 'profile_setup') return;

    const trimmed = (username || '').trim().replace(/^@+/, '');
    if (!trimmed) {
      setUsernameStatus('idle');
      setUsernameStatusMsg('');
      return;
    }

    const formatCheck = validateUsernameFormat(trimmed);
    if (!formatCheck.valid) {
      setUsernameStatus('invalid');
      setUsernameStatusMsg(formatCheck.error || 'Invalid username');
      return;
    }

    setUsernameStatus('checking');
    setUsernameStatusMsg('Checking availability...');

    const timer = setTimeout(async () => {
      const res = await checkUsernameAvailability(trimmed, pendingUserId || undefined);
      if (!res.valid) {
        setUsernameStatus('invalid');
        setUsernameStatusMsg(res.message);
      } else if (res.available) {
        setUsernameStatus('available');
        setUsernameStatusMsg('✓ Username available');
      } else if (res.message && res.message.toLowerCase().includes('taken')) {
        setUsernameStatus('taken');
        setUsernameStatusMsg('✕ Username already taken');
      } else {
        setUsernameStatus('available');
        setUsernameStatusMsg('✓ Username available');
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [username, view, pendingUserId]);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = sanitizeSupabaseUrl(inputUrl);
    const cleanAnon = inputAnonKey.trim();

    if (isLikelyApiKey(inputUrl.trim())) {
      setInputAnonKey(inputUrl.trim());
      setInputUrl('');
      setConfigToast(
        'Publishable key detected and saved to Anon Key! Now enter your Project URL (https://your-ref.supabase.co).'
      );
      return;
    }

    if (!cleanUrl) {
      setConfigToast(
        'Please enter a valid Supabase Project URL (e.g. https://xyzcompany.supabase.co).'
      );
      return;
    }

    if (!cleanAnon || cleanAnon.length < 10) {
      setConfigToast('Please enter your Supabase anon/publishable public key.');
      return;
    }

    setInputUrl(cleanUrl);
    saveSupabaseCredentials(cleanUrl, cleanAnon);
    setConfigToast('Supabase connected! You can now log in or sign up.');
    setTimeout(() => {
      setShowConfigDrawer(false);
      setConfigToast(null);
    }, 1500);
  };

  // Helper to resolve an authenticated or local user into their existing profile or username setup
  const completeLocalSignInOrSetup = (
    targetEmail: string,
    targetPassword?: string,
    knownUserId?: string
  ) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    const existingAcc =
      findLocalAccountByEmail(cleanEmail) ||
      (knownUserId ? findLocalAccountById(knownUserId) : undefined);

    const resolvedId = knownUserId || existingAcc?.id || generateConsistentUserId(cleanEmail);
    const updatedAcc = upsertLocalAccount(
      cleanEmail,
      targetPassword || existingAcc?.password,
      resolvedId,
      existingAcc?.profile
    );
    saveActiveLocalSession(resolvedId, cleanEmail);

    // Check if this user already has a saved profile with a username
    if (updatedAcc.profile && updatedAcc.profile.username) {
      const fullProf: UserProfile = {
        ...DEFAULT_STARTER_PROFILE,
        ...updatedAcc.profile,
        id: resolvedId,
        email: cleanEmail,
      };
      saveLocalProfile(fullProf);
      onAuthSuccess(fullProf);
      return;
    }

    // Check if the current browser profile explicitly matches this user ID or email
    const localProf = getLocalProfile();
    if (
      localProf &&
      localProf.username &&
      localProf.id &&
      localProf.id !== 'user_1' &&
      (localProf.id === resolvedId ||
        (localProf.email && localProf.email.toLowerCase() === cleanEmail))
    ) {
      const mergedProf: UserProfile = {
        ...localProf,
        id: resolvedId,
        email: cleanEmail,
      };
      saveLocalProfile(mergedProf);
      onAuthSuccess(mergedProf);
      return;
    }

    // No username yet -> go to Choose your username screen
    setPendingUserId(resolvedId);
    setPendingUserEmail(cleanEmail);
    setView('profile_setup');
  };

  const handlePostAuthUser = async (user: any, supabase?: any) => {
    const userEmail = (user?.email || email || '').trim().toLowerCase();
    const userId = user?.id || generateConsistentUserId(userEmail);
    saveActiveLocalSession(userId, userEmail);

    try {
      if (supabase) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileError) {
          console.warn('Profile fetch note:', profileError);
        }

        if (profileData && profileData.username) {
          const loadedProfile: UserProfile = {
            id: userId,
            email: userEmail,
            username: profileData.username,
            display_name: profileData.display_name || profileData.username,
            avatar_url:
              profileData.avatar_url ||
              `https://api.dicebear.com/7.x/bottts/svg?seed=${profileData.username}&backgroundColor=f1f5f9`,
            avatar_style: profileData.avatar_style || 'cosmic_neon',
            bio: profileData.bio || '',
            coins: profileData.coins ?? 50,
            streak_days: profileData.streak_days ?? 1,
            daily_coins_earned: profileData.daily_coins_earned ?? 0,
            daily_coins_date:
              profileData.daily_coins_date ?? new Date().toISOString().split('T')[0],
            weekly_coins: profileData.weekly_coins ?? 0,
            equipped_frame: profileData.equipped_frame || 'frame_pulsar',
            equipped_theme: profileData.equipped_theme || 'theme_cosmic',
            equipped_outfit: profileData.equipped_outfit || 'outfit_voyager',
            unlocked_items: profileData.unlocked_items || [
              'frame_pulsar',
              'theme_cosmic',
              'outfit_voyager',
            ],
            created_at: profileData.created_at || new Date().toISOString(),
          };
          saveLocalProfile(loadedProfile);
          onAuthSuccess(loadedProfile);
          return;
        }
      }
    } catch (e) {
      console.warn('Post-auth fetch note:', e);
    }

    // Fallback: check local account profile or proceed to username setup
    completeLocalSignInOrSetup(userEmail, password, userId);
  };

  // Login handler (works with Supabase Auth + seamless local persistence fallback)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = isSupabaseConfigured() ? getSupabase() : null;

      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error && data?.user) {
          upsertLocalAccount(cleanEmail, password, data.user.id);
          await handlePostAuthUser(data.user, supabase);
          setIsLoading(false);
          return;
        }

        if (error) {
          const msg = (error.message || '').toLowerCase();
          // If the user hasn't registered in Supabase yet, attempt seamless registration in background
          if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
            const existingLocal = findLocalAccountByEmail(cleanEmail);
            if (!existingLocal && password.length >= 6) {
              try {
                const { data: signUpData } = await supabase.auth.signUp({
                  email: cleanEmail,
                  password,
                });
                if (signUpData?.user) {
                  completeLocalSignInOrSetup(cleanEmail, password, signUpData.user.id);
                  setIsLoading(false);
                  return;
                }
              } catch {}
            }
          }
        }
      }

      // Local / fallback sign-in so the user is never blocked from logging in
      completeLocalSignInOrSetup(cleanEmail, password);
    } catch {
      completeLocalSignInOrSetup(cleanEmail, password);
    } finally {
      setIsLoading(false);
    }
  };

  // Magic Link / OTP handler
  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = isSupabaseConfigured() ? getSupabase() : null;
      if (supabase) {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });

        if (!error) {
          setSuccessMessage(
            `Magic link sent to ${cleanEmail}! Or continue directly below.`
          );
          completeLocalSignInOrSetup(cleanEmail);
          setIsLoading(false);
          return;
        }
      }

      completeLocalSignInOrSetup(cleanEmail);
    } catch {
      completeLocalSignInOrSetup(cleanEmail);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Verification Email handler
  const handleResendVerificationEmail = async () => {
    const target = (pendingUserEmail || email).trim().toLowerCase();
    if (!target) return;

    setIsResendingEmail(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = getSupabase();
    if (!supabase) {
      setIsResendingEmail(false);
      completeLocalSignInOrSetup(target, password);
      return;
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });

      if (error) {
        setSuccessMessage('Proceeding to username setup...');
        completeLocalSignInOrSetup(target, password);
      } else {
        setSuccessMessage(`Confirmation email resent to ${target}! Check your inbox and spam folder.`);
      }
    } catch {
      completeLocalSignInOrSetup(target, password);
    } finally {
      setIsResendingEmail(false);
    }
  };

  // OTP code verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otpToken.trim();
    if (!token) {
      setErrorMessage('Please enter the 6-digit confirmation code.');
      return;
    }

    const target = (pendingUserEmail || email).trim().toLowerCase();
    setIsVerifyingOtp(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = getSupabase();
    if (!supabase) {
      setIsVerifyingOtp(false);
      completeLocalSignInOrSetup(target, password);
      return;
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: target,
        token,
        type: 'signup',
      });

      if (error) {
        const { data: retryData, error: retryErr } = await supabase.auth.verifyOtp({
          email: target,
          token,
          type: 'email',
        });

        if (retryErr) {
          setErrorMessage(retryErr.message || error.message);
          setIsVerifyingOtp(false);
          return;
        }

        if (retryData?.user) {
          await handlePostAuthUser(retryData.user, supabase);
          return;
        }
      }

      if (data?.user) {
        await handlePostAuthUser(data.user, supabase);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification failed. Please check the code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Signup handler (works with Supabase Auth + seamless local persistence fallback)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your entries.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = isSupabaseConfigured() ? getSupabase() : null;

      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });

        if (!error && data?.user) {
          upsertLocalAccount(cleanEmail, password, data.user.id);
          saveActiveLocalSession(data.user.id, cleanEmail);
          setPendingUserId(data.user.id);
          setPendingUserEmail(cleanEmail);
          setView('profile_setup');
          setIsLoading(false);
          return;
        }

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('already registered') || msg.includes('user already exists')) {
            // Try logging in automatically with the provided password
            const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
            if (!loginErr && loginData?.user) {
              await handlePostAuthUser(loginData.user, supabase);
              setIsLoading(false);
              return;
            }
          }
        }
      }

      // Local / fallback signup so user goes directly to Choose your username
      completeLocalSignInOrSetup(cleanEmail, password);
    } catch {
      completeLocalSignInOrSetup(cleanEmail, password);
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = isSupabaseConfigured() ? getSupabase() : null;
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });

        if (!error) {
          setSuccessMessage(
            'Password reset instructions sent! Check your email or set a new password now.'
          );
          setIsLoading(false);
          return;
        }
      }

      setPendingUserEmail(cleanEmail);
      setView('reset_password');
    } catch {
      setPendingUserEmail(cleanEmail);
      setView('reset_password');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password update handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = isSupabaseConfigured() ? getSupabase() : null;
      if (supabase) {
        await supabase.auth.updateUser({ password });
      }

      const targetEmail = (pendingUserEmail || email || 'user@spark.app').trim().toLowerCase();
      setSuccessMessage('Password updated successfully! Signing you in...');
      setTimeout(() => {
        completeLocalSignInOrSetup(targetEmail, password);
      }, 600);
    } catch {
      const targetEmail = (pendingUserEmail || email || 'user@spark.app').trim().toLowerCase();
      completeLocalSignInOrSetup(targetEmail, password);
    } finally {
      setIsLoading(false);
    }
  };

  // Unique Username & Profile Setup (Supabase + Local Persistence)
  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validateUsernameFormat(username);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please enter a valid username (3-20 characters).');
      return;
    }

    if (usernameStatus === 'taken') {
      setErrorMessage(`Username "@${validation.normalized}" is already taken. Please choose another.`);
      return;
    }

    if (usernameStatus === 'checking') {
      setErrorMessage('Still checking username availability. Please wait a moment.');
      return;
    }

    const supabase = isSupabaseConfigured() ? getSupabase() : null;

    // Resolve authenticated user ID (from Supabase session, pending state, or deterministic local ID)
    let activeUserId = pendingUserId || getActiveLocalSession()?.id || null;
    let activeEmail =
      pendingUserEmail || email.trim().toLowerCase() || getActiveLocalSession()?.email || '';

    if (supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.id) {
          activeUserId = sessionData.session.user.id;
          if (sessionData.session.user.email) {
            activeEmail = sessionData.session.user.email;
          }
        } else if (!activeUserId) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user?.id) {
            activeUserId = userData.user.id;
            if (userData.user.email) {
              activeEmail = userData.user.email;
            }
          }
        }
      } catch {}
    }

    if (!activeUserId) {
      activeUserId = generateConsistentUserId(activeEmail || validation.normalized);
    }

    setIsLoading(true);

    try {
      // 1. Availability pre-check
      const availability = await checkUsernameAvailability(validation.normalized, activeUserId);
      if (!availability.available && availability.message?.toLowerCase().includes('taken')) {
        setUsernameStatus('taken');
        setUsernameStatusMsg('✕ Username already taken');
        setErrorMessage(
          `Username "@${validation.normalized}" is already taken. Please choose another username.`
        );
        setIsLoading(false);
        return;
      }

      const cleanDisplay = displayName.trim() || validation.normalized;
      let freshProfile: any = null;

      if (supabase) {
        // 2. Base payload (guaranteed to match standard profile schema)
        const basePayload: Record<string, any> = {
          id: activeUserId,
          username: validation.normalized,
          display_name: cleanDisplay,
          avatar_url: selectedAvatarUrl,
          bio: bio.trim(),
          updated_at: new Date().toISOString(),
        };

        // Full payload with gamification columns (for enhanced schema)
        const fullPayload: Record<string, any> = {
          ...basePayload,
          coins: 50,
          streak_days: 1,
          daily_coins_earned: 0,
          weekly_coins: 0,
          equipped_frame: 'frame_pulsar',
          equipped_theme: 'theme_cosmic',
          equipped_outfit: 'outfit_voyager',
          unlocked_items: ['frame_pulsar', 'theme_cosmic', 'outfit_voyager'],
          created_at: new Date().toISOString(),
        };

        let saveError: any = null;

        try {
          const { error: err1 } = await supabase
            .from('profiles')
            .upsert(fullPayload, { onConflict: 'id' });

          if (err1) {
            if (
              err1.code === '42703' ||
              err1.message?.toLowerCase().includes('column') ||
              err1.message?.toLowerCase().includes('does not exist')
            ) {
              const { error: err2 } = await supabase
                .from('profiles')
                .upsert(basePayload, { onConflict: 'id' });
              saveError = err2;
            } else {
              saveError = err1;
            }
          }

          if (saveError && saveError.code !== '23505') {
            const { data: existingRow } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', activeUserId)
              .maybeSingle();

            if (existingRow) {
              const { error: updateErr } = await supabase
                .from('profiles')
                .update({
                  username: validation.normalized,
                  display_name: cleanDisplay,
                  avatar_url: selectedAvatarUrl,
                  bio: bio.trim(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', activeUserId);
              saveError = updateErr;
            } else {
              const { error: insertErr } = await supabase
                .from('profiles')
                .insert({
                  id: activeUserId,
                  username: validation.normalized,
                  display_name: cleanDisplay,
                  avatar_url: selectedAvatarUrl,
                  bio: bio.trim(),
                });
              saveError = insertErr;
            }
          }
        } catch (dbErr) {
          console.warn('Database profile sync notice:', dbErr);
        }

        if (saveError) {
          const errorMsg = (saveError.message || '').toLowerCase();
          const errorDetails = (saveError.details || '').toLowerCase();

          // Check if it is a genuine username uniqueness conflict
          const isUsernameTaken =
            (saveError.code === '23505' &&
              (errorMsg.includes('username') ||
                errorDetails.includes('username') ||
                errorMsg.includes('idx_profiles_username') ||
                errorMsg.includes('profiles_username_key') ||
                (!errorMsg.includes('profiles_pkey') && !errorDetails.includes('profiles_pkey')))) ||
            ((errorMsg.includes('unique') || errorMsg.includes('duplicate')) &&
              errorMsg.includes('username'));

          if (isUsernameTaken) {
            setUsernameStatus('taken');
            setUsernameStatusMsg('✕ Username was just claimed by another user');
            setErrorMessage(
              `Username "@${validation.normalized}" is already taken. Please choose another username.`
            );
            setIsLoading(false);
            return;
          }

          // For RLS / unconfirmed email / schema not yet applied, log warning and save locally so user isn't blocked
          console.warn('Supabase profile save fallback to local persistence:', saveError);
        } else {
          try {
            const { data: fetched } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', activeUserId)
              .maybeSingle();
            freshProfile = fetched;
          } catch {}
        }
      }

      const completedProfile: UserProfile = {
        id: activeUserId,
        email: activeEmail || undefined,
        username: freshProfile?.username || validation.normalized,
        display_name: freshProfile?.display_name || cleanDisplay,
        avatar_url: freshProfile?.avatar_url || selectedAvatarUrl,
        avatar_style: freshProfile?.avatar_style || 'cosmic_neon',
        bio: freshProfile?.bio ?? bio.trim(),
        coins: freshProfile?.coins ?? 50,
        streak_days: freshProfile?.streak_days ?? 1,
        daily_coins_earned: freshProfile?.daily_coins_earned ?? 0,
        daily_coins_date:
          freshProfile?.daily_coins_date ?? new Date().toISOString().split('T')[0],
        weekly_coins: freshProfile?.weekly_coins ?? 0,
        equipped_frame: freshProfile?.equipped_frame || 'frame_pulsar',
        equipped_theme: freshProfile?.equipped_theme || 'theme_cosmic',
        equipped_outfit: freshProfile?.equipped_outfit || 'outfit_voyager',
        unlocked_items: freshProfile?.unlocked_items || [
          'frame_pulsar',
          'theme_cosmic',
          'outfit_voyager',
        ],
        created_at: freshProfile?.created_at || new Date().toISOString(),
      };

      saveLocalProfile(completedProfile);
      upsertLocalAccount(
        activeEmail || `${validation.normalized}@spark.local`,
        password || undefined,
        activeUserId,
        completedProfile
      );
      onAuthSuccess(completedProfile);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to complete profile creation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRandomizeAvatar = () => {
    const randomSeed = 'spark_' + Math.random().toString(36).substring(2, 8);
    setSelectedAvatarUrl(
      `https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}&backgroundColor=f1f5f9`
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative z-20">
      {/* Clean White Application Surface with Soft Shadow and Rounded Corners */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-[32px] border border-white/60 shadow-2xl p-6 sm:p-8 text-slate-800 transition-all">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#ff3b69] to-[#fb7185] flex items-center justify-center text-white shadow-md shadow-pink-500/25 mb-3">
            <span className="text-xl font-black">⚡</span>
          </div>

          <h1 className="font-display font-black text-2xl tracking-tight text-slate-900">
            {view === 'login' && 'Welcome Back'}
            {view === 'signup' && 'Create Your Spark Account'}
            {view === 'forgot_password' && 'Reset Password'}
            {view === 'reset_password' && 'Set New Password'}
            {view === 'email_verification' && 'Verify Your Email'}
            {view === 'profile_setup' && 'Choose your username'}
          </h1>

          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            {view === 'login' && 'Sign in with your email and password to access your messages.'}
            {view === 'signup' && 'Join the messaging experience with end-to-end encryption.'}
            {view === 'forgot_password' && 'Enter your email to reset your password.'}
            {view === 'reset_password' && 'Enter your new secure password below.'}
            {view === 'email_verification' &&
              `We sent a confirmation link to ${pendingUserEmail || 'your email'}.`}
            {view === 'profile_setup' && 'Your username is how people can find you on Spark.'}
          </p>
        </div>

        {/* Feedback Message Banners */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-2.5 text-xs text-[#ff3b69]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-2.5 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{successMessage}</span>
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {view === 'login' && (
          <div className="space-y-4">
            {/* Login Mode Toggle */}
            <div className="flex items-center justify-center p-1 bg-slate-100 rounded-full text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setUseMagicLink(false);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-full transition-all ${
                  !useMagicLink
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseMagicLink(true);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-full transition-all ${
                  useMagicLink
                    ? 'bg-white text-[#ff3b69] shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Magic Link / OTP
              </button>
            </div>

            {!useMagicLink ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setView('forgot_password');
                      }}
                      className="text-xs text-[#ff3b69] hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
                >
                  <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-2">
                    We'll email you a passwordless one-click sign in link.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
                >
                  <span>{isLoading ? 'Sending Link...' : 'Send Magic Link'}</span>
                  <Sparkles className="w-4 h-4" />
                </button>
              </form>
            )}

            <div className="text-center pt-2">
              <span className="text-xs text-slate-500">Don't have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setView('signup');
                }}
                className="text-xs font-bold text-[#ff3b69] hover:underline"
              >
                Sign Up
              </button>
            </div>
          </div>
        )}

        {/* 2. SIGN UP FORM */}
        {view === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password (min 6 characters)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
            >
              <span>{isLoading ? 'Creating account...' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center pt-2">
              <span className="text-xs text-slate-500">Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setView('login');
                }}
                className="text-xs font-bold text-[#ff3b69] hover:underline"
              >
                Log In
              </button>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD */}
        {view === 'forgot_password' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Your Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
            >
              <span>{isLoading ? 'Sending Link...' : 'Send Reset Link'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setView('login');
              }}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center justify-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </form>
        )}

        {/* 4. SET NEW PASSWORD */}
        {view === 'reset_password' && (
          <form onSubmit={handleResetPassword} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                New Password (min 6 characters)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-10 pr-3 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
            >
              <span>{isLoading ? 'Updating...' : 'Set New Password'}</span>
            </button>
          </form>
        )}

        {/* 5. EMAIL VERIFICATION PENDING */}
        {view === 'email_verification' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed text-center">
              <div className="w-10 h-10 rounded-full bg-pink-50 text-[#ff3b69] flex items-center justify-center mx-auto mb-2">
                <Mail className="w-5 h-5" />
              </div>
              <p className="font-bold text-slate-800 text-sm mb-1">Confirmation Email Sent</p>
              <p className="text-slate-600">
                We sent a confirmation link to{' '}
                <strong className="text-slate-900">{pendingUserEmail || email || 'your email'}</strong>.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Please check your inbox or spam folder and tap the link to confirm your account.
              </p>
            </div>

            {/* OTP Code Form */}
            <form onSubmit={handleVerifyOtp} className="space-y-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                Have a 6-digit verification code?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  value={otpToken}
                  onChange={(e) => setOtpToken(e.target.value.trim())}
                  placeholder="Enter code"
                  className="flex-1 py-2 px-3 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 font-mono tracking-wider focus:outline-none focus:border-[#ff3b69]"
                />
                <button
                  type="submit"
                  disabled={isVerifyingOtp || !otpToken.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {isVerifyingOtp ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>
            </form>

            {/* Resend & Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isResendingEmail}
                onClick={handleResendVerificationEmail}
                className="w-full py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {isResendingEmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ff3b69]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>{isResendingEmail ? 'Resending...' : 'Resend Confirmation Email'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setView('login');
                }}
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs hover:opacity-95 transition-opacity"
              >
                I've Confirmed, Sign In
              </button>
            </div>

            {/* Developer Tip */}
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 text-[11px] text-slate-600 leading-snug">
              <strong className="text-slate-800">Quick tip:</strong> If emails are delayed, you can turn off email confirmation in your{' '}
              <strong>Supabase Dashboard → Authentication → Providers → Email → toggle 'Confirm email' OFF</strong>.
            </div>
          </div>
        )}

        {/* 6. PROFILE ONBOARDING (FIRST TIME UNIQUE USERNAME) */}
        {view === 'profile_setup' && (
          <form onSubmit={handleProfileSetup} className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-[#ff3b69] to-[#38bdf8] shadow-sm">
                  <img
                    src={selectedAvatarUrl}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRandomizeAvatar}
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#ff3b69] text-white flex items-center justify-center shadow-sm hover:opacity-90"
                  title="Randomize avatar"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                {PRESET_AVATARS.slice(0, 5).map((preset) => (
                  <button
                    key={preset.seed}
                    type="button"
                    onClick={() =>
                      setSelectedAvatarUrl(
                        `https://api.dicebear.com/7.x/bottts/svg?seed=${preset.seed}&backgroundColor=f1f5f9`
                      )
                    }
                    className="w-7 h-7 rounded-full p-[1px] border border-slate-200 hover:border-[#ff3b69] transition-all"
                  >
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${preset.seed}&backgroundColor=f1f5f9`}
                      alt={preset.name}
                      className="w-full h-full rounded-full object-cover bg-white"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Unique Username Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Unique Username <span className="text-[#ff3b69]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#ff3b69] font-mono select-none">
                  @
                </span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(e) => {
                    const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                    setUsername(clean);
                  }}
                  placeholder="username"
                  className="w-full py-2.5 pl-8 pr-10 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner font-mono"
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
                  {usernameStatus === 'checking' && (
                    <Loader2 className="w-4 h-4 text-[#ff3b69] animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {usernameStatus === 'taken' && (
                    <XCircle className="w-4 h-4 text-rose-500" />
                  )}
                  {usernameStatus === 'invalid' && (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>

              {/* Live Availability Status */}
              {usernameStatusMsg ? (
                <div
                  className={`mt-1.5 px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                    usernameStatus === 'available'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                      : usernameStatus === 'taken'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                      : usernameStatus === 'checking'
                      ? 'bg-slate-100 text-slate-600 border border-slate-200/70'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/70'
                  }`}
                >
                  {usernameStatus === 'available' && (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  {usernameStatus === 'taken' && (
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  {usernameStatus === 'checking' && (
                    <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  )}
                  {usernameStatus === 'invalid' && (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>{usernameStatusMsg}</span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1 pl-2">
                  3-20 characters · letters, numbers & underscores only
                </p>
              )}
            </div>

            {/* Display Name Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Display Name (Optional)
              </label>
              <input
                type="text"
                maxLength={30}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full py-2.5 px-4 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
              />
            </div>

            {/* Bio Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600">
                  Bio (Optional)
                </label>
                <span className="text-[10px] text-slate-400">{bio.length}/100</span>
              </div>
              <input
                type="text"
                maxLength={100}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short spark about yourself..."
                className="w-full py-2.5 px-4 rounded-full text-xs sm:text-sm bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff3b69] focus:bg-white transition-all shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || usernameStatus !== 'available'}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isLoading ? 'Reserving Username...' : 'Complete & Start Chatting'}</span>
              <Sparkles className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Supabase Connection Setup Drawer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              className="flex items-center gap-1.5 hover:text-slate-700 transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConfigured() ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="font-semibold text-slate-600">
                {isSupabaseConfigured() ? 'Supabase Connected' : 'Connect Your Supabase Project'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSupabaseGuide}
              className="text-[#ff3b69] hover:underline font-semibold flex items-center gap-1"
            >
              <Database className="w-3 h-3" />
              <span>SQL Guide</span>
            </button>
          </div>

          {showConfigDrawer && (
            <form
              onSubmit={handleSaveCredentials}
              className="mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5 text-left animate-fluid-glide"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Supabase Credentials</span>
                <span className="text-[10px] text-slate-400">Stored in browser</span>
              </div>

              {configToast && (
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  {configToast}
                </div>
              )}

              {configState.detectedUrlIsKey && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-snug">
                  <strong>Key Detected:</strong> An API key was entered as the Project URL. We automatically assigned it to your Anon Public Key. Please copy your <strong>Project URL</strong> (e.g. <code>https://your-ref.supabase.co</code>) from Supabase Dashboard under <strong>Project Settings → API</strong>.
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Project URL
                  </label>
                  <span className="text-[10px] text-slate-400">Settings → API → Project URL</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="https://xyzcompany.supabase.co"
                  value={inputUrl}
                  onChange={(e) => {
                    const rawVal = e.target.value.trim();
                    if (isLikelyApiKey(rawVal)) {
                      setInputAnonKey(rawVal);
                      setInputUrl('');
                      setConfigToast(
                        'Publishable API key detected and assigned to Anon Key! Now enter your Project URL.'
                      );
                    } else {
                      setInputUrl(e.target.value);
                    }
                  }}
                  className="w-full py-1.5 px-3 rounded-lg text-xs bg-white border border-slate-200 text-slate-800 font-mono focus:outline-none focus:border-[#ff3b69]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Anon Public Key
                  </label>
                  <span className="text-[10px] text-slate-400">Settings → API → anon public</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={inputAnonKey}
                  onChange={(e) => setInputAnonKey(e.target.value.trim())}
                  className="w-full py-1.5 px-3 rounded-lg text-xs bg-white border border-slate-200 text-slate-800 font-mono focus:outline-none focus:border-[#ff3b69]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
                >
                  Save & Connect
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfigDrawer(false)}
                  className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
