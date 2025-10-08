import CryptoJS from 'crypto-js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { getSharedSecret } from '@noble/secp256k1'
import { btoa } from './base64'

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

export async function encryptMessage(text) {
  try {
    const privHex =
      typeof window.ecdhKeyPair.privateKey === 'string'
        ? window.ecdhKeyPair.privateKey
        : Buffer.from(window.ecdhKeyPair.privateKey).toString('hex')
    const pubHex =
      typeof window.devicePubkey === 'string' ? window.devicePubkey : Buffer.from(window.devicePubkey).toString('hex')

    const sharedPoint = getSharedSecret(hexToUint8(privHex), hexToUint8(pubHex), true)

    const sharedX = sharedPoint.slice(1, 33) // Uint8Array

    const aesKeyBytes = deriveAesKeyFromSharedX(sharedX) // Uint8Array(32)
    const keyWA = uint8ToWordArray(aesKeyBytes)

    const ivBytes = window.crypto.getRandomValues(new Uint8Array(16))
    const ivWA = uint8ToWordArray(ivBytes)

    const encrypted = CryptoJS.AES.encrypt(text, keyWA, {
      iv: ivWA,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })

    const ivBase64 = arrayBufferToBase64(ivBytes)
    return `${encrypted.toString()}?iv=${ivBase64}`
  } catch (err) {
    console.error('Web encryptMessage err', err)
    throw err
  }
}
export async function encryptMessageTest(text) {
  try {
    const privHex =
      typeof window.testingPrivKey === 'string'
        ? window.testingPrivKey
        : Buffer.from(window.testingPrivKey).toString('hex')
    const pubHex =
      typeof window.ecdhKeyPair.publicKey === 'string'
        ? window.ecdhKeyPair.publicKey
        : Buffer.from(window.ecdhKeyPair.publicKey).toString('hex')

    const sharedPoint = getSharedSecret(hexToUint8(privHex), hexToUint8(pubHex), true)
    const sharedX = sharedPoint.slice(1, 33) // Uint8Array

    const aesKeyBytes = deriveAesKeyFromSharedX(sharedX) // Uint8Array(32)
    const keyWA = uint8ToWordArray(aesKeyBytes)

    const ivBytes = window.crypto.getRandomValues(new Uint8Array(16))
    const ivWA = uint8ToWordArray(ivBytes)

    const encrypted = CryptoJS.AES.encrypt(text, keyWA, {
      iv: ivWA,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })

    const ivBase64 = arrayBufferToBase64(ivBytes)
    return `${encrypted.toString()}?iv=${ivBase64}`
  } catch (err) {
    console.error('Web encryptMessage err', err)
    throw err
  }
}

export async function decryptMessage(encryptedText) {
  try {
    const privHex =
      typeof window.ecdhKeyPair.privateKey === 'string'
        ? window.ecdhKeyPair.privateKey
        : Buffer.from(window.ecdhKeyPair.privateKey).toString('hex')
    const pubHex =
      typeof window.devicePubkey === 'string' ? window.devicePubkey : Buffer.from(window.devicePubkey).toString('hex')

    const sharedPoint = getSharedSecret(hexToUint8(privHex), hexToUint8(pubHex), true)
    const sharedX = sharedPoint.slice(1, 33)
    const aesKeyBytes = deriveAesKeyFromSharedX(sharedX)
    const keyWA = uint8ToWordArray(aesKeyBytes)

    if (!encryptedText.includes('?iv=')) throw new Error('Missing IV')
    const [ciphertext, ivBase64] = encryptedText.split('?iv=')
    const ivWA = base64ToWordArray(ivBase64)

    const decrypted = CryptoJS.AES.decrypt(ciphertext, keyWA, {
      iv: ivWA,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })

    const plaintext = decrypted.toString(CryptoJS.enc.Utf8)
    return plaintext
  } catch (err) {
    console.error('Web decryptMessage err', err)
    throw err
  }
}
