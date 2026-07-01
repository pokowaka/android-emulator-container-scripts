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
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import os
import sys

# Add src folder to package import context
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))
from videobridge_gateway import gateway_server
from videobridge_gateway import emulator_controller_pb2 as ec


class GatewayServerTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Reset global variables before each test
        gateway_server.DISCOVERY_PROPS.clear()
        gateway_server.EMULATOR_CHANNEL = MagicMock()
        gateway_server.VIDEOBRIDGE_CHANNEL = MagicMock()

    def test_parse_discovery_file(self):
        # 1. Create a dummy discovery file
        dummy_path = "dummy_discovery.ini"
        with open(dummy_path, "w") as f:
            f.write("# This is a comment\n")
            f.write("grpc.port = 12345\n")
            f.write("grpc.token = secret_token_abc\n")
            f.write("hw.lcd.width = 1440\n")
            f.write("hw.lcd.height = 2960\n")

        try:
            props = gateway_server.parse_discovery_file(dummy_path)
            self.assertEqual(props.get("grpc.port"), "12345")
            self.assertEqual(props.get("grpc.token"), "secret_token_abc")
            self.assertEqual(props.get("hw.lcd.width"), "1440")
            self.assertEqual(props.get("hw.lcd.height"), "2960")
        finally:
            if os.path.exists(dummy_path):
                os.remove(dummy_path)

    def test_get_emulator_metadata(self):
        # When token is missing
        metadata = gateway_server.get_emulator_metadata()
        self.assertEqual(metadata, [])

        # When token is present
        gateway_server.DISCOVERY_PROPS["grpc.token"] = "abc"
        metadata = gateway_server.get_emulator_metadata()
        self.assertEqual(metadata, [("authorization", "Bearer abc")])

    @patch("gateway_server.ec_grpc.EmulatorControllerStub")
    async def test_handle_status_success(self, mock_stub_class):
        # Setup mocks
        mock_stub = MagicMock()
        mock_stub_class.return_value = mock_stub

        # Mock async getVmState method
        mock_res = MagicMock()
        mock_res.state = ec.VmRunState.RUNNING
        mock_stub.getVmState = AsyncMock(return_value=mock_res)

        gateway_server.DISCOVERY_PROPS["hw.lcd.width"] = "1920"
        gateway_server.DISCOVERY_PROPS["hw.lcd.height"] = "1080"

        # Construct dummy aiohttp request
        request = MagicMock()

        # Invoke status handler
        response = await gateway_server.handle_status(request)
        self.assertEqual(response.status, 200)

        # Parse body
        body = json.loads(response.body.decode("utf-8"))
        self.assertTrue(body["booted"])
        self.assertEqual(body["hardwareConfig"]["hw.lcd.width"], "1920")
        self.assertEqual(body["hardwareConfig"]["hw.lcd.height"], "1080")

    @patch("gateway_server.ec_grpc.EmulatorControllerStub")
    async def test_handle_gps_success(self, mock_stub_class):
        # Setup mocks
        mock_stub = MagicMock()
        mock_stub_class.return_value = mock_stub
        mock_stub.setPhysicalModel = AsyncMock()

        # Construct dummy aiohttp request with JSON payload
        request = AsyncMock()
        request.json.return_value = {
            "latitude": 37.4220,
            "longitude": -122.0841,
            "altitude": 10.0,
        }

        # Invoke GPS handler
        response = await gateway_server.handle_gps(request)
        self.assertEqual(response.status, 200)

        # Verify stub was called with the correct argument
        mock_stub.setPhysicalModel.assert_called_once()
        call_arg = mock_stub.setPhysicalModel.call_args[0][0]
        self.assertEqual(call_arg.target, ec.PhysicalModelValue.PhysicalType.POSITION)
        self.assertEqual(len(call_arg.value.data), 3)
        self.assertAlmostEqual(call_arg.value.data[0], -122.0841, places=4)
        self.assertAlmostEqual(call_arg.value.data[1], 37.4220, places=4)
        self.assertAlmostEqual(call_arg.value.data[2], 10.0, places=4)


import json

if __name__ == "__main__":
    unittest.main()
