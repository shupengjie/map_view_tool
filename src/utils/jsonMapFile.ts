/**
 * Map bundle files: extension `.json`; basename contains the segment `json_map` as a token
 * (not a prefix of e.g. `json_mapper`), with any allowed tail before `.json`
 * (e.g. `foo_json_map.json`, `2_json_map (1).json`, `json_map_backup.json`).
 */
export function isJsonMapFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".json")) {
    return false;
  }
  const base = lower.slice(0, -".json".length);
  // `json_map` preceded by start/non-alphanumeric; not followed immediately by [a-z] (excludes `json_mapper`).
  return /(^|[^a-z0-9])json_map(?![a-z])/g.test(base);
}
