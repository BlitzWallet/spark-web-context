// Local browser testing helper

import { encryptMessageTest } from './utils/encription'
import { generateECDHKey } from './utils/encriptionKeys'

async function loadKeys() {
  const keyPair = await generateECDHKey()
  window.ecdhKeyPair = keyPair

  const deviceKeyPair = await generateECDHKey()
  window.devicePubkey = deviceKeyPair.publicKey
  window.testingPrivKey = deviceKeyPair.privateKey
}

async function sendTestingMessage(message) {
  console.log('Sending message', message)
  const encrypted = await encryptMessageTest(JSON.stringify(message))

  window.postMessage(
    JSON.stringify({
      type: 'secure:msg',
      encrypted: encrypted,
    })
  )
}

export { loadKeys, sendTestingMessage }
