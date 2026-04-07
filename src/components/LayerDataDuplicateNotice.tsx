/**
 * Floating bar when user tries to load a second file whose name ends with `layer_data.json`.
 */

import { useEditorStore } from "@/store/useEditorStore";

export function LayerDataDuplicateNotice() {
  const open = useEditorStore((s) => s.layerDataDuplicateNoticeOpen);
  const dismiss = useEditorStore((s) => s.dismissLayerDataDuplicateNotice);

  if (!open) {
    return null;
  }

  return (
    <div
      className="floating-notice-bar floating-notice-bar--layer-data"
      role="alertdialog"
      aria-modal="false"
      aria-live="polite"
    >
      <span className="floating-notice-text">
        场景中只能存在一个名称以 layer_data.json 结尾的 Layer 文件。请先在「已加载文件」中移除当前 Layer 后再加载新的。
      </span>
      <button type="button" className="godot-btn godot-btn-primary floating-notice-confirm" onClick={dismiss}>
        确认
      </button>
    </div>
  );
}
