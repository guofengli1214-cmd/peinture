import React, { useRef, useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";

export interface SettingsTabItem {
  id: string;
  icon: React.ElementType;
  label: string;
}

interface SettingsTabsProps {
  tabs: SettingsTabItem[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const SettingsTabs: React.FC<SettingsTabsProps> = ({
  tabs,
  activeTab,
  setActiveTab,
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollTabs, setCanScrollTabs] = useState(false);

  const checkTabsScroll = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollTabs(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkTabsScroll();
    window.addEventListener("resize", checkTabsScroll);
    return () => window.removeEventListener("resize", checkTabsScroll);
  }, [tabs]);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (tabsRef.current) {
      const activeBtn = tabsRef.current.querySelector(
        `button[data-tab-id="${activeTab}"]`,
      );
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [activeTab]);

  const handleScrollTabsRight = () => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: 150, behavior: "smooth" });
      setTimeout(checkTabsScroll, 300);
    }
  };

  return (
    <div className="relative border-b border-stroke-subtle">
      <div
        ref={tabsRef}
        onScroll={checkTabsScroll}
        className="flex items-center px-5 space-x-6 overflow-x-auto scrollbar-hide pr-12"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative py-4 text-sm font-medium transition-colors duration-300 flex items-center gap-2 flex-shrink-0 ${activeTab === tab.id ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary"}`}
          >
            <tab.icon
              className={`w-4 h-4 transition-colors duration-300 ${activeTab === tab.id ? "text-accent" : "text-current group-hover:text-accent/70"}`}
            />
            {tab.label}
            <span
              className={`absolute bottom-0 left-0 w-full h-0.5 bg-accent rounded-full transition-all duration-300 ease-out origin-center ${activeTab === tab.id ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"}`}
            />
          </button>
        ))}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-surface via-surface/80 to-transparent flex items-center justify-center pointer-events-none">
        <button
          onClick={handleScrollTabsRight}
          disabled={!canScrollTabs}
          className={`pointer-events-auto p-1.5 rounded-full transition-all duration-300 ${canScrollTabs ? "text-ink bg-fill hover:bg-fill-strong shadow-card" : "text-ink-tertiary"}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
