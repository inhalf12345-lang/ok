import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/meetings.space.created'];

let cachedAuthInstance: Auth | null = null;
let cachedProviderInstance: GoogleAuthProvider | null = null;

function getSafeFirebaseAuth(): { auth: Auth | null; provider: GoogleAuthProvider | null } {
  try {
    if (!cachedAuthInstance) {
      if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
        return { auth: null, provider: null };
      }
      const app: FirebaseApp =
        getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      cachedAuthInstance = getAuth(app);
    }
    if (!cachedProviderInstance) {
      cachedProviderInstance = new GoogleAuthProvider();
      SCOPES.forEach((scope) => cachedProviderInstance!.addScope(scope));
    }
    return { auth: cachedAuthInstance, provider: cachedProviderInstance };
  } catch (err) {
    console.warn('Firebase Auth lazy init notice:', err);
    return { auth: null, provider: null };
  }
}

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory ONLY (never in localStorage or sessionStorage).
let cachedAccessToken: string | null = null;

export interface GoogleMeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
}

/**
 * Initialize Firebase Auth state listener and clear cached access token on sign-out.
 */
export const initMeetGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
): (() => void) => {
  const { auth } = getSafeFirebaseAuth();
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }

  try {
    return onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        if (cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      } else {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    });
  } catch {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }
};

/**
 * Initiates Google OAuth popup sign-in to obtain a Google Meet access token.
 */
export const signInWithGoogleForMeet = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  const { auth, provider } = getSafeFirebaseAuth();
  if (!auth || !provider) {
    throw new Error('Google Sign-In is not configured for this domain.');
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Meet access token from Google Sign-In.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Meet sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getMeetAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentMeetGoogleUser = (): User | null => {
  const { auth } = getSafeFirebaseAuth();
  return auth?.currentUser || null;
};

export const signOutGoogleMeet = async (): Promise<void> => {
  const { auth } = getSafeFirebaseAuth();
  if (auth) {
    await auth.signOut();
  }
  cachedAccessToken = null;
};

/**
 * Creates a real Google Meet space using the Google Meet REST API v2.
 */
export async function createGoogleMeetSpace(): Promise<GoogleMeetSpace> {
  const accessToken = await getMeetAccessToken();
  if (!accessToken) {
    throw new Error('AUTH_REQUIRED');
  }

  const res = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to create Google Meet room (${res.status}). ${errBody || 'Please try again.'}`
    );
  }

  const data = await res.json();
  return {
    name: data.name || '',
    meetingUri:
      data.meetingUri || (data.meetingCode ? `https://meet.google.com/${data.meetingCode}` : ''),
    meetingCode: data.meetingCode || '',
  };
}
