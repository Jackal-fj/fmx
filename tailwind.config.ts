import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy:    '#1F4E79',
        muted:   '#595959',
        accent:  '#D5E8F0',
        good:    '#2E7D32',
        ok:      '#0D47A1',
        warn:    '#E65100',
        bad:     '#B71C1C',
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
