import * as Spark from "./src/index";

window.sessionKey = null;
window.ecdhKeyPair = {};

async function generateECDHKey() {
  return window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

async function exportPublicKey(key) {
  const raw = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importPublicKey(rawBase64) {
  const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

async function deriveSessionKey(privateKey, publicKey) {
  const secret = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hkdfKey = await window.crypto.subtle.importKey(
    "raw",
    secret,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("spark-handshake"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    window.sessionKey,
    encoded
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

async function decryptMessage({ iv, ct }) {
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ctBytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    window.sessionKey,
    ctBytes
  );
  return new TextDecoder().decode(pt);
}

async function startHandshake() {
  window.ecdhKeyPair = await generateECDHKey();
  const pubW = await exportPublicKey(window.ecdhKeyPair.publicKey);
  window.ReactNativeWebView.postMessage(
    JSON.stringify({ type: "handshake:init", pubW })
  );
}

// ✅ Mock WebView for browser testing
if (!window.ReactNativeWebView) {
  console.log("🧩 Mocking ReactNativeWebView for local testing...");
  window.ReactNativeWebView = {
    postMessage: (msg) => {
      console.log("[Mock postMessage] -> RN:", msg);
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent("message", { data: msg }));
      }, 500);
    },
  };
}

// ✅ Expose callable Spark functions to React Native
window.sparkAPI = {
  initializeSparkWallet: Spark.initializeSparkWallet,
  getSparkBalance: Spark.getSparkBalance,
  getSparkAddress: Spark.getSparkAddress,
  getSparkIdentityPubKey: Spark.getSparkIdentityPubKey,
  getSparkStaticBitcoinL1Address: Spark.getSparkStaticBitcoinL1Address,
  queryAllStaticDepositAddresses: Spark.queryAllStaticDepositAddresses,
  getSparkStaticBitcoinL1AddressQuote:
    Spark.getSparkStaticBitcoinL1AddressQuote,
  sendSparkPayment: Spark.sendSparkPayment,
  sendSparkTokens: Spark.sendSparkTokens,
  sendSparkLightningPayment: Spark.sendSparkLightningPayment,
  sendSparkBitcoinPayment: Spark.sendSparkBitcoinPayment,
  receiveSparkLightningPayment: Spark.receiveSparkLightningPayment,
  getSparkLightningPaymentStatus: Spark.getSparkLightningPaymentStatus,
  getSparkTransactions: Spark.getSparkTransactions,
  getSparkPaymentStatus: Spark.getSparkPaymentStatus,
  getSparkLightningPaymentFeeEstimate:
    Spark.getSparkLightningPaymentFeeEstimate,
  getSparkBitcoinPaymentRequest: Spark.getSparkBitcoinPaymentRequest,
  getSparkBitcoinPaymentFeeEstimate: Spark.getSparkBitcoinPaymentFeeEstimate,
  getSparkPaymentFeeEstimate: Spark.getSparkPaymentFeeEstimate,
  getSparkLightningSendRequest: Spark.getSparkLightningSendRequest,
  getSparkTokenTransactions: Spark.getSparkTokenTransactions,
};

// ✅ Allow React Native to trigger functions by posting a message
window.addEventListener("message", async (event) => {
  try {
    let data = JSON.parse(event.data);

    if (data.isResponse) return;

    if (data.type === "handshake:reply" && data.pubN) {
      const nativePub = await importPublicKey(data.pubN);
      window.sessionKey = await deriveSessionKey(
        window.ecdhKeyPair.privateKey,
        nativePub
      );
      console.log("🔐 Session key established with native");
      return;
    }

    if (data.encrypted && window.sessionKey) {
      const decrypted = await decryptMessage(data.encrypted);
      const msg = JSON.parse(decrypted);
      data = msg;
      console.log("📩 Decrypted from native:", msg);
    }

    const { action, args, id } = data;

    if (!window.sparkAPI[action]) {
      throw new Error(`Unknown Spark action: ${action}`);
    }

    const result = await window.sparkAPI[action](args);
    const response = {
      id,
      success: true,
      result: JSON.stringify(result),
      isResponse: true,
    };

    if (window.sessionKey) {
      const encrypted = await encryptMessage(JSON.stringify(response));
      window.ReactNativeWebView.postMessage(JSON.stringify({ encrypted }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
    }
  } catch (err) {
    console.error("Spark WebContext error:", err);
  }
});
startHandshake();
