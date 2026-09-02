/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.65)', opacity: '0' },
          '65%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.42' },
        },
      },
      animation: {
        'pop-in': 'pop-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
