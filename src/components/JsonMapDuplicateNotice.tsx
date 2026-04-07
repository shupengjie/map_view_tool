/**
 * Floating bar when user tries to load a second file that matches `isJsonMapFileName`.
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
        场景中只能存在一个 JSON 地图文件（须为 .json 且含 json_map）。请先移除已加载的地图后再加载新的。
      </span>
      <button type="button" className="godot-btn godot-btn-primary floating-notice-confirm" onClick={dismiss}>
        确认
      </button>
    </div>
  );
}
