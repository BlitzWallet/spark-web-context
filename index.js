import * as Spark from "./src/index";
import * as secp256k1 from "@noble/secp256k1";
import CryptoJS from "crypto-js";

window.sessionKey = null;
window.ecdhKeyPair = {};

// Generate ECDH key pair using @noble/secp256k1
async function generateECDHKey() {
  const privateKey = secp256k1.utils.randomSecretKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
  return {
    privateKey,
    publicKey,
  };
}

// Export public key as base64
async function exportPublicKey(key) {
  return btoa(String.fromCharCode(...key));
}

// Import public key from base64
async function importPublicKey(rawBase64) {
  return Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
}

// Derive session key using ECDH
async function deriveSessionKey(privateKey, publicKey) {
  // Perform ECDH to get shared secret

  const sharedSecret = secp256k1.getSharedSecret(privateKey, publicKey);

  // Use the x-coordinate of the shared point (skip first byte which is the prefix)
  const secret = sharedSecret.slice(1, 33);

  // Generate salt
  const salt = CryptoJS.lib.WordArray.random(16);

  // Derive key using PBKDF2 (as HKDF alternative with crypto-js)
  const key = CryptoJS.PBKDF2(CryptoJS.lib.WordArray.create(secret), salt, {
    keySize: 256 / 32,
    iterations: 1000,
    hasher: CryptoJS.algo.SHA256,
  });

  // Store as hex string for use with crypto-js
  return key.toString(CryptoJS.enc.Hex);
}

// Encrypt message using AES-GCM (simulated with AES-CTR + HMAC)
async function encryptMessage(plaintext) {
  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(12);

  // Convert session key to WordArray
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey);

  // Encrypt using AES-CTR (crypto-js doesn't support GCM natively)
  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWordArray, {
    iv: iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });

  // Create HMAC for authentication (simulating GCM authentication)
  const hmac = CryptoJS.HmacSHA256(
    iv.concat(
      CryptoJS.enc.Base64.parse(
        encrypted.ciphertext.toString(CryptoJS.enc.Base64)
      )
    ),
    keyWordArray
  );

  return {
    iv: iv.toString(CryptoJS.enc.Base64),
    ct: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    tag: hmac.toString(CryptoJS.enc.Base64),
  };
}

// Decrypt message
async function decryptMessage({ iv, ct, tag }) {
  // Convert inputs to WordArray
  const ivWordArray = CryptoJS.enc.Base64.parse(iv);
  const ctWordArray = CryptoJS.enc.Base64.parse(ct);
  const keyWordArray = CryptoJS.enc.Hex.parse(window.sessionKey);

  // Verify HMAC
  const computedHmac = CryptoJS.HmacSHA256(
    ivWordArray.concat(ctWordArray),
    keyWordArray
  );

  if (computedHmac.toString(CryptoJS.enc.Base64) !== tag) {
    throw new Error("Authentication failed: message has been tampered with");
  }

  // Decrypt
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ctWordArray },
    keyWordArray,
    {
      iv: ivWordArray,
      mode: CryptoJS.mode.CTR,
      padding: CryptoJS.pad.NoPadding,
    }
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
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
    const { action, args, id } = data;

    if (action === "handshake:init" && args.pubN) {
      window.ecdhKeyPair = await generateECDHKey();
      const pubW = await exportPublicKey(window.ecdhKeyPair.publicKey);
      const nativePub = await importPublicKey(args.pubN);
      window.sessionKey = await deriveSessionKey(
        window.ecdhKeyPair.privateKey,
        nativePub
      );
      const response = {
        id,
        success: true,
        type: "handshake:reply",
        pubW,
        isResponse: true,
      };
      console.log("🔐 Session key established with native");
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
      return;
    }

    if (data.encrypted && window.sessionKey) {
      const decrypted = await decryptMessage(data.encrypted);
      const msg = JSON.parse(decrypted);
      data = msg;
      console.log("📩 Decrypted from native:", msg);
    }

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
