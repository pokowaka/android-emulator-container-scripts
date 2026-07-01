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

echo "Creating python virtual environment in: $DIR/venv"
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing gateway server in editable mode..."
pip install -e .

echo "--------------------------------------------------------"
echo "Setup completed successfully!"
echo "To run the gateway, activate the virtual environment and run the executable:"
echo ""
echo "    source gateway/venv/bin/activate"
echo "    videobridge-gateway --discovery_file=/path/to/pid_<PID>.ini"
echo "--------------------------------------------------------"

