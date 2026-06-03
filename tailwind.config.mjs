import containerQueries from '@tailwindcss/container-queries'
import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fluent 蓝（强调色）
        "accent": "#0F6CBD",
        "accent-hover": "#115EA3",
        "accent-pressed": "#0F548C",
        "accent-light": "#EBF3FC",
        // 画布与表面
        "canvas": "#F3F6FB",
        "card": "rgba(255,255,255,0.72)",
        "surface": "#FFFFFF",
        "fill-subtle": "rgba(0,0,0,0.03)",
        "fill": "rgba(0,0,0,0.06)",
        "fill-strong": "rgba(0,0,0,0.09)",
        // 墨色（文字/图标）
        "ink": "#242424",
        "ink-secondary": "#5C5C5C",
        "ink-tertiary": "#8A8A8A",
        "ink-placeholder": "#BDBDBD",
        "on-accent": "#FFFFFF",
        // 描边
        "stroke": "rgba(0,0,0,0.08)",
        "stroke-subtle": "rgba(0,0,0,0.05)",
        "stroke-strong": "rgba(0,0,0,0.18)",
      },
      fontFamily: {
        "display": ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.375rem",
        "md": "0.375rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "0.75rem",
        "full": "9999px"
      },
      boxShadow: {
        "card": "0 2px 4px rgba(0,0,0,0.10), 0 0 2px rgba(0,0,0,0.08)",
        "card-hover": "0 8px 16px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.10)",
        "flyout": "0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)",
        "dialog": "0 14px 28px rgba(0,0,0,0.20), 0 0 8px rgba(0,0,0,0.14)",
      },
      transitionTimingFunction: {
        "fluent": "cubic-bezier(0.1, 0.9, 0.2, 1)",
      },
    },
  },
  plugins: [
    forms,
    containerQueries,
  ],
}