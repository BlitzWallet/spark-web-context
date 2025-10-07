# Boltz Swap Web Context abstraction for react-native

Because react-native does not support WebAssembly but is needed to claim swaps this component includes a Webview to execute WebAssembly dependent code.

We simply inject a function call with the right arguments from the react-native layer and listen for success or error messages from the web context.

## Example usage

```typescript
import ecc from "@bitcoinerlab/secp256k1";
import ECPairFactory from "ecpair";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { SubmarineAPIResponse } from "./utils/boltz/api/postSubmarineSwap";
export const ECPair = ECPairFactory(ecc);
const html = require("boltz-swap-web-context");

type GetClaimSubmarineSwapJSProps = {
  invoice: string;
  swapInfo: SubmarineAPIResponse;
  keyPairWIF: string;
};
const getClaimSubmarineSwapJS = ({
  invoice,
  swapInfo,
  keyPairWIF,
}: GetClaimSubmarineSwapJSProps) => {
  const keyPair = ECPair.fromWIF(keyPairWIF);

  const args = JSON.stringify({
    apiUrl: BOLTZ_API,
    network: "liquid",
    invoice,
    swapInfo,
    privateKey: keyPair.privateKey?.toString("hex"),
  });

  return `window.claimSubmarineSwap(${args}); void(0);`;
};

type ClaimSubmarineSwapProps = {
  invoice: string;
  swapInfo: SubmarineAPIResponse;
  keyPairWIF: string;
};

/**
 * @description Because react-native does not support WebAssembly but is needed to claim swaps
 * this component includes a Webview to execute WebAssembly dependent code.
 * We simply inject a function call with the right arguments from the react-native layer
 * and listen for success or error messages from the web context.
 */
export const ClaimSubmarineSwap = ({
  swapInfo,
  invoice,
  keyPairWIF,
}: ClaimSubmarineSwapProps) => {
  const handleClaimMessage = (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.error) throw Error(data.error);
  };

  return (
    <WebView
      source={html}
      originWhitelist={["*"]}
      injectedJavaScript={getClaimSubmarineSwapJS({
        invoice,
        swapInfo,
        keyPairWIF,
      })}
      onMessage={handleClaimMessage}
    />
  );
};
```