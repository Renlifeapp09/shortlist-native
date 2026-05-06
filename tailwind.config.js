/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mint: "#d6ede6",
        "mint-deep": "#a8d5c5",
        "mint-text": "#2a6b55",
      },
    },
  },
  plugins: [],
};
