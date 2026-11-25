/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        shogi: {
          bg: '#0f141c',
          panel: '#18202c',
          card: '#1f2937',
          border: '#2e3a4e',
          accent: '#d97706',
          'accent-light': '#f59e0b',
          'board-bg': '#e6ba82',
          'board-dark': '#cb9d66',
        },
      },
      fontFamily: {
        shogi: ['"Noto Serif JP"', '"Shippori Mincho"', '"Yu Mincho"', '"Hiragino Mincho ProN"', 'serif'],
      },
    },
  },
  plugins: [],
};
