import { randomBytes } from '@noble/hashes/utils.js'
import { getPublicKey } from '@noble/secp256k1'

export async function generateECDHKey() {
  const privN = randomBytes(32)
  const pubN = getPublicKey(privN, true)
  return { privateKey: privN, publicKey: pubN }
}
