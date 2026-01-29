import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'neon-green': '#00ffaa',
        'neon-pink': '#ff00aa',
      },
      boxShadow: {
        'glow-green': '0 0 10px #00ffaa, 0 0 20px #00ffaa, 0 0 30px #00ffaa',
        'glow-green-sm': '0 0 5px #00ffaa, 0 0 10px #00ffaa',
        'glow-pink': '0 0 10px #ff00aa, 0 0 20px #ff00aa, 0 0 30px #ff00aa',
        'glow-pink-sm': '0 0 5px #ff00aa, 0 0 10px #ff00aa',
      },
    },
  },
  plugins: [],
};

export default config;
