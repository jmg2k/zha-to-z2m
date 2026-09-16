// src/registry.ts

import { HARegistry, HADevice, HAAreaRegistry } from "./types";

/**
 * Reads a JSON file and returns an HARegistry object.
 */
export async function parseRegistryFile(regFile: File): Promise<HARegistry> {
  const regArrayBuffer = await regFile.arrayBuffer();
  const regJsonStr = new TextDecoder().decode(regArrayBuffer);

  let registryData: HARegistry;
  try {
    registryData = JSON.parse(regJsonStr);
  } catch (error) {
    throw new Error("Error parsing core.device_registry file: " + error);
  }
  return registryData;
}

/**
 * Reads a JSON file and returns an HAAreaRegistry object.
 */
export async function parseAreaRegistryFile(areaFile: File): Promise<HAAreaRegistry> {
  const areaArrayBuffer = await areaFile.arrayBuffer();
  const areaJsonStr = new TextDecoder().decode(areaArrayBuffer);

  let areaRegistryData: HAAreaRegistry;
  try {
    areaRegistryData = JSON.parse(areaJsonStr);
  } catch (error) {
    throw new Error("Error parsing core.area_registry file: " + error);
  }
  return areaRegistryData;
}

/**
 * Extracts devices whose `identifiers` contain the pair ["zha", <ieee>].
 * Returns a map { <ieee>: <friendly_name> }.
 *
 * HA only requires device names to be unique within a room, while Z2M's
 * friendly_name is global. When areaRegistry is provided, any device
 * assigned to a room has that room name appended to avoid collisions.
 */
export function extractZhaDevices(registry: HARegistry, areaRegistry?: HAAreaRegistry): Record<string, string> {
  const areaNames: Record<string, string> = {};
  if (areaRegistry) {
    areaRegistry.data.areas.forEach(area => {
      areaNames[area.id] = area.name;
    });
  }

  const devices: Record<string, string> = {};

  registry.data.devices
    .filter((device: HADevice) =>
      device.identifiers?.length > 0 &&
      device.identifiers[0][0] === "zha"
    )
    .forEach(device => {
      const ieee = device.identifiers[0][1].replaceAll(":","");
      const name = device.name_by_user ? device.name_by_user.trim() : device.name.trim();
      const areaName = device.area_id ? areaNames[device.area_id] : undefined;
      devices[ieee] = areaName ? `${name} (${areaName})` : name;
    });

  return devices;
}