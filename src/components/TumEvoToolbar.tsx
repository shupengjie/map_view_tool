import logoUrl from "@/icons/logo.png";

export function TumEvoToolbar({ onBackHome }: { onBackHome?: () => void }) {
  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <img src={logoUrl} alt="" className="toolbar-logo" decoding="async" />
        <span className="toolbar-title">TUM EVO</span>
      </div>
      <div className="toolbar-actions">
        {onBackHome ? (
          <button
            type="button"
            className="godot-btn toolbar-back-home-btn"
            onClick={onBackHome}
            title="所有数据都会被清除"
          >
            返回主页
          </button>
        ) : null}
      </div>
    </header>
  );
}
