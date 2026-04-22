export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1677ff',
          hover: '#4096ff',
        },
        border: {
          DEFAULT: '#e0e0e0',
          light: '#f0f0f0',
          dark: '#d0d0d0',
        },
        text: {
          primary: '#1a1a1a',
          secondary: '#333',
          tertiary: '#666',
          quaternary: '#999',
          disabled: '#bbb',
        },
        bg: {
          DEFAULT: '#fff',
          secondary: '#f8f8f8',
          tertiary: '#f5f5f5',
          quaternary: '#fafafa',
          hover: '#e8e8e8',
          overlay: 'rgba(0, 0, 0, 0.45)',
        },
        danger: {
          DEFAULT: '#ff4d4f',
          bg: '#fff2f0',
          border: '#ffccc7',
        },
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        modal: '0 8px 32px rgba(0, 0, 0, 0.2)',
        card: '0 2px 8px rgba(22, 119, 255, 0.1)',
        active: '0 0 0 2px rgba(22, 119, 255, 0.2)',
      },
    },
  },
  plugins: [],
}
