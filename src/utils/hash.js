import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js'

export default function sha256Hash(data) {
  const bytes = typeof data === 'string' ? utf8ToBytes(data) : data

  const hash = sha256(bytes)
  const hex = bytesToHex(hash)

  return hex
}
