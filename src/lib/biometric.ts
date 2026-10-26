const BIOMETRIC_CREDENTIAL_KEY = "nexus-mail:biometric-credential:v1";

function bytesToBase64(value: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, byte => byte.charCodeAt(0));
}

function challenge() {
  const value = new Uint8Array(32);
  crypto.getRandomValues(value);
  return value;
}

export function biometricAvailable() {
  return typeof window !== "undefined" && window.isSecureContext && !!window.PublicKeyCredential && !!navigator.credentials;
}

export function hasBiometricCredential() {
  return typeof window !== "undefined" && !!window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
}

/** Registers the device authenticator. The private key remains in the device. */
export async function enrollBiometric() {
  if (!biometricAvailable()) throw new Error("Face ID / Touch ID exige une connexion HTTPS et un navigateur compatible.");
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(), rp: { name: "Nexus Mail" },
      user: { id: userId, name: "nexus-mail", displayName: "Nexus Mail" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { userVerification: "required", residentKey: "preferred" }, timeout: 60_000,
    },
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error("La configuration biométrique a été annulée.");
  window.localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, bytesToBase64(credential.rawId));
}

/** Prompts the platform authenticator before unlocking this browser session. */
export async function verifyBiometric() {
  if (!biometricAvailable()) throw new Error("Face ID / Touch ID n’est pas disponible sur cet appareil.");
  const id = window.localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  if (!id) throw new Error("Aucun verrou biométrique n’est configuré sur cet appareil.");
  const assertion = await navigator.credentials.get({
    publicKey: { challenge: challenge(), allowCredentials: [{ type: "public-key", id: base64ToBytes(id) }], userVerification: "required", timeout: 60_000 },
  });
  if (!assertion) throw new Error("L’authentification biométrique a été annulée.");
}

export function clearBiometric() {
  if (typeof window !== "undefined") window.localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
}
