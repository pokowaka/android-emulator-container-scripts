import os
import sys
import subprocess
from setuptools import setup
from setuptools.command.build_py import build_py
from setuptools.command.develop import develop


def generate_protos():
    # Retrieve BAZEL_ROOT from environment.
    bazel_root = os.environ.get("BAZEL_ROOT")
    if not bazel_root:
        print("ERROR: BAZEL_ROOT environment variable is not set.", file=sys.stderr)
        print(
            "Please set BAZEL_ROOT to the root of the emu-main-next workspace.",
            file=sys.stderr,
        )
        sys.exit(1)

    # 1. Setup paths
    aemu_protos_path = os.path.join(bazel_root, "hardware/google/aemu/protos")

    # Proto source files
    controller_proto = os.path.join(
        aemu_protos_path, "services/emulator-controller/emulator_controller.proto"
    )
    rtc_proto = os.path.join(aemu_protos_path, "services/webrtc/rtc_service_v2.proto")

    for proto_file in [controller_proto, rtc_proto]:
        if not os.path.exists(proto_file):
            print(f"ERROR: Proto file not found at {proto_file}", file=sys.stderr)
            sys.exit(1)

    # Get the absolute path of the directory containing setup.py
    setup_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(setup_dir, "src/videobridge_gateway/proto")
    os.makedirs(output_dir, exist_ok=True)

    # We need to import grpc_tools here since it is installed as a build dependency.
    import grpc_tools.protoc

    # Locate the path to the well-known proto files bundled with grpc_tools
    # using importlib.resources (standard in Python 3.9+)
    try:
        import importlib.resources as importlib_resources

        try:
            # Python 3.9+
            grpc_proto_include = str(
                importlib_resources.files("grpc_tools").joinpath("_proto")
            )
        except AttributeError:
            # Fallback for older versions
            import pkg_resources

            grpc_proto_include = pkg_resources.resource_filename("grpc_tools", "_proto")
    except ImportError:
        import pkg_resources

        grpc_proto_include = pkg_resources.resource_filename("grpc_tools", "_proto")

    # 2. Compile emulator_controller.proto
    # Including the directory of the file itself as -I ensures the output is placed directly in output_dir
    print(f"Generating proto stubs from {controller_proto} into {output_dir}...")
    result = grpc_tools.protoc.main(
        [
            "grpc_tools.protoc",
            f"-I{os.path.join(aemu_protos_path, 'services/emulator-controller')}",
            f"-I{aemu_protos_path}",
            f"-I{grpc_proto_include}",
            f"--python_out={output_dir}",
            f"--grpc_python_out={output_dir}",
            controller_proto,
        ]
    )
    if result != 0:
        print(
            f"ERROR: Failed to generate stubs for {controller_proto}", file=sys.stderr
        )
        sys.exit(result)

    # 3. Compile rtc_service_v2.proto and its dependency ice_config.proto
    # Including the directory of the files itself as -I ensures the output is placed directly in output_dir
    ice_proto = os.path.join(aemu_protos_path, "services/webrtc/ice_config.proto")
    for f in [rtc_proto, ice_proto]:
        print(f"Generating proto stubs from {f} into {output_dir}...")
        result = grpc_tools.protoc.main(
            [
                "grpc_tools.protoc",
                f"-I{os.path.join(aemu_protos_path, 'services/webrtc')}",
                f"-I{aemu_protos_path}",
                f"-I{grpc_proto_include}",
                f"--python_out={output_dir}",
                f"--grpc_python_out={output_dir}",
                f,
            ]
        )
        if result != 0:
            print(f"ERROR: Failed to generate stubs for {f}", file=sys.stderr)
            sys.exit(result)

    # Touch __init__.py in the generated folder to ensure it is treated as a package.
    with open(os.path.join(output_dir, "__init__.py"), "w") as f:
        pass


class CustomBuildPy(build_py):
    def run(self):
        generate_protos()
        super().run()


class CustomDevelop(develop):
    def run(self):
        generate_protos()
        super().run()


setup(
    cmdclass={
        "build_py": CustomBuildPy,
        "develop": CustomDevelop,
    }
)
