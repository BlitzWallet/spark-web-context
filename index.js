import { SparkAPI } from "./src/spark.js";
import { loadKeys, sendTestingMessage } from "./src/tests.js";
import {
  decryptMessage,
  deriveAesKey,
  encryptMessage,
} from "./src/utils/encription.js";
import { generateECDHKey } from "./src/utils/encriptionKeys.js";

// Encapsulate logic to avoid global variables
(function initializeSparkWebContext(ReactNativeWebView) {
  let sparkAPI = SparkAPI({
    sharedKey: null,
    ReactNativeWebView: window.ReactNativeWebView,
  });
  let sharedKey = null;
  const processedMessageIds = new Set();
  let expectedSequence = 0;
  let handshakeComplete = false;
  let handshakeInProgress = false;
  const MESSAGE_TIMEOUT_MS = 30000; // 30 seconds

  async function handleMessage(event) {
    try {
      if (typeof event.data !== "string") return;
      const receivedAt = Date.now();
      let data = JSON.parse(event.data);

      if (data.isResponse) return;

      if (data.id && processedMessageIds.has(data.id)) {
        console.log(`Duplicate message ID ${data.id} ignored`);
        return;
      }

      // Verify the nonce was properly injected
      if (
        !window.__STARTUP_NONCE__ ||
        window.__STARTUP_NONCE__ === "__INJECT_NONCE__"
      ) {
        throw new Error("Security error: Startup nonce not properly injected");
      }

      if (data?.action === "handshake:init" && data?.args?.pubN) {
        if (handshakeComplete) {
          throw new Error(
            "Handshake already complete, ignoring subsequent attempt"
          );
        }
        if (handshakeInProgress) {
          throw new Error(
            "Handshake already in progress, ignoring subsequent attempt"
          );
        }
        handshakeInProgress = true;

        const ecdhKeyPair = await generateECDHKey();
        sharedKey = deriveAesKey(
          ecdhKeyPair.privateKey,
          data.args.pubN,
          window.__STARTUP_NONCE__
        );

        // Reinitialize SparkAPI with encryption keys and WebView
        sparkAPI = SparkAPI({
          sharedKey,
          ReactNativeWebView: window.ReactNativeWebView,
        });

        const response = {
          id: data.id,
          success: true,
          type: "handshake:reply",
          pubW: Buffer.from(ecdhKeyPair.publicKey).toString("hex"),
          runtimeNonce: await encryptMessage(
            sharedKey,
            window.__STARTUP_NONCE__
          ),
          isResponse: true,
        };
        console.log("Session key established with native");
        processedMessageIds.add(data.id);
        handshakeComplete = true;
        expectedSequence = 1;
        ReactNativeWebView.postMessage(JSON.stringify(response));
        return;
      }

      if (!handshakeComplete) {
        throw new Error("Received message before handshake complete");
      }

      if (data.encrypted) {
        const decrypted = await decryptMessage(sharedKey, data.encrypted);
        const msg = JSON.parse(decrypted);
        data = msg;
      }

      if (data.id && processedMessageIds.has(data.id)) {
        console.log(`Duplicate message ID ${data.id} ignored`);
        return;
      }

      // Validate sequence number (prevent replay)
      if (typeof data.sequence === "number") {
        if (data.sequence < expectedSequence) {
          throw new Error(
            `SECURITY: Rejected old message: seq ${data.sequence} < ${expectedSequence}`
          );
        }
        if (data.sequence !== expectedSequence) {
          throw new Error(
            `SECURITY: Sequence gap: expected ${expectedSequence}, got ${data.sequence}`
          );
        }
        expectedSequence = data.sequence + 1;
      }

      // Validate timestamp (prevent very old replays)
      if (typeof data.timestamp === "number") {
        const wallTimeElapsed = receivedAt - data.timestamp;

        const wasHidden = document.hidden;
        const MAX_HIDDEN_GRACE = 3 * 60_000;

        if (
          wallTimeElapsed >
          MESSAGE_TIMEOUT_MS + (wasHidden ? MAX_HIDDEN_GRACE : 0)
        ) {
          throw new Error(
            `SECURITY: Rejected stale message: ${wallTimeElapsed}ms old`
          );
        }

        if (wallTimeElapsed < -5000) {
          throw new Error(
            `SECURITY: Rejected future message: ${wallTimeElapsed}ms in future`
          );
        }
      }

      processedMessageIds.add(data.id);

      if (data.action === "simulate_crash") {
        throw new Error("Crash simulation not allowed in production");
      }

      if (!sparkAPI[data.action]) {
        throw new Error(`Unknown Spark action: ${data.action}`);
      }

      const result = await sparkAPI[data.action](data.args);
      const response = {
        id: data.id,
        success: true,
        result: JSON.stringify(result),
        isResponse: true,
      };
      data = null; //clear data field after use

      const encrypted = await encryptMessage(
        sharedKey,
        JSON.stringify(response)
      );
      ReactNativeWebView.postMessage(
        JSON.stringify({ encrypted, isResponse: true })
      );
    } catch (err) {
      console.log("Spark WebContext error:", err);
      if (sharedKey) {
        const encrypted = await encryptMessage(
          sharedKey,
          JSON.stringify({ error: err.message })
        );
        ReactNativeWebView.postMessage(
          JSON.stringify({ encrypted, isResponse: true })
        );
      }
    }
  }
  async function handleCSPViolation(event) {
    const violation = {
      type: "security:csp-violation",
      blocked: event.blockedURI,
      directive: event.violatedDirective,
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
    };

    console.error("CSP VIOLATION:", violation);

    if (sharedKey) {
      const encrypted = await encryptMessage(
        sharedKey,
        JSON.stringify(violation)
      );
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({
          encrypted,
          isResponse: true,
        })
      );
    } else {
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({
          ...violation,
          isResponse: true,
          unencrypted: true,
        })
      );
    }
  }

  // Attach event listeners
  window.addEventListener("message", handleMessage);
  document.addEventListener("message", handleMessage);
  document.addEventListener("securitypolicyviolation", handleCSPViolation);

  // Expose sparkAPI to React Native
  // window.sparkAPI = sparkAPI;

  // Clean up testing code (commented out, but removed for prod)
  // async function runTests() {
  //   const keys = await loadKeys();
  //   let windowKeys = keys.window;
  //   let deviceKeys = keys.device;
  //   sendTestingMessage(
  //     deviceKeys?.privateKey,
  //     windowKeys.publicKey,
  //     {
  //       id: 1,
  //       action: "handshake:init",
  //       args: { pubN: Buffer.from(deviceKeys.publicKey).toString("hex") },
  //     },
  //     false
  //   );

  //   setTimeout(() => {
  //     sendTestingMessage(deviceKeys.privateKey, windowKeys.publicKey, {
  //       id: 1,
  //       action: "initializeSparkWallet",
  //       args: {
  //         mnemonic:
  //           "corn staff coin tuna senior reform liar grass forward where during blanket",
  //       },
  //     });
  //   }, 5000);
  //   setTimeout(() => {
  //     sendTestingMessage(deviceKeys.privateKey, windowKeys.publicKey, {
  //       id: 1,
  //       action: "getSparkAddress",
  //       args: {
  //         mnemonic:
  //           "f90f3daaa11f8377781bd62a304b5c1ae4b481a330d495cf6a48839fab4c1a90",
  //       },
  //     });
  //   }, 7000);
  // }
  // runTests();
})(window.ReactNativeWebView);
