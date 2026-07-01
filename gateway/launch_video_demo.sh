#!/bin/bash
# Copyright (C) 2026 The Android Open Source Project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Fail on error
set -e

# Find the directory of this script (supports both Bash and Zsh)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]:-${(%):-%x}}" )" && pwd )"
cd "$DIR"

# Parse arguments
DISCOVERY_FILE=""
PORT_GATEWAY=8080
PORT_BRIDGE=50051
SHM_PATH=""
VERBOSITY_LEVEL=""
WEBRTC_LOG_LEVEL="warning"

while [[ $# -gt 0 ]]; do
    case $1 in
        --discovery_file)
            DISCOVERY_FILE="$2"
            shift 2
            ;;
        --port)
            PORT_GATEWAY="$2"
            shift 2
            ;;
        --bridge_port)
            PORT_BRIDGE="$2"
            shift 2
            ;;
        --shared_memory_path)
            SHM_PATH="$2"
            shift 2
            ;;
        --v)
            VERBOSITY_LEVEL="$2"
            shift 2
            ;;
        --webrtc_log_level)
            WEBRTC_LOG_LEVEL="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: ./launch_video_demo.sh --discovery_file <path_to_ini> [--port <gateway_port>] [--bridge_port <bridge_port>] [--shared_memory_path <shm_path>] [--v <verbose_level>] [--webrtc_log_level <webrtc_level>]"
            exit 1
            ;;
    esac
done

if [ -z "$DISCOVERY_FILE" ]; then
    echo "Error: --discovery_file is required."
    echo "Usage: ./launch_video_demo.sh --discovery_file <path_to_ini> [--port <gateway_port>] [--bridge_port <bridge_port>]"
    exit 1
fi

# Resolve absolute path of discovery file before changing directories
DISCOVERY_FILE_ABS="$(cd "$(dirname "$DISCOVERY_FILE")" && pwd)/$(basename "$DISCOVERY_FILE")"

if [ ! -f "$DISCOVERY_FILE_ABS" ]; then
    echo "Error: Discovery file not found at: $DISCOVERY_FILE"
    exit 1
fi

# 1. Setup / Activate Python environment
cd "$DIR"
if [ ! -d "venv" ]; then
    echo "Python virtual environment not found. Running setup_env.sh..."
    ./setup_env.sh
fi

echo "Activating virtual environment..."
source venv/bin/activate

# 2. Launch Python Signaling Gateway directly against Emulator gRPC
echo "Launching Python Signaling Gateway on port $PORT_GATEWAY..."
echo ""
echo "--------------------------------------------------------"
echo "WebRTC stream is ready! Open the following URL in your browser:"
echo "    https://pokowaka.github.io/android-emulator-webrtc/?url=localhost:$PORT_GATEWAY"
echo "    or your local React app at http://localhost:5173"
echo "--------------------------------------------------------"
echo ""

videobridge-gateway \
  --port="$PORT_GATEWAY" \
  --discovery_file="$DISCOVERY_FILE_ABS"

