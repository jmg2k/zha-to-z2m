// src/utils.ts

/**
 * Converts a colon-separated hex string into an array of numbers.
 * E.g. "04:08:15:16:23:42:13:37" → [4, 8, 21, 22, 35, 66, 19, 55].
 * If reverse = true, the resulting array is reversed.
 */
export function convertColonHexStringToByteArray(hexStr: string, reverse: boolean = false): number[] {
    const parts = hexStr.split(":").map(part => parseInt(part, 16));
    if (reverse) {
      parts.reverse();
    }
    return parts;
  }

/**
 * ZHA/zigpy bumps its SQLite schema version suffix (e.g. devices_v13 ->
 * devices_v15) across releases. Rather than hardcoding a version, find the
 * highest-numbered table matching `<baseName>_v<N>`.
 */
export function findLatestVersionedTable(db: any, baseName: string): string {
  const results = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '${baseName}_v%';`
  );
  const pattern = new RegExp(`^${baseName}_v(\\d+)$`);
  const versioned = (results[0]?.values ?? [])
    .map((row: any[]) => row[0] as string)
    .map((name: string) => ({ name, version: parseInt(name.match(pattern)?.[1] ?? "", 10) }))
    .filter((entry: { name: string; version: number }) => !isNaN(entry.version));

  if (versioned.length === 0) {
    throw new Error(`No table matching ${baseName}_v<N> found.`);
  }

  versioned.sort((a: { version: number }, b: { version: number }) => b.version - a.version);
  return versioned[0].name;
}