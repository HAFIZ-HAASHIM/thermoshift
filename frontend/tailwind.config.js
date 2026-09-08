/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ts: {
          bg: '#F4F6F5',
          surface: '#FFFFFF',
          elevated: '#EEF2F0',
          hover: '#EBF0ED',
          border: '#DCE3DF',
          borderHover: '#BFCBC6',
          text: '#17211D',
          muted: '#68736E',
          dim: '#8F9B96',
          primary: '#176B52',
          primaryDark: '#0E4D3B',
          primaryLight: '#E8F1ED',
          primaryBorder: '#C4DCD0',
          warning: '#D88A28',
          warningLight: '#FAF2E8',
          warningBorder: '#F1D4B0',
          critical: '#C85C52',
          criticalLight: '#FDF1F0',
          criticalBorder: '#F3C7C3',
          safe: '#4D8A6A',
          safeLight: '#E8F1ED',
          safeBorder: '#C4DCD0',
          softGreen: '#E8F1ED',
        }
      }
    },
  },
  plugins: [],
}


