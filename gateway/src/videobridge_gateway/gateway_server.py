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
import argparse
import asyncio
import sys
import os
from pathlib import Path

# Add the proto/ directory to sys.path to allow absolute imports between sibling proto stubs
# (e.g., rtc_service_v2_pb2 importing ice_config_pb2).
proto_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proto")
if proto_dir not in sys.path:
    sys.path.insert(0, proto_dir)

import aiohttp
from aiohttp import web
import grpc
import json
import logging

# Add local path to package import context to resolve generated proto modules
proto_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proto")
sys.path.insert(0, proto_dir)
from .proto import emulator_controller_pb2 as ec
from .proto import emulator_controller_pb2_grpc as ec_grpc
from .proto import rtc_service_v2_pb2 as rtc
from .proto import rtc_service_v2_pb2_grpc as rtc_grpc
from .proto import ice_config_pb2 as ice

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d (%(funcName)s): %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# Properties dictionary populated by parsing the discovery file
DISCOVERY_PROPS = {}
EMULATOR_CHANNEL = None
VIDEOBRIDGE_CHANNEL = None


def parse_discovery_file(path):
    props = {}
    if not path or not os.path.exists(path):
        logging.warning(f"Discovery file not found or not specified at: {path}")
        return props
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith(";"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    props[k.strip()] = v.strip()
        logging.info(f"Loaded discovery properties from {path}")
    except Exception as e:
        logging.error(f"Failed to read discovery file: {e}")
    return props


def get_emulator_metadata():
    token = DISCOVERY_PROPS.get("grpc.token", "")
    if token:
        return [("authorization", f"Bearer {token}")]
    return []


def get_videobridge_metadata(token_arg):
    if token_arg:
        return [("authorization", f"Bearer {token_arg}")]
    return []


async def handle_status(request):
    """
    GET /api/v1/emulator/status
    Returns the hardware configurations and status of the emulator.
    """
    if not EMULATOR_CHANNEL:
        return web.json_response({"error": "No channel to emulator"}, status=503)

    try:
        stub = ec_grpc.EmulatorControllerStub(EMULATOR_CHANNEL)
        metadata = get_emulator_metadata()
        # Call getStatus
        status_res = await stub.getStatus(
            ec.google_dot_protobuf_dot_empty__pb2.Empty(), metadata=metadata
        )

        # Convert platformConfig map to a regular python dictionary
        platform_config = dict(status_res.platformConfig)

        # Extract vmConfig details
        vm_config = {
            "hypervisorType": status_res.vmConfig.hypervisorType if status_res.vmConfig else "unknown",
            "numberOfCpuCores": status_res.vmConfig.numberOfCpuCores if status_res.vmConfig else 0,
            "ramSizeBytes": status_res.vmConfig.ramSizeBytes if status_res.vmConfig else 0,
        }

        response_data = {
            "version": status_res.version,
            "uptime": status_res.uptime,
            "booted": status_res.booted,
            "hardwareConfig": platform_config,  # Deprecated, kept for backwards compatibility
            "platformConfig": platform_config,  # New preferred field
            "vmConfig": vm_config,
        }
        return web.json_response(response_data)
    except Exception as e:
        logging.error(f"Error fetching status from emulator: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_gps(request):
    """
    POST /api/v1/emulator/gps
    Updates the mock geolocation of the emulator.
    """
    if not EMULATOR_CHANNEL:
        return web.json_response({"error": "No channel to emulator"}, status=503)

    try:
        data = await request.json()
        latitude = float(data.get("latitude", 0.0))
        longitude = float(data.get("longitude", 0.0))
        altitude = float(data.get("altitude", 0.0))

        stub = ec_grpc.EmulatorControllerStub(EMULATOR_CHANNEL)
        metadata = get_emulator_metadata()

        # Send POSITION physical model update
        req = ec.PhysicalModelValue(
            target=ec.PhysicalModelValue.PhysicalType.POSITION,
            value=ec.ParameterValue(data=[longitude, latitude, altitude]),
        )
        await stub.setPhysicalModel(req, metadata=metadata)
        return web.json_response({"status": "success"})
    except Exception as e:
        logging.error(f"Error setting GPS on emulator: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_logcat(request):
    """
    GET /api/v1/emulator/logcat
    Fetches a chunk of logs from logcat using polling-friendly start/next structure.
    """
    if not EMULATOR_CHANNEL:
        return web.json_response({"error": "No channel to emulator"}, status=503)

    try:
        start_offset = int(request.query.get("start", "0"))
        stub = ec_grpc.EmulatorControllerStub(EMULATOR_CHANNEL)
        metadata = get_emulator_metadata()

        req = ec.LogMessage(start=start_offset)
        res = await stub.getLogcat(req, metadata=metadata)
        return web.json_response({"next": res.next, "contents": res.contents})
    except Exception as e:
        logging.error(f"Error fetching logcat from emulator: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_websocket_jsep(request):
    """
    GET /api/v1/emulator/ws-jsep (WebSocket Upgrade)
    Handles WebRTC signaling connection and interfaces with Video Bridge over rtc2.
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    logging.info("WebSocket connection opened for JSEP signaling.")

    if not VIDEOBRIDGE_CHANNEL:
        logging.error("No channel to Video Bridge.")
        await ws.close(
            code=web.WSCloseCode.INTERNAL_ERROR, message=b"Video Bridge offline"
        )
        return ws

    rtc_stub = rtc_grpc.RtcStub(VIDEOBRIDGE_CHANNEL)
    bridge_metadata = get_videobridge_metadata(request.app["videobridge_token"])
    guid = None
    stream_task = None

    try:
        # 1. Build default ICE configuration using public STUN server
        ice_config = ice.IceServerConfig()
        stun_server = ice_config.ice_servers.add()
        stun_server.urls.append("stun:stun.l.google.com:19302")

        # 2. Initialize signaling session with Video Bridge
        stream_req = rtc.RtcStreamRequest(ice_server_config=ice_config)
        # Connect to retrieve stream credentials
        response = await rtc_stub.RequestRtcStream(stream_req, metadata=bridge_metadata)
        guid = response.id.guid
        logging.info(
            f"Initialized WebRTC stream session with Video Bridge. Connection ID: {guid}"
        )

        # 3. Build and send the "start" message with ICE configuration
        ice_servers = []
        for server in ice_config.ice_servers:
            entry = {"urls": list(server.urls)}
            if server.username:
                entry["username"] = server.username
            if server.credential:
                entry["credential"] = server.credential
            ice_servers.append(entry)

        start_msg = {"start": {"iceServers": ice_servers}}
        logging.info(f"Sending 'start' signal to client: {start_msg}")
        await ws.send_json(start_msg)

        # 3. Spawn background streaming reader to forward gRPC messages -> WebSocket
        async def stream_to_client():
            logging.info(
                f"Starting stream_to_client background task for connection: {guid}"
            )
            try:
                reader_req = rtc.ReceiveJsepMessageRequest(id=rtc.Id(guid=guid))
                logging.info(
                    f"Subscribing to JSEP message stream from Video Bridge for connection: {guid}"
                )
                async for response_msg in rtc_stub.ReceiveJsepMessageStream(
                    reader_req, metadata=bridge_metadata
                ):
                    msg_text = response_msg.jsep_msg.message
                    logging.info(
                        f"Received JSEP message from Video Bridge gRPC stream: '{msg_text}'"
                    )
                    if not msg_text:
                        logging.info(
                            "Received empty JSEP message from Video Bridge. Stopping stream reader."
                        )
                        break
                    parsed_jsep = json.loads(msg_text)
                    logging.info(f"Forwarding JSEP message to browser: {parsed_jsep}")

                    # If it's an SDP offer/answer, or an ICE candidate message
                    await ws.send_json(parsed_jsep)
                logging.info("Video Bridge JSEP stream finished cleanly.")
            except asyncio.CancelledError:
                logging.info(f"stream_to_client task cancelled for connection: {guid}")
            except Exception as ex:
                logging.exception("Error in stream_to_client reader loop:")

        stream_task = asyncio.create_task(stream_to_client())

        # 4. Handle incoming browser messages and route -> Video Bridge
        async for ws_msg in ws:
            if ws_msg.type == web.WSMsgType.TEXT:
                client_data = ws_msg.json()
                logging.info(
                    f"Received message from Client -> Video Bridge: {client_data}"
                )

                send_req = rtc.SendJsepMessageRequest()
                send_req.jsep_msg.id.guid = guid
                send_req.jsep_msg.message = json.dumps(client_data)

                await rtc_stub.SendJsepMessage(send_req, metadata=bridge_metadata)
                logging.info(
                    f"Successfully forwarded JSEP message to Video Bridge for connection: {guid}"
                )

                if "bye" in client_data:
                    logging.info(
                        f"Received 'bye' signal from client. Tearing down connection: {guid}"
                    )
                    break
            elif ws_msg.type == web.WSMsgType.ERROR:
                logging.error(f"WebSocket encountered error: {ws.exception()}")

    except Exception as e:
        logging.exception("Error in WebSocket session handler:")
    finally:
        logging.info(f"Closing signaling WebSocket session for ID: {guid}")
        if stream_task:
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass
        await ws.close()
    return ws


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
    else:
        response = await handler(request)

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def init_app(videobridge_token):
    app = web.Application(middlewares=[cors_middleware])
    app["videobridge_token"] = videobridge_token

    # Register routes
    app.router.add_get("/api/v1/emulator/status", handle_status)
    app.router.add_post("/api/v1/emulator/gps", handle_gps)
    app.router.add_get("/api/v1/emulator/logcat", handle_logcat)
    app.router.add_get("/api/v1/emulator/ws-jsep", handle_websocket_jsep)

    return app


async def main():
    parser = argparse.ArgumentParser(
        description="Python Web Gateway for WebRTC Android Emulator"
    )
    parser.add_argument(
        "--port", type=int, default=8080, help="Port to run the gateway webserver on."
    )
    parser.add_argument(
        "--videobridge",
        type=str,
        default="",
        help="Address of the running videobridge gRPC service. If empty, connects directly to the emulator gRPC service.",
    )
    parser.add_argument(
        "--videobridge_token",
        type=str,
        default="",
        help="Auth token for the videobridge.",
    )
    parser.add_argument(
        "--discovery_file",
        type=str,
        required=True,
        help="Path to the active emulator discovery config (.ini) file.",
    )
    args = parser.parse_args()

    # Parse discovery configuration properties
    global DISCOVERY_PROPS
    DISCOVERY_PROPS = parse_discovery_file(args.discovery_file)

    emulator_port = DISCOVERY_PROPS.get("grpc.port")
    if not emulator_port:
        logging.error("Failed to discover emulator gRPC port from discovery file.")
        sys.exit(1)

    emulator_address = f"localhost:{emulator_port}"
    logging.info(f"Connecting to Emulator gRPC service at: {emulator_address}")

    global EMULATOR_CHANNEL, VIDEOBRIDGE_CHANNEL
    EMULATOR_CHANNEL = grpc.aio.insecure_channel(emulator_address)

    if args.videobridge:
        logging.info(f"Connecting to Video Bridge gRPC service at: {args.videobridge}")
        VIDEOBRIDGE_CHANNEL = grpc.aio.insecure_channel(args.videobridge)
    else:
        logging.info("No separate Video Bridge specified; using Emulator gRPC channel directly for Rtc service.")
        VIDEOBRIDGE_CHANNEL = EMULATOR_CHANNEL

    # Start Aiohttp server
    app = init_app(args.videobridge_token)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", args.port)
    await site.start()

    logging.info(f"Gateway Webserver listening on http://0.0.0.0:{args.port}")

    # Run forever
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit, asyncio.CancelledError):
        pass
    finally:
        logging.info("Shutting down Gateway channels.")
        await EMULATOR_CHANNEL.close()
        if VIDEOBRIDGE_CHANNEL and VIDEOBRIDGE_CHANNEL != EMULATOR_CHANNEL:
            await VIDEOBRIDGE_CHANNEL.close()
        await runner.cleanup()


def run_main():
    asyncio.run(main())


if __name__ == "__main__":
    run_main()
