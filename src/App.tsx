/**
 * Root app: home hub + feature pages (Json Map View, TUM EVO).
 */

import "@/App.css";
import { JsonMapViewPage } from "@/components/JsonMapViewPage";
import { TumEvoPage } from "@/components/TumEvoPage";
import { useEditorStore } from "@/store/useEditorStore";
import { useState } from "react";

export default function App() {
  const [page, setPage] = useState<"home" | "json-map-view" | "tum-evo">("home");
  const resetWorkspace = useEditorStore((s) => s.resetWorkspace);

  const handleBackHome = () => {
    resetWorkspace();
    setPage("home");
  };

  if (page === "home") {
    return (
      <div className="app-shell app-shell--home">
        <main className="home-page">
          <header className="home-page-header">
            <h1 className="home-page-title">泊车SLAM工具集</h1>
            <p className="home-page-subtitle">快速进入各类泊车SLAM常用工具。</p>
          </header>
          <section className="home-grid" aria-label="功能入口列表">
            <button
              type="button"
              className="home-entry-card home-entry-card--primary"
              onClick={() => setPage("json-map-view")}
            >
              <span className="home-entry-title">Json Map View</span>
              <span className="home-entry-desc">加载并查看 json_map 资源，使用场景树、3D 视口和属性面板进行分析。</span>
              <span className="home-entry-action">进入功能</span>
            </button>
            <button
              type="button"
              className="home-entry-card home-entry-card--placeholder"
              onClick={() => setPage("tum-evo")}
            >
              <span className="home-entry-title">TUM EVO</span>
              <span className="home-entry-desc">TUM 格式轨迹的类 EVO 精度对比展示。</span>
              <span className="home-entry-action">进入功能</span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (page === "tum-evo") {
    return <TumEvoPage onBackHome={handleBackHome} />;
  }

  return <JsonMapViewPage onBackHome={handleBackHome} />;
}
