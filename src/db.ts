// src/db.ts

import { ZHABackup } from "./types";
import { findLatestVersionedTable } from "./utils";

export async function getZhaBackup(dbFile: File, SQL: any): Promise<ZHABackup> {
  // Read the file contents
  const arrayBuffer = await dbFile.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Create an in-memory database
  const db = new SQL.Database(uint8Array);

  // ZHA's schema version suffix changes across releases (e.g. _v13, _v15)
  const table = findLatestVersionedTable(db, "network_backups");

  // Fetch the most recent record
  const query = `SELECT * FROM ${table} ORDER BY id DESC LIMIT 1;`;
  const results = db.exec(query);
  if (!results || results.length === 0) {
    throw new Error(`Table ${table} is empty or does not exist.`);
  }

  const { columns, values } = results[0];
  const backupJsonIndex = columns.indexOf("backup_json");
  if (backupJsonIndex === -1) {
    throw new Error("Column backup_json not found.");
  }

  const backupJsonValue = values[0][backupJsonIndex];
  if (typeof backupJsonValue !== "string") {
    throw new Error("backup_json is not a string!");
  }

  // Parse the JSON
  let backupData: ZHABackup;
  try {
    backupData = JSON.parse(backupJsonValue);
  } catch (error) {
    throw new Error("Error parsing backup JSON: " + error);
  }

  return backupData;
}