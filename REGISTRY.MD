# Android Emulator Container Registry

The Android Emulator simulates Android devices on your computer so that you can
test applications across a variety of API levels without physical hardware.

The emulator provides full device capabilities including incoming calls, SMS
simulation, location mocking, custom network speeds, rotation/sensors, Google
Play Services, and Google Play Store access.

---

## Requirements and Recommendations

Container images require a Linux host environment:

- **Linux Only**: Docker containers require KVM acceleration on a Linux host
  (macOS and Windows via Docker Desktop are not supported).
- **KVM Acceleration**: KVM must be enabled on your host. You can access KVM on
  bare-metal machines or cloud virtual machines with nested virtualization
  enabled:
  - **AWS**: Use
    [EC2 Bare Metal instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html#bare-metal-instances)
    or instance types supporting KVM.
  - **Azure**: Select a
    [VM size supporting nested virtualization](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes)
    (e.g., Dv3 or Ev3 series).
  - **Google Cloud (GCE)**: Enable
    [nested virtualization](https://cloud.google.com/compute/docs/instances/nested-virtualization/overview)
    on Compute Engine VMs.

> [!WARNING] You will experience reduced performance when using nested
> virtualization compared to bare-metal hardware.

---

## Hosted Container Images

Google Artifact Registry hosts pre-built, production-ready container images:

- `us-docker.pkg.dev/android-emulator-268719/images/28-playstore-x64:30.1.2`
- `us-docker.pkg.dev/android-emulator-268719/images/28-playstore-x64-no-metrics:30.1.2`
- `us-docker.pkg.dev/android-emulator-268719/images/29-google-x64:30.1.2`
- `us-docker.pkg.dev/android-emulator-268719/images/29-google-x64-no-metrics:30.1.2`
- `us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2`
- `us-docker.pkg.dev/android-emulator-268719/images/30-google-x64-no-metrics:30.1.2`

Pull an image directly:

```sh
docker pull us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2
```

---

## Usage & Configuration

### Environment Variables

- **`ADBKEY`**: Private ADB key content needed for ADB authentication.

### The following ports are available:

 - **5555**: The [Android Debug Bridge (ADB)](https://developer.android.com/studio/command-line/adb) port.
 - **8554**: The emulator gRPC service port, which hosts the `android.emulation.control.v2.Rtc` WebRTC signaling/media streaming service directly.

An example invocation making ADB and the gRPC/WebRTC endpoint available:

```sh
docker run -e "ADBKEY=$(cat ~/.android/adbkey)" \
  --device /dev/kvm \
  --publish 8554:8554/tcp \
  --publish 5555:5555/tcp \
  us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2
```

Connect ADB from host:

```sh
adb connect localhost:5555
```

---

## Licensing & Privacy

- By using these container images, you accept the
  [Android SDK License Agreement](https://developer.android.com/studio/terms).
- The Android Emulator binary is released under the
  [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0).

Notice files for the emulator and system images are located inside the container
at:

- `/android/sdk/system-images/android/x86_64/NOTICE.txt`
- `/android/sdk/system-images/android/x86/NOTICE.txt`
- `/android/sdk/emulator/NOTICE.txt`

Extract notice files from an image:

```sh
CONTAINER_ID=$(docker create us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2)
docker export $CONTAINER_ID | tar vxf - --wildcards --no-anchored 'NOTICE.txt'
docker rm $CONTAINER_ID
```

### Metrics Collection

For container images without the `-no-metrics` suffix:

- By using these images, you authorize Google to collect usage data for the
  Android Emulator to help improve the tool. Data is collected in accordance
  with [Google's Privacy Policy](https://policies.google.com/privacy).
