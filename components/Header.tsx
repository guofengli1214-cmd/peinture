import React, { useState } from "react";
import { Logo } from "./Icons";
import { Tooltip } from "./Tooltip";
import { useSettingsStore } from "../store/settingsStore";
import { useUIStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { translations } from "../translations";
import {
  Sparkles,
  Settings,
  CircleHelp,
  Github,
  PencilRuler,
  ChevronDown,
  Check,
  Image as ImageIcon,
  LogOut,
  ShieldCheck,
} from "lucide-react";

export type AppView = "creation" | "editor" | "gallery";

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenFAQ: () => void;
  onOpenAdmin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenFAQ,
  onOpenAdmin,
}) => {
  const { language } = useSettingsStore();
  const { currentView, setCurrentView } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const t = translations[language];
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <header className="w-full backdrop-blur-md sticky top-0 z-50 bg-card border-b border-stroke">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-2 py-3 md:px-8 md:py-4 relative">
        {/* Logo & Title - Visible on all devices */}
        <div className="flex items-center gap-2 text-ink shrink-0">
          <Logo className="size-8 md:size-10" />
          <h1 className="text-ink text-lg md:text-xl font-bold leading-tight tracking-[-0.015em]">
            {t.appTitle}
          </h1>
        </div>

        {/* Mobile: View Switcher Dropdown (Centered) */}
        <div className="md:hidden absolute left-1/2 -translate-x-1/2 z-50 select-none">
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-stroke backdrop-blur-md text-sm font-medium text-ink shadow-card active:scale-95 transition-all"
          >
            {currentView === "creation" ? (
              <>
                <Sparkles className="w-4 h-4" />
                {t.nav_creation}
              </>
            ) : currentView === "editor" ? (
              <>
                <PencilRuler className="w-4 h-4" />
                {t.nav_editor}
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                {t.nav_gallery}
              </>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isMobileNavOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Dropdown Menu */}
          {isMobileNavOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMobileNavOpen(false)}
              />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-surface backdrop-blur-xl border border-stroke rounded-xl shadow-flyout p-1.5 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => {
                    setCurrentView("creation");
                    setIsMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === "creation" ? "bg-accent-light text-accent" : "text-ink-secondary hover:bg-fill-subtle hover:text-ink"}`}
                >
                  <Sparkles className="w-4 h-4" />
                  {t.nav_creation}
                  {currentView === "creation" && (
                    <Check className="w-3.5 h-3.5 ml-auto" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setCurrentView("editor");
                    setIsMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === "editor" ? "bg-accent-light text-accent" : "text-ink-secondary hover:bg-fill-subtle hover:text-ink"}`}
                >
                  <PencilRuler className="w-4 h-4" />
                  {t.nav_editor}
                  {currentView === "editor" && (
                    <Check className="w-3.5 h-3.5 ml-auto" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setCurrentView("gallery");
                    setIsMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === "gallery" ? "bg-accent-light text-accent" : "text-ink-secondary hover:bg-fill-subtle hover:text-ink"}`}
                >
                  <ImageIcon className="w-4 h-4" />
                  {t.nav_gallery}
                  {currentView === "gallery" && (
                    <Check className="w-3.5 h-3.5 ml-auto" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Desktop: Sliding Pill Navigation (Centered) */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
          <div className="relative flex items-center bg-fill-subtle border border-stroke rounded-full p-1 w-[300px]">
            {/* Background Sliding Pill */}
            <div
              className={`absolute top-1 bottom-1 rounded-full bg-accent shadow-card transition-all duration-300 ease-out z-0 w-[calc(33.33%-4px)]
                    ${
                      currentView === "creation"
                        ? "left-1"
                        : currentView === "editor"
                          ? "left-[calc(33.33%+2px)]"
                          : "left-[calc(66.66%+2px)]"
                    }
                    `}
            />

            {/* Creation Button */}
            <button
              onClick={() => setCurrentView("creation")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium transition-colors duration-300 ${currentView === "creation" ? "text-on-accent" : "text-ink-secondary hover:text-ink"}`}
            >
              <Sparkles className="w-4 h-4" />
              {t.nav_creation}
            </button>

            {/* Editor Button */}
            <button
              onClick={() => setCurrentView("editor")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium transition-colors duration-300 ${currentView === "editor" ? "text-on-accent" : "text-ink-secondary hover:text-ink"}`}
            >
              <PencilRuler className="w-4 h-4" />
              {t.nav_editor}
            </button>

            {/* Gallery Button */}
            <button
              onClick={() => setCurrentView("gallery")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium transition-colors duration-300 ${currentView === "gallery" ? "text-on-accent" : "text-ink-secondary hover:text-ink"}`}
            >
              <ImageIcon className="w-4 h-4" />
              {t.nav_gallery}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1 shrink-0">
          <Tooltip content={t.sourceCode} position="bottom">
            <a
              href="https://github.com/Amery2010/peinture"
              className="flex items-center justify-center p-2 rounded-lg text-ink-secondary hover:text-accent hover:bg-fill transition-all active:scale-95"
              target="_blank"
            >
              <Github className="w-5 h-5" />
            </a>
          </Tooltip>

          <Tooltip content={t.help} position="bottom">
            <button
              onClick={onOpenFAQ}
              className="flex items-center justify-center p-2 rounded-lg text-ink-secondary hover:text-accent hover:bg-fill transition-all active:scale-95"
            >
              <CircleHelp className="w-5 h-5" />
            </button>
          </Tooltip>

          <Tooltip content={t.settings} position="bottom">
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center p-2 rounded-lg text-ink-secondary hover:text-accent hover:bg-fill transition-all active:scale-95"
            >
              <Settings className="w-5 h-5" />
            </button>
          </Tooltip>

          {user?.role === "admin" && onOpenAdmin && (
            <Tooltip content={t.admin_panel} position="bottom">
              <button
                onClick={onOpenAdmin}
                className="flex items-center justify-center p-2 rounded-lg text-ink-secondary hover:text-accent hover:bg-fill transition-all active:scale-95"
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            </Tooltip>
          )}

          {user && (
            <>
              {/* User chip (desktop only) */}
              <div className="hidden md:flex items-center gap-1.5 pl-2 ml-1 border-l border-stroke max-w-[140px]">
                <span className="text-sm text-ink-secondary font-medium truncate">
                  {user.displayName || user.username}
                </span>
                {user.role === "admin" && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold text-accent bg-accent-light rounded px-1.5 py-0.5">
                    {t.account_role_admin}
                  </span>
                )}
              </div>

              <Tooltip content={t.logout} position="bottom">
                <button
                  onClick={() => logout()}
                  className="flex items-center justify-center p-2 rounded-lg text-ink-secondary hover:text-accent hover:bg-fill transition-all active:scale-95"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
