# Android Emulator WebRTC React Example

This is a simple React application built with Vite to showcase the usage of the `android-emulator-webrtc` component.

## Getting Started

1.  **Prerequisites**:
    *   Make sure you have compiled the main library protobuf files first (run `make protoc` or `make build` in the root repository directory).
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run the development server**:
    ```bash
    npm run dev
    ```
    This will start a Vite local server (typically at `http://localhost:5173`).
4.  **Connect**:
    *   Open the website in your browser.
    *   Enter the URI of your Emulator Gateway (e.g. `localhost:8080` if running locally).
    *   Click "Connect".
5.  **Interact**:
    *   You should see the screen of the emulator.
    *   Use your mouse to click and drag to interact.
    *   Use the buttons on the right to send hardware key presses (Home, Back, Vol +/-).
    *   Use the GPS form to update the mock location.
