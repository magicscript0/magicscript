/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#030712',
          surface: '#070d1b',
          card: 'rgba(8, 14, 28, 0.75)',
          cyan: '#00f2fe',
          cyanGlow: 'rgba(0, 242, 254, 0.35)',
          violet: '#8b5cf6',
          violetGlow: 'rgba(139, 92, 246, 0.35)',
          gold: '#fbbf24',
          crimson: '#ef4444',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-spin': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
