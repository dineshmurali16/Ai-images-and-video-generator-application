/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#09090b',
        panel: '#111116',
        'panel-light': '#17171e',
      },
      boxShadow: {
        glow: '0 0 50px rgba(125, 92, 246, 0.16)',
      },
    },
  },
  plugins: [],
}
