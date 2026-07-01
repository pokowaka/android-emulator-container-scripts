# Android Emulator Container Scripts

This is a set of minimal scripts to run the emulator in a container for various
systems such as Docker, for external consumption. Requires Python 3.10 or newer.

> [!NOTE] This is still an experimental feature and we recommend installing this
> tool in a
> [Python virtual environment](https://docs.python.org/3/tutorial/venv.html).
> Please file issues if you notice that anything is not working as expected.

---

## Requirements

These demos are intended to be run on a Linux OS. Your system must meet the
following requirements:

- **Python 3.10+**: Python interpreter with `python3-venv` to create virtual
  environments.
- **Android ADB**: ADB must be available on your `PATH` (included with Android
  SDK Platform-Tools or Command-line tools).
- **[Docker Engine](https://docs.docker.com/engine/install/)**: Docker must be
  installed and configured to run as a
  [non-root user](https://docs.docker.com/engine/install/linux-postinstall/).
- **[Docker Compose](https://docs.docker.com/compose/install/)**: Either the
  modern `docker compose` CLI plugin (v2) or legacy `docker-compose` (v1).
- **KVM (Kernel-based Virtual Machine)**: KVM must be enabled on your host. You
  can access KVM on bare-metal Linux or inside cloud Virtual Machines with
  nested virtualization enabled:
  - **AWS**: Use
    [EC2 Bare Metal instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html#bare-metal-instances)
    or instance types supporting KVM.
  - **Azure**: Choose a
    [VM size supporting nested virtualization](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes)
    (e.g., Dv3, Ev3 series).
  - **Google Cloud (GCE)**: Enable
    [nested virtualization](https://cloud.google.com/compute/docs/instances/nested-virtualization/overview)
    on Compute Engine VMs.

> [!WARNING] You will experience reduced performance when using nested
> virtualization. Container images have been tested under Debian and Ubuntu.
> Docker Desktop on macOS and Windows is not supported for KVM acceleration.

---

## Quick Start with Hosted Containers

We host a set of pre-built container images in a public Google Artifact
Registry. See [REGISTRY.MD](REGISTRY.MD) for full details.

You can launch a hosted container immediately without building from source:

```sh
docker run \
  -e ADBKEY="$(cat ~/.android/adbkey)" \
  --device /dev/kvm \
  --publish 8554:8554/tcp \
  --publish 5555:5555/tcp \
  us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2
```

Connect ADB to the container once started:

```sh
adb connect localhost:5555
```

Verify connection:

```sh
$ adb devices

List of devices attached
localhost:5555 device
```

In automated scripts:

```sh
docker run -d \
  -e ADBKEY="$(cat ~/.android/adbkey)" \
  --device /dev/kvm \
  --publish 8554:8554/tcp \
  --publish 5555:5555/tcp \
  us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2

adb connect localhost:5555
adb wait-for-device
# The device is now booted or booting
```

See [run-in-script-example.sh](./run-in-script-example.sh) for a comprehensive
example.

---

## Installation & CLI Usage

Install the `emu-docker` CLI in a virtual environment:

```sh
source ./configure.sh
```

This activates the virtual environment and installs `emu-docker`. View CLI
options:

```sh
emu-docker -h
```

### Interactive Container Creation

Interactively select Android system images and emulator versions:

```sh
emu-docker interactive --start
```

This prompts for system image & emulator choices, downloads required artifacts,
generates Dockerfiles, and launches the container.

Connect via ADB:

```sh
adb connect localhost:5555
adb devices
```

### Obtaining System Image & Emulator URLs

List published Android SDK system images and emulator releases:

```sh
emu-docker list
```

Example output:

```
SYSIMG R google_apis x86_64 30 https://dl.google.com/android/repository/sys-img/google_apis/x86_64-30_r16.zip
SYSIMG S google_apis x86_64 31 https://dl.google.com/android/repository/sys-img/google_apis/x86_64-31_r14.zip
SYSIMG T google_apis_playstore x86_64 33 https://dl.google.com/android/repository/sys-img/google_apis_playstore/x86_64-33_r09.zip
SYSIMG U google_apis x86_64 34 https://dl.google.com/android/repository/sys-img/google_apis/x86_64-34_r14.zip
SYSIMG V google_apis x86_64 35 https://dl.google.com/android/repository/sys-img/google_apis/x86_64-35_r09.zip
SYSIMG V google_apis x86_64 35 ps16k https://dl.google.com/android/repository/sys-img/google_apis/x86_64-ps16k-35_r05.zip
EMU stable 36.5.11 linux https://dl.google.com/android/repository/emulator-linux_x64-15261927.zip
EMU dev 36.6.8 linux https://dl.google.com/android/repository/emulator-linux_x64-15368433.zip
```

> `ps16k` indicates a 16 KB page-size variant system image.

### Building Docker Images Manually

Create the container build directory from downloaded zip files:

```sh
emu-docker create <emulator-zip> <system-image-zip> [--dest docker-src-dir]
```

Build the Docker image:

```sh
docker build <docker-src-dir>
```

### Running Docker Images

Run using the provided helper script:

```sh
./run.sh <docker-image-id> <additional-emulator-params>
```

Or execute `docker run` directly:

```sh
docker run -e ADBKEY="$(cat ~/.android/adbkey)" \
  --device /dev/kvm \
  --publish 8554:8554/tcp \
  --publish 5555:5555/tcp \
  <docker-image-id>
```

> To improve disk performance, mount a `/data` partition in `tmpfs`:
>
> ```sh
> docker run -e ADBKEY="$(cat ~/.android/adbkey)" \
>   --device /dev/kvm \
>   --mount type=tmpfs,destination=/data \
>   --publish 8554:8554/tcp \
>   --publish 5555:5555/tcp <docker-image-id>
> ```

### Running with GPU Acceleration (NVIDIA)

For NVIDIA GPU acceleration, install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
Ensure an X server (such as [Xvfb](https://en.wikipedia.org/wiki/Xvfb)) is
running if headless.

Build with `--gpu`:

```sh
emu-docker create stable U --gpu
```

Launch with `run-with-gpu.sh`:

```sh
./run-with-gpu.sh <docker-image-id> <additional-emulator-params>
```

---

## Pushing Images to a Container Registry

To build and push images directly to a registry:

```sh
emu-docker -v create --push --repo us.gcr.io/emulator-project/ stable "U"
```

Images follow the naming convention `{api}-{sort}-{abi}` (e.g.
`34-playstore-x64:36.5.11`).

Run pushed images:

```sh
docker run --device /dev/kvm --publish 8554:8554/tcp --publish 5555:5555/tcp \
  us.gcr.io/emulator-project/34-playstore-x64:36.5.11
```

---

## Web Streaming (WebRTC) Setup

This repository provides an end-to-end WebRTC streaming architecture to view and
control the emulator in a web browser without requiring external proxies (like Envoy)
or separate video bridge binaries.

### WebRTC Architecture

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

The stack consists of two main components:

1. **Python Gateway Server (`gateway/`)**: Connects directly to the emulator's native gRPC interface (`android.emulation.control.v2.Rtc`) and translates HTTP REST and WebSocket JSEP signaling into gRPC calls.
2. **React WebRTC App (`js/`)**: React + Vite application (from
   [`android-emulator-webrtc`](https://github.com/pokowaka/android-emulator-webrtc))
   rendering the live stream and hardware controls.

### Quick Start: Web Streaming Demo

#### Option A: One-Script Launch (Recommended)

1. Locate your active emulator discovery `.ini` file:
   - **Linux**: `~/.android/avd/running/pid_<PID>.ini`
   - **macOS**: `~/Library/Android/avd/running/pid_<PID>.ini`

2. Launch the Python Signaling Gateway:

   ```sh
   cd gateway
   ./launch_video_demo.sh --discovery_file /path/to/pid_<PID>.ini
   ```

3. Launch the React web app in a second terminal:

   ```sh
   cd js/example
   npm install
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser and connect to `localhost:8080`.

#### Option B: Manual Setup

For instructions on manual gateway deployment and service details, see
[`gateway/DEMO.md`](gateway/DEMO.md).

---

## Cloud Deployments & Documentation

- **Automated VM Provisioning**: See
  [cloud-init/README.MD](cloud-init/README.MD) for `cloud-init` scripts to
  launch emulator containers automatically on VM startup.
- **Troubleshooting**: Refer to [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for
  solutions to common issues.
- **Web Frontend Customization**: Refer to [js/README.md](js/README.md) for
  details on modifying or extending the React WebRTC components.
