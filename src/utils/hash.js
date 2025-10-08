import { SHA256 } from 'crypto-js'

export default function sha256Hash(data) {
  return SHA256(data).toString('hex')
}
