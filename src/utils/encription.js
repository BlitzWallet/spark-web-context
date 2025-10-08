import * as secp256k1 from '@noble/secp256k1'
import CryptoJS from 'crypto-js'

// Generate ECDH key pair using @noble/secp256k1
async function generateECDHKey() {
  const privateKey = secp256k1.utils.randomSecretKey()
  const publicKey = secp256k1.getPublicKey(privateKey, false) // uncompressed
  return {
    privateKey,
    publicKey,
  }
}

// Export public key as base64
async function exportPublicKey(key) {
  return btoa(String.fromCharCode(...key))
}

// Import public key from base64
async function importPublicKey(rawBase64) {
  return Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0))
}

// Derive session key using ECDH
async function deriveSessionKey(privateKey, publicKey) {
  // Perform ECDH to get shared secret

  const sharedSecret = secp256k1.getSharedSecret(privateKey, publicKey)

  // Use the x-coordinate of the shared point (skip first byte which is the prefix)
  const secret = sharedSecret.slice(1, 33)

  // Generate salt
  const salt = CryptoJS.lib.WordArray.random(16)

  // Derive key using PBKDF2 (as HKDF alternative with crypto-js)
  const key = CryptoJS.PBKDF2(CryptoJS.lib.WordArray.create(secret), salt, {
    keySize: 256 / 32,
    iterations: 1000,
    hasher: CryptoJS.algo.SHA256,
  })

  // Store as hex string for use with crypto-js
  return key.toString(CryptoJS.enc.Hex)
}

// Encrypt message using AES-GCM (simulated with AES-CTR + HMAC)
async function encryptMessage(plaintext) {
  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(12)

  // Convert session key to WordArray
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey)

  // Encrypt using AES-CTR (crypto-js doesn't support GCM natively)
  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWordArray, {
    iv: iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  })

  // Create HMAC for authentication (simulating GCM authentication)
  const hmac = CryptoJS.HmacSHA256(
    iv.concat(CryptoJS.enc.Base64.parse(encrypted.ciphertext.toString(CryptoJS.enc.Base64))),
    keyWordArray
  )

  return {
    iv: iv.toString(CryptoJS.enc.Base64),
    ct: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    tag: hmac.toString(CryptoJS.enc.Base64),
  }
}

// Decrypt message
async function decryptMessage({ iv, ct, tag }) {
  // Convert inputs to WordArray
  const ivWordArray = CryptoJS.enc.Base64.parse(iv)
  const ctWordArray = CryptoJS.enc.Base64.parse(ct)
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey)

  // Verify HMAC
  const computedHmac = CryptoJS.HmacSHA256(ivWordArray.concat(ctWordArray), keyWordArray)

  if (computedHmac.toString(CryptoJS.enc.Base64) !== tag) {
    throw new Error('Authentication failed: message has been tampered with')
  }

  // Decrypt
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: ctWordArray }, keyWordArray, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  })

  return decrypted.toString(CryptoJS.enc.Utf8)
}

export { generateECDHKey, exportPublicKey, importPublicKey, deriveSessionKey, decryptMessage, encryptMessage }
