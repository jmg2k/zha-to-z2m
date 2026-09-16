import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import yaml from "js-yaml";

import { getZhaBackup } from "./db";
import { parseRegistryFile, parseAreaRegistryFile, extractZhaDevices } from "./registry";
import { buildZ2MConfig, buildCoordinatorBackupJson, mergeIntoExistingConfig, getDevicesFromZigbeeDb, appendDevicesToDatabase} from "./z2m";


async function initApp() {
    // 1) Initialize sql.js
    const SQL = await initSqlJs({
      locateFile: () => wasmUrl
    });

    // 2) Handle "Process files" button (generates YAML from backup + registry)
    const processBtn = document.getElementById("processBtn") as HTMLButtonElement;
    processBtn.addEventListener("click", async () => {
      try {
        const dbFileInput = document.getElementById("dbFile") as HTMLInputElement;
        if (!dbFileInput.files || dbFileInput.files.length === 0) {
          alert("Please select the database file (ZHA backup).");
          return;
        }
        const backupData = await getZhaBackup(dbFileInput.files[0], SQL);

        const regFileInput = document.getElementById("deviceRegistryFile") as HTMLInputElement;
        if (!regFileInput.files || regFileInput.files.length === 0) {
          alert("Please select the core.device_registry file.");
          return;
        }
        const registryData = await parseRegistryFile(regFileInput.files[0]);

        // core.area_registry is optional; when provided, it's used to
        // disambiguate device names that HA only guarantees unique per room
        const areaRegistryFileInput = document.getElementById("areaRegistryFile") as HTMLInputElement;
        const areaRegistryData = (areaRegistryFileInput.files && areaRegistryFileInput.files.length > 0)
          ? await parseAreaRegistryFile(areaRegistryFileInput.files[0])
          : undefined;

        const zhaDevices = extractZhaDevices(registryData, areaRegistryData);

        // Build the Z2MConfig
        const z2mConfig = buildZ2MConfig(backupData, zhaDevices);

        // If an existing configuration.yaml was supplied, merge advanced+devices
        // into it for a complete, ready-to-use file; otherwise emit just the fragment.
        const existingConfigInput = document.getElementById("existingConfigFile") as HTMLInputElement;
        const hasExistingConfig = !!(existingConfigInput.files && existingConfigInput.files.length > 0);
        const yamlString = hasExistingConfig
          ? mergeIntoExistingConfig(await existingConfigInput.files![0].text(), z2mConfig)
          : yaml.dump(z2mConfig, { indent: 2, lineWidth: -1, noRefs: true });
        const yamlFilename = hasExistingConfig ? "configuration.yaml" : "z2m_config_fragment.yaml";

        // Display in <pre>
        const outputElem = document.getElementById("output") as HTMLElement;
        outputElem.textContent = yamlString;

        // Download link
        const blob = new Blob([yamlString], { type: "application/x-yaml" });
        const url = URL.createObjectURL(blob);
        let downloadLink = document.getElementById("downloadLink") as HTMLAnchorElement;
        if (!downloadLink) {
          downloadLink = document.createElement("a");
          downloadLink.id = "downloadLink";
          document.body.appendChild(downloadLink);
        }
        downloadLink.textContent = hasExistingConfig
          ? "Download merged configuration.yaml"
          : "Download generated YAML fragment (advanced + devices only)";
        downloadLink.href = url;
        downloadLink.download = yamlFilename;
        downloadLink.hidden = false;

        // coordinator_backup.json: same Open Coordinator Backup format as
        // Z2M's own coordinator_backup.json, so it can be dropped in as-is
        // to restore this exact network instead of forming a new one.
        const coordinatorBackupJson = buildCoordinatorBackupJson(backupData, z2mConfig);
        const cbBlob = new Blob([coordinatorBackupJson], { type: "application/json" });
        const cbUrl = URL.createObjectURL(cbBlob);
        let cbLink = document.getElementById("coordinatorBackupLink") as HTMLAnchorElement;
        if (!cbLink) {
          cbLink = document.createElement("a");
          cbLink.id = "coordinatorBackupLink";
          document.body.appendChild(cbLink);
        }
        cbLink.textContent = "Download coordinator_backup.json";
        cbLink.href = cbUrl;
        cbLink.download = "coordinator_backup.json";
        cbLink.hidden = false;

      } catch (error) {
        alert(`An error occurred: ${error}`);
      }
    });

    // 3) Handle "Add to Z2M Database" button (reads devices_v13 and appends to database.db)
    const appendBtn = document.getElementById("appendBtn") as HTMLButtonElement;
    appendBtn.addEventListener("click", async () => {
      try {
        const dbFileInput = document.getElementById("dbFile") as HTMLInputElement;
        if (!dbFileInput.files || dbFileInput.files.length === 0) {
            alert("Please select the database file (ZHA backup).");
            return;
          }
        const deviceEntries = await getDevicesFromZigbeeDb(dbFileInput.files[0], SQL);
        if (deviceEntries.length === 0) {
          alert("No devices found (or no rows with nwk != 0).");
          return;
        }

        // User selects the target file "database.db"
        const z2mDatabaseFileInput = document.getElementById("z2mDatabaseFile") as HTMLInputElement;
        if (!z2mDatabaseFileInput.files || z2mDatabaseFileInput.files.length === 0) {
          alert("Please select the target file 'database.db'.");
          return;
        }

        // Append JSON lines to the target file
        const newContent = await appendDevicesToDatabase(
          z2mDatabaseFileInput.files[0],
          deviceEntries
        );

        // Show the result in the console or <pre> (optional)
        console.log("New database.db content:\n", newContent);

        // Allow downloading the new version of the file
        const blob = new Blob([newContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        let dlLink = document.getElementById("dbDownloadLink") as HTMLAnchorElement;
        if (!dlLink) {
          dlLink = document.createElement("a");
          dlLink.id = "dbDownloadLink";
          document.body.appendChild(dlLink);
        }
        dlLink.textContent = "Download updated database.db file";
        dlLink.href = url;
        dlLink.download = "database.db";
        dlLink.hidden = false;

        alert("Updated database.db content is ready to download!");
      } catch (error) {
        alert(`An error occurred while updating database.db: ${error}`);
      }
    });
  }

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});