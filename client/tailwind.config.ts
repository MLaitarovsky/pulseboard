import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Dashboard dark theme
        background: '#0a0a12',
        surface: {
          DEFAULT: '#111119',
          2: '#1a1a26',
          3: '#222233',
        },
        border: '#2a2a3d',
        'text-primary': '#e4e4ef',
        'text-dim': '#8888a0',
        accent: {
          green: '#00e5a0',
          purple: '#6c5ce7',
          red: '#ff6b6b',
          yellow: '#ffd93d',
          blue: '#00b4d8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
