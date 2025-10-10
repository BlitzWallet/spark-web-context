import { aes256gcm } from '@ecies/ciphers/aes' // Add to WebView JS
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { getSharedSecret } from '@noble/secp256k1'
import { btoa } from './base64' // Your existing base64 util

// helpers
const hexToUint8 = (hex) => {
  if (hex instanceof Uint8Array) return hex
  if (typeof hex !== 'string') throw new Error('Expected hex string or Uint8Array')

  const arr = new Uint8Array(hex.length / 2)

  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16)

  return arr
}
const uint8ToWordArray = (u8) => CryptoJS.lib.WordArray.create(u8)
const arrayBufferToBase64 = (buf) => {
  // buf is BufferSource / Uint8Array
  let binary = ''
  const bytes = new Uint8Array(buf)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
const base64ToWordArray = (b64) => CryptoJS.enc.Base64.parse(b64)

function deriveAesKeyFromSharedX(sharedXUint8) {
  const keyBytes = hkdf(sha256, sharedXUint8, new Uint8Array(0), new TextEncoder().encode('ecdh-aes-key'), 32)
  return keyBytes
}

export async function encryptMessage(priv, pub, text) {
  try {
    const privHex = typeof priv === 'string' ? priv : Buffer.from(priv).toString('hex')
    const pubHex = typeof pub === 'string' ? pub : Buffer.from(pub).toString('hex')

    const sharedPoint = getSharedSecret(hexToUint8(privHex), hexToUint8(pubHex), true)

    const sharedX = sharedPoint.slice(1, 33) // Uint8Array

    const aesKeyBytes = deriveAesKeyFromSharedX(sharedX) // Uint8Array(32)

    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12))
    const cipher = aes256gcm(aesKeyBytes, ivBytes) // Initialize GCM
    const encrypted = cipher.encrypt(new TextEncoder().encode(text)) // Uint8Array (ciphertext + 16-byte tag)
    const ciphertext = encrypted.slice(0, -16) // Extract ciphertext
    const authTag = encrypted.slice(-16) // Extract tag

    const ciphertextBase64 = arrayBufferToBase64(ciphertext)
    const ivBase64 = arrayBufferToBase64(ivBytes)
    const authTagBase64 = arrayBufferToBase64(authTag)
    return `${ciphertextBase64}?iv=${ivBase64}&tag=${authTagBase64}`
  } catch (err) {
    console.log('Web encryptMessage err', err)
    throw err
  }
}

export async function decryptMessage(priv, pub, encryptedText) {
  try {
    const privHex = typeof priv === 'string' ? priv : Buffer.from(priv).toString('hex')
    const pubHex = typeof pub === 'string' ? pub : Buffer.from(pub).toString('hex')

    const sharedPoint = getSharedSecret(hexToUint8(privHex), hexToUint8(pubHex), true)
    const sharedX = sharedPoint.slice(1, 33)
    const aesKeyBytes = deriveAesKeyFromSharedX(sharedX)
    if (!encryptedText.includes('?iv=') || !encryptedText.includes('&tag=')) {
      throw new Error('Missing IV or auth tag')
    }

    const [ciphertextBase64, params] = encryptedText.split('?iv=')
    const [ivBase64, authTagBase64] = params.split('&tag=')
    const iv = Buffer.from(ivBase64, 'base64')
    const ciphertext = Buffer.from(ciphertextBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')

    const cipher = aes256gcm(aesKeyBytes, iv)
    const encryptedData = new Uint8Array([...ciphertext, ...authTag]) // Concatenate ciphertext + tag
    const decrypted = cipher.decrypt(encryptedData) // Verifies tag, throws if invalid
    return new TextDecoder().decode(decrypted)
  } catch (err) {
    console.log('Web decryptMessage err', err)
    throw err
  }
}
