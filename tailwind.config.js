/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.55)', opacity: '0' },
          '65%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'pop-in': 'pop-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1.35) both',
        'fade-in': 'fade-in 260ms ease-out both',
        'slide-up': 'slide-up 320ms ease-out both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
      boxShadow: {
        cell: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.45)',
        'glow-safe':
          '0 0 20px rgba(52, 211, 153, 0.30), inset 0 0 12px rgba(52, 211, 153, 0.18)',
        'glow-danger':
          '0 0 20px rgba(251, 113, 133, 0.28), inset 0 0 12px rgba(251, 113, 133, 0.16)',
      },
    },
  },
  plugins: [],
}
