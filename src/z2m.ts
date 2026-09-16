import yaml from "js-yaml";

import { ZHABackup, Z2MConfig, Z2MDeviceEntry } from "./types";
import { convertColonHexStringToByteArray, findLatestVersionedTable } from "./utils";

/**
 * Builds the final Z2M configuration, containing data from the backup (network_info)
 * and the list of devices from the registry (zhaDevices).
 */
export function buildZ2MConfig(backupData: ZHABackup, zhaDevices: Record<string, string>): Z2MConfig {
  const pan_id = parseInt(backupData.network_info.pan_id, 16);
  const ext_pan_id = convertColonHexStringToByteArray(backupData.network_info.extended_pan_id, true);
  const channel = backupData.network_info.channel;
  const network_key = convertColonHexStringToByteArray(backupData.network_info.network_key.key);

  // Create an empty devices object
  const devices: { [key: string]: { friendly_name: string } } = {};

  // Map zhaDevices: key "0x<ieee>", value { friendly_name: <name> }
  for (const [ieee, name] of Object.entries(zhaDevices)) {
    devices[`0x${ieee}`] = { friendly_name: name };
  }

  return {
    advanced: {
      pan_id,
      ext_pan_id,
      channel,
      network_key
    },
    devices
  };
}

function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a zigbee-herdsman-compatible coordinator_backup.json (its
 * "UnifiedBackupStorage" format, see
 * https://github.com/Koenkk/zigbee-herdsman/blob/master/src/models/backup-storage-unified.ts).
 *
 * ZHA's own backup_json claims the same format name ("zigpy/open-coordinator-backup")
 * but nests fields under network_info/node_info rather than at the top level
 * zigbee-herdsman expects, so it can't be dropped in as-is (this throws
 * "[BACKUP] Unknown backup format." at startup). This reshapes it instead.
 *
 * pan_id, ext_pan_id, channel and network_key are taken from the already-built
 * Z2MConfig rather than re-derived from backupData, so this file can never
 * disagree with the generated configuration.yaml on those values — a mismatch
 * there makes zigbee-herdsman discard the backup and form a brand new network.
 */
export function buildCoordinatorBackupJson(backupData: ZHABackup, z2mConfig: Z2MConfig): string {
  const networkInfo = backupData.network_info;
  const ezsp = networkInfo.stack_specific?.ezsp;
  const ezspVersion = networkInfo.metadata?.ezspVersion;

  if (!ezsp?.hashed_tclk || !ezspVersion) {
    throw new Error(
      "ZHA backup is missing EZSP stack data (network_info.stack_specific.ezsp / network_info.metadata.ezspVersion). " +
      "Only EZSP-based coordinators (e.g. Sonoff/SLZB dongles) are supported for coordinator_backup.json generation."
    );
  }

  const unifiedBackup = {
    metadata: {
      format: "zigpy/open-coordinator-backup" as const,
      version: 1 as const,
      source: networkInfo.source ?? "zha-z2m-tool",
      internal: {
        date: backupData.backup_time ?? new Date().toISOString(),
        ezspVersion
      }
    },
    stack_specific: {
      ezsp: {
        hashed_tclk: ezsp.hashed_tclk
      }
    },
    // zigbee-herdsman stores IEEE addresses byte-reversed relative to the
    // conventional colon-separated display order (confirmed against a real
    // coordinator_backup.json), same as extended_pan_id below.
    coordinator_ieee: bytesToHex(convertColonHexStringToByteArray(backupData.node_info.ieee, true)),
    pan_id: z2mConfig.advanced.pan_id.toString(16),
    extended_pan_id: bytesToHex(z2mConfig.advanced.ext_pan_id),
    security_level: networkInfo.security_level,
    nwk_update_id: networkInfo.nwk_update_id,
    channel: z2mConfig.advanced.channel,
    channel_mask: networkInfo.channel_mask,
    network_key: {
      key: bytesToHex(z2mConfig.advanced.network_key),
      sequence_number: networkInfo.network_key.seq,
      frame_counter: networkInfo.network_key.tx_counter
    },
    devices: [] as unknown[]
  };

  return JSON.stringify(unifiedBackup, null, 2);
}

/**
 * Merges the generated advanced/devices settings into an existing
 * Zigbee2MQTT configuration.yaml, preserving everything else (mqtt, serial,
 * frontend, ...) so the result is a complete, ready-to-use file rather than
 * a fragment that still needs to be pasted in by hand.
 */
export function mergeIntoExistingConfig(existingYamlText: string, z2mConfig: Z2MConfig): string {
  const existing = (yaml.load(existingYamlText) as Record<string, any>) || {};
  existing.advanced = { ...(existing.advanced ?? {}), ...z2mConfig.advanced };
  existing.devices = { ...(existing.devices ?? {}), ...z2mConfig.devices };
  return yaml.dump(existing, { indent: 2, lineWidth: -1, noRefs: true });
}

export async function getDevicesFromZigbeeDb(dbFile: File, SQL: any): Promise<Z2MDeviceEntry[]> {
  const arrayBuffer = await dbFile.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const db = new SQL.Database(uint8Array);

  // ZHA's schema version suffix changes across releases (e.g. _v13, _v15)
  const table = findLatestVersionedTable(db, "devices");

  const query = `SELECT ieee, nwk FROM ${table} WHERE nwk != 0;`;
  const results = db.exec(query);
  if (!results || results.length === 0) {
    return [];
  }

  const { columns, values } = results[0];
  // We assume columns = ["ieee", "nwk"]
  const ieeeIndex = columns.indexOf("ieee");
  const nwkIndex = columns.indexOf("nwk");

  if (ieeeIndex === -1 || nwkIndex === -1) {
    throw new Error(`Table ${table} is missing required columns (ieee, nwk).`);
  }

  const devices: Z2MDeviceEntry[] = values.map((row: any[]) => {
    return {
      ieee: row[ieeeIndex],
      nwk: row[nwkIndex]
    };
  });

  return devices;
}

/**
 * Reads the target file (e.g. database.db) as text
 * and appends lines in JSON format to it:
 *
 *  {"id":2,"type":"EndDevice","ieeeAddr":"0xa4c1382f3923f1c2","nwkAddr":1234}
 *
 * Returns the resulting content, which can be saved as a new file.
 */
export async function appendDevicesToDatabase(
  databaseFile: File,
  newDevices: Z2MDeviceEntry[]
): Promise<string> {
  // Read the contents of the existing file (if any)
  const arrayBuffer = await databaseFile.arrayBuffer();
  let content = new TextDecoder().decode(arrayBuffer);

  // We assume the file already has a coordinator with id=1, so we start at id=2
  // You could also scan `content` for the highest "id" and start at +1
  let currentId = 2;

  let linesToAdd = "";
  for (const entry of newDevices) {
    // Strip colons from the IEEE address
    const macAddr = entry.ieee.replace(/:/g, "");
    linesToAdd += `\n{"id":${currentId},"type":"EndDevice","ieeeAddr":"0x${macAddr}","nwkAddr":${entry.nwk}}`;
    currentId++;
  }

  // Append to the existing content
  content += linesToAdd;
  return content;
}