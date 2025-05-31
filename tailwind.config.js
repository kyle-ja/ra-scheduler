module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  
  theme: {
    extend: {
      colors: {
        'psu-blue': '#001E44',
        'psu-light-blue': '#1E407C',
        'psu-white': '#FFFFFF',
        'psu-gray': '#E5E9F2',
        'psu-gold': '#FFB81C',
        'test-color': '#FF0000',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
    },
  },
  plugins: [],
}