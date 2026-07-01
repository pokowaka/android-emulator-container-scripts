/*
 * Copyright 2020 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import logger from "./logger";

export interface AuthService {
  authHeader?(): Record<string, string>;
  unauthorized?(): void;
}

export interface EmulatorStatusData {
  status?: string;
  hardwareConfig?: Record<string, string>;
  [key: string]: any;
}

/**
 * Utility class to query and manage the emulator's status by communicating
 * with its REST configuration endpoint. It parses the hardware configuration
 * and caches the status.
 *
 * @export
 * @class EmulatorStatus
 */
class EmulatorStatus {
  statusUrl: string;
  auth: AuthService | null;
  status: EmulatorStatusData | null;

  /**
   * Creates an EmulatorStatus object that can retrieve the status of the running emulator.
   *
   * @param statusUrl The REST endpoint to retrieve status.
   * @param auth The authentication service to use, or null for no authentication.
   */
  constructor(statusUrl: string, auth?: AuthService | null) {
    this.statusUrl = statusUrl;
    this.auth = auth || null;
    this.status = null;
  }

  /**
   * Gets the cached status object.
   *
   * @returns The cached emulator status or null if not yet loaded.
   * @memberof EmulatorStatus
   */
  getStatus = (): EmulatorStatusData | null => {
    return this.status;
  };

  /**
   * Retrieves the current status from the emulator REST endpoint.
   *
   * @param fnNotify Callback invoked when the status is retrieved. Receives the status object.
   * @param cache If true, uses the cached status if available instead of fetching.
   * @memberof EmulatorStatus
   */
  updateStatus = (fnNotify: (status: EmulatorStatusData) => void, cache?: boolean) => {
    if (!this.statusUrl) {
      return;
    }
    if (cache && this.status) {
      fnNotify(this.status);
      return this.status;
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.auth && this.auth.authHeader) {
      Object.assign(headers, this.auth.authHeader());
    }

    fetch(this.statusUrl, { headers })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data: EmulatorStatusData) => {
        this.status = data;
        fnNotify(this.status);
      })
      .catch((err) => {
        logger.error("Failed to get emulator status:", err);
      });
  };
}

export default EmulatorStatus;