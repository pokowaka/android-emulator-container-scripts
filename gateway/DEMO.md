# End-to-End Demo Guide: Emulator WebRTC Streaming

This guide explains how to set up and run a complete, end-to-end streaming demo using the **Python Gateway Server** connected directly to the Android Emulator's gRPC interface and the React frontend example application in [`js/example`](../js/example).

---

## E2E Architecture Flow

```
 +-----------------+                +-----------------+                +-----------------+
 |   React Web     |    HTTP REST   |  Python Gateway |   gRPC (TCP)   |                 |
 |  Frontend App   |--------------->|     Server      |--------------->| Android Emulator|
 | (localhost:5173)|  WS Signaling  | (localhost:8080)|  gRPC Rtc      |                 |
 |                 |===============>|                 |===============>|                 |
 |                 |                +-----------------+                +-----------------+
 |                 |                                                            |
 |                 |                     WebRTC Data & Media Streams            |
 |                 |<===========================================================|
 +-----------------+                         (UDP / SRTP)
```

---

## Step 1: Launch your Android Emulator

Ensure you have a running emulator with the gRPC service enabled (either locally or inside a Docker container).

Locate the active emulator's **discovery configuration file** (ending in `.ini`):
- **macOS default location**: `~/Library/Android/avd/running/pid_<PID>.ini`
- **Linux default location**: `~/.android/avd/running/pid_<PID>.ini`
- _Note: The file contains configuration properties such as `grpc.port=<port>` and `grpc.token=<token>`._

---

## Quick Start: Launch Signaling Gateway with One Script

You can start the Python Signaling Gateway with a single command using the provided [`launch_video_demo.sh`](./launch_video_demo.sh) script:

1. Navigate to the gateway directory:
   ```bash
   cd gateway
   ```
2. Run the script, providing the path to the active emulator discovery `.ini` file:
   ```bash
   ./launch_video_demo.sh --discovery_file /path/to/pid_<PID>.ini
   ```
3. In a separate terminal, launch the local React WebRTC frontend:
   ```bash
   cd js/example
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.

---

## Step 2: Start the Python Gateway Server Manually

The Python Gateway translates HTTP REST and WebSocket JSEP signaling into the emulator's native `rtc2` gRPC protocol.

The gateway is configured as a standard Python package defined in `pyproject.toml`.

### Option A: Install and Run using `setup_env.sh` (Recommended)

1. Navigate to the `gateway` directory:
   ```bash
   cd gateway
   ```
2. Run the environment setup script to create a virtual environment and install dependencies:
   ```bash
   ./setup_env.sh
   ```
3. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```
4. Start the gateway server:
   ```bash
   videobridge-gateway \
     --port=8080 \
     --discovery_file=/path/to/pid_<PID>.ini
   ```

### Option B: Run Directly from Source

If dependencies (`aiohttp`, `grpcio`, `google-protobuf`) are already installed in your environment:

```bash
python3 src/videobridge_gateway/gateway_server.py \
  --port=8080 \
  --discovery_file=/path/to/pid_<PID>.ini
```

Verify that the gateway server starts and binds successfully to `http://localhost:8080`.

---

## Step 3: Access the WebRTC Frontend

You can connect using the local React example app or the hosted demo web app:

- **Local App**: Run `npm run dev` in `js/example` and open `http://localhost:5173`.
- **Hosted App**: Open [https://pokowaka.github.io/android-emulator-webrtc/](https://pokowaka.github.io/android-emulator-webrtc/).

In the UI connection form:
1. Set **Emulator Gateway URI** to `localhost:8080`.
2. Click **Connect to Emulator**.

---

## Step 4: Interact with the E2E Demo

Once connected:

1. The React app negotiates WebRTC SDP/JSEP offer-answer signaling via WebSocket over the gateway server.
2. **Video Streaming**: The Android screen renders in real-time in your browser window.
3. **Control & Inputs**:
   - Touch/click and drag inside the emulator display to send touch gestures.
   - Use hardware buttons (Home, Back, Volume, Power) to control the device.
   - Send mock GPS location updates (latitude/longitude) via the controls panel.

