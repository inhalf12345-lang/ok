/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Genuine End-to-End Encryption (E2EE) Service for Spark
 * 
 * Cryptographic Architecture:
 * - Key Agreement: ECDH (Elliptic Curve Diffie-Hellman) over NIST P-256 (secp256r1)
 * - Key Derivation: HKDF (RFC 5869) with SHA-256 and unique conversation salt
 * - Symmetric Authenticated Encryption: AES-256-GCM (NIST SP 800-38D)
 * - Nonce/IV: Cryptographically secure 96-bit (12-byte) random values generated via crypto.getRandomValues
 * - Private Key Storage: Local device IndexedDB (never transmitted to any server or Supabase)
 * - Public Key Distribution: Distributed via Supabase user_crypto_keys table (JWK format)
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

const DB_NAME = 'SparkE2EESecretsStore';
const DB_VERSION = 1;
const STORE_NAME = 'device_identity_keys';

export const E2EE_VERSION = 'e2ee_ecdh_aes_gcm_v1';

// In-memory cache for derived conversation symmetric keys (purged on logout)
const conversationKeyCache = new Map<string, CryptoKey>();

// Helper: Open secure IndexedDB for device private keys
function openDeviceKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available on this platform.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Convert ArrayBuffer / Uint8Array to Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Retrieves the device identity keypair from IndexedDB or generates a new ECDH P-256 pair.
 * The private key NEVER leaves the local device storage.
 */
export async function getOrCreateDeviceIdentityKeyPair(
  userId: string
): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const db = await openDeviceKeyDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(userId);

    getReq.onsuccess = async () => {
      const existing = getReq.result;

      if (existing && existing.privateKeyJwk && existing.publicKeyJwk) {
        try {
          const privateKey = await crypto.subtle.importKey(
            'jwk',
            existing.privateKeyJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey', 'deriveBits']
          );

          const publicKey = await crypto.subtle.importKey(
            'jwk',
            existing.publicKeyJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            []
          );

          resolve({ publicKey, privateKey, publicJwk: existing.publicKeyJwk });
          return;
        } catch (e) {
          console.warn('Failed to import existing keypair, regenerating:', e);
        }
      }

      // Generate a fresh ECDH P-256 keypair
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'ECDH', namedCurve: 'P-256' },
          true, // extractable so we can persist in local device IndexedDB
          ['deriveKey', 'deriveBits']
        );

        const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
        const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

        // Store private and public JWK in device IndexedDB
        const writeTx = db.transaction(STORE_NAME, 'readwrite');
        const writeStore = writeTx.objectStore(STORE_NAME);
        writeStore.put({
          userId,
          privateKeyJwk,
          publicKeyJwk,
          createdAt: new Date().toISOString(),
        });

        writeTx.oncomplete = () => {
          resolve({
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            publicJwk: publicKeyJwk,
          });
        };
        writeTx.onerror = () => reject(writeTx.error);
      } catch (genErr) {
        reject(genErr);
      }
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Publishes the current user's public identity key to Supabase.
 * ONLY public key material is sent. The private key remains exclusively on the device.
 */
export async function syncPublicKeyToSupabase(
  userId: string,
  publicJwk: JsonWebKey
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const payload = {
      user_id: userId,
      public_key: publicJwk,
      algorithm: 'ECDH-P256',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_crypto_keys')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.warn('Could not sync public key to Supabase (run SQL migration if table is missing):', error.message);
    }
  } catch (err) {
    console.warn('Error in syncPublicKeyToSupabase:', err);
  }
}

/**
 * Fetches the recipient's public key from Supabase.
 */
export async function fetchRecipientPublicKey(recipientUserId: string): Promise<CryptoKey | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_crypto_keys')
      .select('public_key')
      .eq('user_id', recipientUserId)
      .maybeSingle();

    if (error || !data?.public_key) {
      return null;
    }

    const importedKey = await crypto.subtle.importKey(
      'jwk',
      data.public_key,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    return importedKey;
  } catch (err) {
    console.warn('Failed to fetch/import recipient public key:', err);
    return null;
  }
}

/**
 * Derives the shared conversation AES-256-GCM symmetric key using ECDH + HKDF-SHA256.
 * Both User A and User B compute the exact same key:
 * ECDH(A_priv, B_pub) === ECDH(B_priv, A_pub)
 * Derived via HKDF with the conversationId as salt.
 */
export async function deriveConversationKey(
  myPrivateKey: CryptoKey,
  otherPublicKey: CryptoKey,
  conversationId: string
): Promise<CryptoKey> {
  const cacheKey = `${conversationId}`;
  if (conversationKeyCache.has(cacheKey)) {
    return conversationKeyCache.get(cacheKey)!;
  }

  // 1. Derive 256 bits of raw shared secret using ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: otherPublicKey },
    myPrivateKey,
    256
  );

  // 2. Import raw shared secret into HKDF
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // 3. Derive 256-bit AES-GCM conversation key with conversation salt
  const encoder = new TextEncoder();
  const salt = encoder.encode(`Spark-Salt-${conversationId}`);
  const info = encoder.encode('Spark-E2EE-v1-ConversationAESKey');

  const conversationKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable from memory
    ['encrypt', 'decrypt']
  );

  conversationKeyCache.set(cacheKey, conversationKey);
  return conversationKey;
}

/**
 * Encrypts a message using AES-256-GCM with a unique, cryptographically random 12-byte IV.
 * NEVER reuses an IV.
 */
export async function encryptE2EEMessage(
  plaintext: string,
  conversationKey: CryptoKey
): Promise<{ ciphertext: string; iv: string; version: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Cryptographically secure 12-byte (96-bit) IV as specified by NIST for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    conversationKey,
    plaintextBytes
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
    version: E2EE_VERSION,
  };
}

/**
 * Decrypts an encrypted message using AES-256-GCM.
 * Validates authentication tag and detects any tampering.
 * Returns null if decryption fails (tampering, wrong key, corruption).
 */
export async function decryptE2EEMessage(
  ciphertextBase64: string,
  ivBase64: string,
  conversationKey: CryptoKey
): Promise<string | null> {
  try {
    const ciphertext = base64ToUint8Array(ciphertextBase64);
    const iv = base64ToUint8Array(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      conversationKey,
      ciphertext as unknown as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    // Cryptographic failure (authentication tag mismatch, corrupted data, wrong key)
    return null;
  }
}

/**
 * Purges in-memory cryptographic session caches on user signout.
 */
export function purgeCryptoSessionMemory(): void {
  conversationKeyCache.clear();
}
