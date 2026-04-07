/**
 * Layer export bundle: file name must end with `layer_data.json` (e.g. `0407_093132_layer_data.json`).
 */
export function isLayerDataJsonFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith("layer_data.json");
}
