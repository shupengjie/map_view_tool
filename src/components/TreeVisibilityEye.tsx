/**
 * Small viewport-visibility toggle (eye open / eye closed) for scene tree rows.
 */

interface TreeVisibilityEyeProps {
  readonly visible: boolean;
  readonly onToggle: () => void;
}

export function TreeVisibilityEye({ visible, onToggle }: TreeVisibilityEyeProps) {
  return (
    <button
      type="button"
      className="tree-eye-btn"
      title={visible ? "在 3D 视口中隐藏此节点及其子项" : "在 3D 视口中显示此节点及其子项"}
      aria-label={visible ? "隐藏子树" : "显示子树"}
      aria-pressed={!visible}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {visible ? <EyeOpenIcon /> : <EyeOffIcon />}
    </button>
  );
}

function EyeOpenIcon() {
  return (
    <svg
      className="tree-eye-svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="tree-eye-svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 10-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
