/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans TC"', '"Source Han Sans TC"', 'sans-serif'],
        display: ['"Noto Serif TC"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      colors: {
        sage: {
          50: '#f4f7f4', 100: '#e6ede6', 200: '#ccdacc',
          300: '#a4bfa4', 400: '#759e75', 500: '#527f52',
          600: '#3f643f', 700: '#335033', 800: '#2a412a', 900: '#233623'
        },
        cream: { 50: '#fdfcf8', 100: '#faf6ed', 200: '#f4ecda' },
        coral: { 400: '#f87c6b', 500: '#f4634f', 600: '#e04b37' },
        amber: { 400: '#fbbf24', 500: '#f59e0b' },
        sky: { 400: '#38bdf8', 500: '#0ea5e9' }
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
        inner: 'inset 0 1px 3px rgba(0,0,0,0.07)'
      },
      borderRadius: { xl: '1rem', '2xl': '1.5rem', '3xl': '2rem' }
    }
  },
  plugins: []
}
