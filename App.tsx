
import React, { useState, useCallback, memo, useEffect } from 'react';
import { useUIStore } from './store/uiStore';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { useAppInit } from './hooks/useAppInit';
import { useCloudUpload } from './hooks/useCloudUpload';
import { fetchConfig } from './services/configService';
import { hydrateFromServerConfig, startConfigSync, resetConfigSync } from './services/configSync';
import { translations } from './translations';
import { Header } from './components/Header';
import { CreationView } from './views/CreationView';
const ImageEditorView = React.lazy(() => import('./views/ImageEditorView').then(module => ({ default: module.ImageEditorView })));
const CloudGalleryView = React.lazy(() => import('./views/CloudGalleryView').then(module => ({ default: module.CloudGalleryView })));
import { SettingsModal } from './components/SettingsModal';
import { FAQModal } from './components/FAQModal';
import { LoginView } from './components/LoginView';
const AdminView = React.lazy(() => import('./views/AdminView').then(module => ({ default: module.AdminView })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';

// Memoize Header to prevent re-renders when App re-renders
const MemoizedHeader = memo(Header);

const ToasterPortal = () => (
  <Toaster
    theme="light"
    position="top-center"
    toastOptions={{
      style: {
        background: '#FFFFFF',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        color: '#242424',
        boxShadow: '0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
      },
    }}
  />
);

const FullscreenSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-gradient-brilliant">
    <Loader2 className="w-8 h-8 text-accent animate-spin" />
  </div>
);

/**
 * The main application UI. Mounted only once the session and per-user config are
 * both ready, so init side effects (OPFS hydration, polling, server-mode setup)
 * see the hydrated config.
 */
function MainApp() {
  const { currentView } = useUIStore();

  // Transition State
  const [displayView, setDisplayView] = useState(currentView);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (currentView !== displayView) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayView(currentView);
        // Allow a frame for render before fading in
        requestAnimationFrame(() => {
            setIsTransitioning(false);
        });
      }, 200); // Wait for fade out
      return () => clearTimeout(timer);
    }
  }, [currentView, displayView]);

  // Initialization Logic Hook (side effects only)
  useAppInit();

  // Cloud Upload Logic Hook
  const { handleUploadToCloud } = useCloudUpload();

  // Modal States
  const [showSettings, setShowSettings] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const handleOpenSettings = useCallback(() => setShowSettings(true), []);
  const handleOpenFAQ = useCallback(() => setShowFAQ(true), []);
  const handleOpenAdmin = useCallback(() => setShowAdmin(true), []);

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-gradient-brilliant">
      <div className="flex h-full grow flex-col">
        {/* Header */}
        <MemoizedHeader
            onOpenSettings={handleOpenSettings}
            onOpenFAQ={handleOpenFAQ}
            onOpenAdmin={handleOpenAdmin}
        />

        {/* Main Content Area with Transition */}
        <div className={`flex-1 flex flex-col w-full transition-all duration-200 ease-in-out ${isTransitioning ? 'opacity-0 translate-y-2 scale-[0.99]' : 'opacity-100 translate-y-0 scale-100'}`}>
            <ErrorBoundary>
            {displayView === 'creation' ? (
                <CreationView />
            ) : displayView === 'editor' ? (
                <main className="w-full flex-1 flex flex-col items-center justify-center md:p-4">
                    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50 text-sm">Loading Editor...</div>}>
                        <ImageEditorView
                          onOpenSettings={handleOpenSettings}
                          handleUploadToS3={handleUploadToCloud}
                        />
                    </React.Suspense>
                </main>
            ) : (
                <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col gap-4 px-4 md:px-8 pb-8 pt-6">
                    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50 text-sm">Loading Gallery...</div>}>
                        <CloudGalleryView
                            handleUploadToS3={handleUploadToCloud}
                            onOpenSettings={handleOpenSettings}
                        />
                    </React.Suspense>
                </main>
            )}
            </ErrorBoundary>
        </div>

        {/* Modals */}
        <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
        />

        <FAQModal
            isOpen={showFAQ}
            onClose={() => setShowFAQ(false)}
        />

        {showAdmin && (
          <React.Suspense fallback={<FullscreenSpinner />}>
            <AdminView isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
          </React.Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * Authenticated shell: loads the user's config from the server (single source of
 * truth) and starts debounced sync before rendering the app. Only syncs on a
 * successful hydration, so a failed load never overwrites server state with defaults.
 */
function AuthedApp() {
  const language = useSettingsStore((s) => s.language);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        hydrateFromServerConfig(cfg);
        startConfigSync();
      } catch (e) {
        console.error('Failed to load config', e);
        if (!cancelled) toast.error(translations[language].config_load_failed);
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
      resetConfigSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!configReady) return <FullscreenSpinner />;
  return <MainApp />;
}

export default function App() {
  const status = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);

  // Resolve the current session once on boot.
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <>
      {status === 'loading' ? (
        <FullscreenSpinner />
      ) : status === 'anonymous' ? (
        <LoginView />
      ) : (
        <AuthedApp />
      )}

      <ToasterPortal />
    </>
  );
}
