import { SparkAPI } from "./src/spark.js";
import { loadKeys, sendTestingMessage } from "./src/tests.js";
import { decryptMessage, encryptMessage } from "./src/utils/encription.js";
import { generateECDHKey } from "./src/utils/encriptionKeys.js";

// Encapsulate logic to avoid global variables
(function initializeSparkWebContext(ReactNativeWebView) {
  let ecdhKeyPair = {};
  let devicePubkey = null;
  let sparkAPI = SparkAPI({
    ecdhKeyPair: null,
    devicePubkey: null,
    ReactNativeWebView: window.ReactNativeWebView,
  });
  const processedMessageIds = new Set();

  // Mock WebView for browser testing (remove in production)
  if (process.env.NODE_ENV !== "production" && !ReactNativeWebView) {
    console.log("🧩 Mocking ReactNativeWebView for local testing...");
    ReactNativeWebView = {
      postMessage: (msg) => {
        console.log("[Mock postMessage] -> RN:", msg);
        setTimeout(() => {
          window.dispatchEvent(new MessageEvent("message", { data: msg }));
        }, 500);
      },
    };
  }

  async function handleMessage(event) {
    try {
      if (typeof event.data !== "string") return;
      let data = JSON.parse(event.data);

      if (data.isResponse) return;

      if (data.id && processedMessageIds.has(data.id)) {
        console.log(`Duplicate message ID ${data.id} ignored`);
        return;
      }

      if (data?.action === "handshake:init" && data?.args?.pubN) {
        processedMessageIds.clear();
        ecdhKeyPair = await generateECDHKey();
        devicePubkey = data.args.pubN;

        // Reinitialize SparkAPI with encryption keys and WebView
        sparkAPI = SparkAPI({
          ecdhKeyPair: ecdhKeyPair,
          devicePubkey: devicePubkey,
          ReactNativeWebView: window.ReactNativeWebView,
        });

        const response = {
          id: data.id,
          success: true,
          type: "handshake:reply",
          pubW: Buffer.from(ecdhKeyPair.publicKey).toString("hex"),
          isResponse: true,
        };
        console.log("Session key established with native");
        processedMessageIds.add(data.id);
        ReactNativeWebView.postMessage(JSON.stringify(response));
        return;
      }

      if (data.encrypted) {
        const decrypted = await decryptMessage(
          ecdhKeyPair?.privateKey,
          devicePubkey,
          data.encrypted
        );
        const msg = JSON.parse(decrypted);
        data = msg;
      }

      if (data.id && processedMessageIds.has(data.id)) {
        console.log(`Duplicate message ID ${data.id} ignored`);
        return;
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

      const encrypted = await encryptMessage(
        ecdhKeyPair?.privateKey,
        devicePubkey,
        JSON.stringify(response)
      );
      ReactNativeWebView.postMessage(
        JSON.stringify({ encrypted, isResponse: true })
      );
    } catch (err) {
      console.log("Spark WebContext error:", err);
      ReactNativeWebView.postMessage(
        JSON.stringify({ err: err.message, isResponse: true })
      );
    }
  }

  // Attach event listeners
  window.addEventListener("message", handleMessage);
  document.addEventListener("message", handleMessage);

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
