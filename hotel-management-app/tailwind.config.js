const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './views/**/*.ejs' // Scan all EJS files for classes
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}