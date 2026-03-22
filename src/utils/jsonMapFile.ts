/**
 * Map bundle files: name must end with `json_map.json` (e.g. `foo_json_map.json`, `json_map.json`).
 */
export function isJsonMapFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith("json_map.json");
}
