// Local browser testing helper
import { encryptMessage } from './utils/encription'
import { generateECDHKey } from './utils/encriptionKeys'

async function loadKeys() {
  const keyPair = await generateECDHKey()
  const deviceKeyPair = await generateECDHKey()

  return {
    window: keyPair,
    device: deviceKeyPair,
  }
}

async function sendTestingMessage(priv, pub, message, useEncryption) {
  if (useEncryption) {
    const encrypted = await encryptMessage(priv, pub, JSON.stringify(message))
    console.log('Sending message', message, encrypted)
    window.postMessage(
      JSON.stringify({
        type: 'secure:msg',
        encrypted: encrypted,
      })
    )
  }
  window.postMessage(
    JSON.stringify({
      ...message,
    })
  )
}

export { loadKeys, sendTestingMessage }
