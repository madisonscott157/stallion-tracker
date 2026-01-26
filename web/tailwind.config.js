/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Dark navy
        primary: {
          DEFAULT: '#0f172a',
          light: '#1e293b',
        },
        // Accent - Orange
        accent: {
          DEFAULT: '#b45309',
          light: '#d97706',
        },
        // Gold - for wins and G1
        gold: {
          DEFAULT: '#d4af37',
          light: '#f4d03f',
          border: '#b8960c',
        },
        // Silver - for 2nd place and G2
        silver: {
          DEFAULT: '#a8a9ad',
          light: '#c0c0c0',
          border: '#8e8e93',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
