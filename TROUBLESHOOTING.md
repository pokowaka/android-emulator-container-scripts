# Troubleshooting & Known Issues

Here is a list of common issues and recommended workarounds.

---

## Why Can't I Use System Images Older Than Android O (API 26)?

Releases before Android O (API 26) run on older Linux kernels (3.10) which lack
modern container and gRPC support needed for automated Docker deployments.

---

## Unable to Find `emu-docker`

If running `emu-docker` returns a "command not found" error, ensure you are
operating inside the Python virtual environment.

Activate the environment:

```sh
source ./configure.sh
```

---

## Permission Errors Interacting with Docker

If you encounter a permission exception like:

```python
requests.exceptions.ConnectionError: ('Connection aborted.', PermissionError(13, 'Permission denied'))
```

Your user lacks permission to interact with the Docker daemon socket. Follow the
official steps to
[manage Docker as a non-root user](https://docs.docker.com/engine/install/linux-postinstall/).

---

## ADB Not Found Exception

If `emu-docker` throws:

```
FileNotFoundError: [Errno 2] Unable to find ADB below $ANDROID_SDK_ROOT or on the path!
```

Ensure ADB is installed and added to your system `PATH`. ADB is included with
Android SDK Platform-Tools or command-line tools.

---

## Wrong Zip File Exceptions

If `emu-docker` fails with:

```
Exception: emulator-xx.zip is not a zip file with a system image
```

Ensure arguments are specified in the correct positional order:

```sh
emu-docker create <emulator-zip> <system-image-zip>
```

---

## Container Unexpectedly Stopped or Corrupted

If the emulator inside a container crashes or is forcibly terminated, the Docker
container may be left in an unresponsive state.

Remove the stopped container before restarting:

```sh
docker rm -f <CONTAINER_ID>
```

---

## WebRTC Video Stream Issues

If the React web app fails to establish a video stream:

1. **Check Gateway Logs**: Ensure the Python Signaling Gateway
   (`videobridge-gateway`) is running and connected to the emulator's gRPC port.
   Check the terminal output for gRPC connection errors.

2. **Check Browser Console Logs**: Look for WebRTC signaling or ICE candidate
   errors in your browser developer tools.
   - If signaling connects but media stays black, a
     [TURN server](https://en.wikipedia.org/wiki/Traversal_Using_Relays_around_NAT)
     may be required for network/NAT traversal.
   - You can pass TURN server configurations using the `--turncfg` flag when
     invoking `emu-docker create`.

---

## Docker Authentication / Credential Helper Errors

If Python Direct API calls fail with:

```python
ConnectionResetError: [Errno 104] Connection reset by peer
```

Verify your Docker credential helpers configuration. Pass the `-v` verbosity
flag to inspect authentication logs:

```sh
emu-docker -v create ...
```

---

## Credential Errors with Docker Compose

If `docker compose` raises credential errors when executed inside a Python
virtual environment, execute Docker Compose from your standard system shell
environment instead.
