import * as secp256k1 from '@noble/secp256k1'
import CryptoJS from 'crypto-js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'

// Generate ECDH key pair
async function generateECDHKey() {
  const privateKey = secp256k1.utils.randomSecretKey()
  const publicKey = secp256k1.getPublicKey(privateKey, true) // compressed
  return { privateKey, publicKey }
}

// Export public key as base64
async function exportPublicKey(key) {
  return btoa(String.fromCharCode(...key))
}

// Import public key from base64
async function importPublicKey(rawBase64) {
  return Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0))
}

// Derive session key using ECDH + HKDF
async function deriveSessionKey(privateKey, publicKey) {
  const sharedSecret = secp256k1.getSharedSecret(privateKey, publicKey)

  // Use HKDF to derive 32-byte key
  const info = new TextEncoder().encode('spark-handshake')
  const derived = hkdf(sha256, sharedSecret, undefined, info, 32)

  // Convert to WordArray for CryptoJS
  const hexKey = Array.from(derived)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return hexKey
}

// Encrypt with AES-CTR (matching format)
async function encryptMessage(plaintext) {
  const iv = CryptoJS.lib.WordArray.random(16) // 16 bytes for CTR
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey)

  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWordArray, {
    iv: iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  })

  return {
    iv: iv.toString(CryptoJS.enc.Base64),
    ct: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  }
}

// Decrypt with AES-CTR
async function decryptMessage({ iv, ct }) {
  const ivWordArray = CryptoJS.enc.Base64.parse(iv)
  const ctWordArray = CryptoJS.enc.Base64.parse(ct)
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey)

  const decrypted = CryptoJS.AES.decrypt({ ciphertext: ctWordArray }, keyWordArray, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  })

  return decrypted.toString(CryptoJS.enc.Utf8)
}

export { generateECDHKey, exportPublicKey, importPublicKey, deriveSessionKey, decryptMessage, encryptMessage }
