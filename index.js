import { SparkAPI } from "./src/spark.js";
import { loadKeys, sendTestingMessage } from "./src/tests.js";
import {
  decryptMessage,
  deriveAesKey,
  encryptMessage,
} from "./src/utils/encription.js";
import { generateECDHKey } from "./src/utils/encriptionKeys.js";
import { createDuplicateIdGuard } from "./src/utils/duplicateIds.js";

// D-17 + keep-alive plan §4: the bounded duplicate-id cache is the sole
// in-session replay guard (the sequence protocol is deleted, D-2) AND the
// id→outcome cache that makes a re-sent request id deterministic: an in-flight
// id awaits the original dispatch's promise, a done id re-posts the stored
// result — a re-sent id NEVER re-executes. Eviction is SIZE-based only (never
// time-based) so a request backgrounded for any length can still be resumed
// deterministically: evict oldest beyond the cap; done results capped ~50.
// GCM + the fresh per-load nonce already bar cross-session forgery, so
// evicted ids may legally be re-accepted (they re-execute like a fresh
// request).
const MAX_PROCESSED_IDS = 512;
const MAX_CACHED_RESULTS = 50;

// Encapsulate logic to avoid global variables
(function initializeSparkWebContext(ReactNativeWebView) {
  let sparkAPI = SparkAPI({
    sharedKey: null,
    ReactNativeWebView: window.ReactNativeWebView,
  });
  let sharedKey = null;
  const duplicateIds = createDuplicateIdGuard({
    maxSize: MAX_PROCESSED_IDS,
    maxResults: MAX_CACHED_RESULTS,
  });
  let handshakeComplete = false;
  let handshakeInProgress = false;

  async function handleMessage(event) {
    try {
      if (typeof event.data !== "string") return;
      const receivedAt = Date.now();
      let data = JSON.parse(event.data);
      // Captured before decryption reassigns `data` — the error path below is
      // id-bearing (D-3/D-12) so a failed request settles that request only.
      let requestId = data.id;

      if (data.isResponse) return;

      if (requestId && duplicateIds.get(requestId, receivedAt)) {
        const cached = duplicateIds.get(requestId, receivedAt);
        if (cached.state === "in-flight") {
          console.log(
            `Re-sent message ID ${requestId} in flight - awaiting real outcome`
          );
          const response = await cached.promise;
          ReactNativeWebView.postMessage(JSON.stringify(response));
        } else {
          console.log(
            `Re-sent message ID ${requestId} done - re-posting stored result`
          );
          ReactNativeWebView.postMessage(JSON.stringify(cached.response));
        }
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
        duplicateIds.setDone(requestId, response, receivedAt);
        handshakeComplete = true;
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
        requestId = data.id;
      }

      if (requestId && duplicateIds.get(requestId, receivedAt)) {
        const cached = duplicateIds.get(requestId, receivedAt);
        if (cached.state === "in-flight") {
          console.log(
            `Re-sent message ID ${requestId} in flight - awaiting real outcome`
          );
          const response = await cached.promise;
          ReactNativeWebView.postMessage(JSON.stringify(response));
        } else {
          console.log(
            `Re-sent message ID ${requestId} done - re-posting stored result`
          );
          ReactNativeWebView.postMessage(JSON.stringify(cached.response));
        }
        return;
      }

      if (!sparkAPI[data.action]) {
        throw new Error(`Unknown Spark action: ${data.action}`);
      }

      // Wrap the dispatch in a promise FIRST so a re-sent id can await the
      // same in-flight outcome instead of re-executing (keep-alive plan §4).
      const dispatchPromise = (async () => {
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
        return { encrypted, isResponse: true };
      })();

      duplicateIds.setInFlight(requestId, dispatchPromise, receivedAt);

      try {
        const posted = await dispatchPromise;
        duplicateIds.setDone(requestId, posted, Date.now());
        ReactNativeWebView.postMessage(JSON.stringify(posted));
      } catch (err) {
        console.log("Spark WebContext error:", err);
        // Cache the ERROR as the done outcome too: a re-query of the same id
        // returns the same error, never a re-execution.
        const errorResponse = {
          encrypted: await encryptMessage(
            sharedKey,
            JSON.stringify({ id: requestId, error: err.message })
          ),
          isResponse: true,
        };
        duplicateIds.setDone(requestId, errorResponse, Date.now());
        ReactNativeWebView.postMessage(JSON.stringify(errorResponse));
      }
    } catch (err) {
      console.log("Spark WebContext error:", err);
      if (sharedKey) {
        const encrypted = await encryptMessage(
          sharedKey,
          JSON.stringify({ id: requestId, error: err.message })
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
