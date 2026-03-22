/**
 * Floating bar when user tries to load a second file whose name ends with `json_map.json`.
 */

import { useEditorStore } from "@/store/useEditorStore";

export function JsonMapDuplicateNotice() {
  const open = useEditorStore((s) => s.jsonMapDuplicateNoticeOpen);
  const dismiss = useEditorStore((s) => s.dismissJsonMapDuplicateNotice);

  if (!open) {
    return null;
  }

  return (
    <div className="floating-notice-bar" role="alertdialog" aria-modal="false" aria-live="polite">
      <span className="floating-notice-text">
        场景中只能存在一个名称以 json_map.json 结尾的地图文件。请先移除已加载的地图后再加载新的。
      </span>
      <button type="button" className="godot-btn godot-btn-primary floating-notice-confirm" onClick={dismiss}>
        确认
      </button>
    </div>
  );
}
