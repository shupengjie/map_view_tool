/**
 * Small destructive action button for scene-tree rows. Currently used on pin leaves to remove a
 * single pin; deliberately stops click propagation so it never doubles as a row-select.
 */

interface TreeTrashButtonProps {
  readonly onConfirm: () => void;
  readonly title?: string;
}

export function TreeTrashButton({ onConfirm, title = "删除该节点" }: TreeTrashButtonProps) {
  return (
    <button
      type="button"
      className="tree-trash-btn"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onConfirm();
      }}
    >
      <TrashIcon />
    </button>
  );
}

function TrashIcon() {
  return (
    <svg
      className="tree-trash-svg"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
