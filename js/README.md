# android-emulator-webrtc

This package contains React components and utilities to display and interact with an Android Emulator from the browser. It is designed to interface with an Emulator Gateway using REST and WebSockets (removing gRPC-web and Envoy proxy requirements).

See the [Server Protocol Specification](docs/protocol.md) for details on how to implement the gateway.

See the [android container](https://github.com/google/android-emulator-container-scripts) scripts for an example on how to run an emulator that is accessible via the web.

```bash
npm install --save android-emulator-webrtc
```

## Features

- Display and interact with a remote Android Emulator over the web.
- Real-time WebRTC video and audio streaming.
- Fully interactive mouse, touch, and keyboard event forwarding.
- Reconnection support with exponential backoff for WebSocket and WebRTC failures.
- Native TypeScript support with built-in type definitions.

---

## Usage

### Simple Connection

You can connect to a remote unsecured emulator as follows using a modern React functional component:

```tsx
import React from "react";
import { Emulator } from "android-emulator-webrtc";

function EmulatorScreen() {
  return (
    <div style={{ width: "360px", height: "640px", background: "#000" }}>
      <Emulator 
        uri="localhost:8080" 
        onStateChange={(state) => console.log("State:", state)}
        onError={(err) => console.error("Error:", err)}
      />
    </div>
  );
}
```

### Secure Connection

To connect to a secure endpoint, provide an `auth` service object that implements the required authentication hooks:

```tsx
import React from "react";
import { Emulator } from "android-emulator-webrtc";

const myAuthService = {
  // Returns headers to be sent with REST requests (e.g. GPS updates)
  authHeader: () => {
    return { Authorization: "Bearer my-session-token" };
  },
  // Callback invoked when a 401 Unauthorized is encountered
  unauthorized: () => {
    console.log("Token expired or unauthorized. Redirecting to login...");
  }
};

function SecureEmulatorScreen() {
  return (
    <Emulator 
      uri="https://my-secure-gateway.com" 
      auth={myAuthService} 
    />
  );
}
```

---

## Reference

### `<Emulator />`

A React component that displays the remote Android Emulator screen and forwards user input.

#### Props

| Prop | Type | Default | Required | Description |
| :--- | :---: | :---: | :---: | :--- |
| **uri** | `string` | | :white_check_mark: | Endpoint where the emulator gateway is reachable (e.g. `host:port` or `http(s)://host:port`). |
| **auth** | `object` | `null` | :x: | An authentication service object implementing `authHeader()` and `unauthorized()`. |
| **muted** | `boolean` | `true` | :x: | Whether the audio stream should be muted. |
| **volume** | `number` | `1.0` | :x: | Audio playback volume between `0.0` (muted) and `1.0` (100%). |
| **width** | `number` | | :x: | Width of the component in pixels. Defaults to `100%`. |
| **height** | `number` | | :x: | Height of the component in pixels. Defaults to `100%`. |
| **gps** | `object` | | :x: | An object containing `{ latitude, longitude, altitude, heading, speed }` to update the emulator's mock location. |
| **onStateChange** | `function` | | :x: | Callback invoked on WebRTC connection state changes: `"connecting"`, `"connected"`, or `"disconnected"`. |
| **onAudioStateChange** | `function` | | :x: | Callback invoked when the audio track becomes available (`true`) or unavailable (`false`). |
| **onError** | `function` | | :x: | Callback invoked when a WebSocket, WebRTC, or GPS update error occurs. |

#### Imperative Methods

By passing a `ref` to the `<Emulator />` component, you can access the following helper methods:

* **`sendKey(key: string)`**: Simulates a physical hardware button press on the device.
  
  Common hardware key names:
  * `"GoHome"` — Go to the home screen.
  * `"GoBack"` — Go back to the previous screen.
  * `"AppSwitch"` — Open the recent apps switcher.
  * `"Power"` — Press the power button.
  * `"AudioVolumeUp"` — Increase the device volume.
  * `"AudioVolumeDown"` — Decrease the device volume.

---

### `EmulatorStatus`

A utility class used to query and cache the hardware configuration and status of the remote emulator.

```typescript
import { EmulatorStatus } from "android-emulator-webrtc";

const statusService = new EmulatorStatus("http://localhost:8080/api/v1/emulator/status", myAuthService);

// Fetch the status
statusService.updateStatus((status) => {
  console.log("Device Screen Width:", status.hardwareConfig?.["hw.lcd.width"]);
  console.log("Device Screen Height:", status.hardwareConfig?.["hw.lcd.height"]);
}, true); // Set to true to use cached status if available
```

---

### `logger`

The logger instance used internally by the library. You can use it to configure the library's log level:

```typescript
import { logger } from "android-emulator-webrtc";

// Enable verbose WebRTC and signaling debug logs in the console
logger.setLevel("debug");
```
