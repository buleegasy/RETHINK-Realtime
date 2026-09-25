export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          dim: '#fafafa',
          container: '#f5f5f5',
          high: '#ebebeb',
          border: '#e0e0e0',
        },
        on: {
          surface: '#111111',
          muted: '#666666',
          faint: '#999999',
        },
        primary: {
          DEFAULT: '#111111',
          hover: '#333333',
          light: '#f0f0f0',
        },
        status: {
          online: '#10b981',
          busy: '#f59e0b',
          offline: '#ef4444',
        },
        eink: {
          black: '#000000',
          dark: '#222222',
          gray: '#777777',
          light: '#e8e8e8',
          white: '#ffffff',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'eink': '2px 2px 0px 0px #000000',
        'eink-lg': '4px 4px 0px 0px #000000',
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
