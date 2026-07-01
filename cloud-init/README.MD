# Android Emulator in the Cloud

[Cloud-init](https://cloudinit.readthedocs.io/en/latest/) is a widely supported
cross-platform cloud instance initialization standard. This directory contains
`cloud-init` configurations to automatically provision a cloud VM instance and
run the Android Emulator in a container.

---

## Requirements

The VM host instance must run a Linux OS with KVM acceleration available:

- **AWS**: Use
  [EC2 Bare Metal instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html#bare-metal-instances)
  or instances supporting KVM.
- **Azure**: Select a
  [VM size supporting nested virtualization](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes)
  (e.g., Dv3 or Ev3 family).
- **Google Cloud (GCE)**: Enable
  [nested virtualization](https://cloud.google.com/compute/docs/instances/nested-virtualization/overview).

> [!NOTE] Standard Google Cloud Container-Optimized OS (COS) images do not
> expose `/dev/kvm` by default. You can build a custom COS image with KVM
> enabled following the instructions at the bottom of this document.

---

## Overview

The `cloud-init` configuration installs a `systemd` service (`aemu.service`)
that pulls a public or custom emulator Docker image and launches it. Metadata
variables are loaded from `/run/metadata/aemu`.

### Configurable Metadata Properties

- **`GRPC_PORT`**: Port for the first instance's gRPC service. Defaults to
  `8554` (subsequent instances use `8555`, `8556`, etc.).
- **`ADB_PORT`**: Port for the first instance's ADB server. Defaults to `5555`
  (subsequent instances use `5556`, `5557`, etc.).
- **`INSTANCE_COUNT`**: Number of emulator container instances to launch
  (defaults to `1`).
- **`IMAGE`**: Docker image URL to pull and launch. Defaults to
  `us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:latest`.
- **`ADBKEY`**: Private ADB key to inject into the container.
- **`TURN`**: Turn server configuration string for WebRTC traversal.
- **`AVD_CONFIG`**: Additional key-value pairs added to the AVD's `config.ini`.
- **`EMULATOR_PARAMS`**: Additional command-line flags passed to the emulator
  binary.

When running on GCE, instance metadata attributes automatically override these
values:

- `emulator_grpc_port` $\rightarrow$ `GRPC_PORT`
- `emulator_adb_port` $\rightarrow$ `ADB_PORT`
- `emulator_image` $\rightarrow$ `IMAGE`
- `emulator_adbkey` $\rightarrow$ `ADBKEY`
- `emulator_turn` $\rightarrow$ `TURN`
- `emulator_instance_count` $\rightarrow$ `INSTANCE_COUNT`

---

## Launching an Instance on GCE

To launch a GCE VM instance configured with `cloud-init`:

```sh
gcloud compute instances create aemu-example \
  --zone us-west1-b \
  --image-family ubuntu-2204-lts \
  --image-project ubuntu-os-cloud \
  --machine-type n2-standard-8 \
  --metadata-from-file user-data=cloud-init \
  --metadata=emulator_adbkey="$(cat ~/.android/adbkey)",emulator_adb_port=5555,emulator_grpc_port=8554
```

Connect ADB from your local host:

```sh
IP=$(gcloud compute instances describe aemu-example --zone us-west1-b --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
adb connect ${IP}:5555
```

---

## Building a Container-Optimized OS (COS) with KVM Enabled

To use Google Cloud Container-Optimized OS with KVM acceleration:

1. Obtain the
   [COS source code](https://cloud.google.com/container-optimized-os/docs/how-to/building-from-open-source#obtaining_the_source_code).
2. Enable KVM kernel modules in the build config:

```diff
diff --git a/project-lakitu/sys-kernel/lakitu-kernel-5_4/files/base.config b/project-lakitu/sys-kernel/lakitu-kernel-5_4/files/base.config
index e13a9e170e..a31b2b73db 100644
--- a/project-lakitu/sys-kernel/lakitu-kernel-5_4/files/base.config
+++ b/project-lakitu/sys-kernel/lakitu-kernel-5_4/files/base.config
@@ -609,7 +609,13 @@ CONFIG_EFI_EARLYCON=y

 CONFIG_HAVE_KVM=y
 CONFIG_VIRTUALIZATION=y
-# CONFIG_KVM is not set
+CONFIG_KVM=m
+CONFIG_KVM_INTEL=m
+CONFIG_KVM_MMU_AUDIT=m
+CONFIG_KVM_AMD=m
+CONFIG_VHOST_NET=m
+CONFIG_VHOST_VSOCK=m
```

3. Build the COS image following the
   [COS build guide](https://cloud.google.com/container-optimized-os/docs/how-to/building-from-open-source#building_a_image).
4. Create a disk and image license with VMX/nested virtualization enabled:

```sh
gcloud compute disks create cos-dev-nested-disk --image emu-dev-cos-base --zone us-west1-b
gcloud compute images create cos-dev-nested \
  --source-disk cos-dev-nested-disk \
  --source-disk-zone us-west1-b \
  --licenses "https://www.googleapis.com/compute/v1/projects/vm-options/global/licenses/enable-vmx"
```
