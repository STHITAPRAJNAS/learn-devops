/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Docker blue
        docker: {
          50:  "#eff8ff",
          100: "#dbeffe",
          500: "#0db7ed",
          600: "#0891b2",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        // Kubernetes blue
        k8s: {
          50:  "#eff6ff",
          100: "#dbeafe",
          500: "#326de6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
        // Helm teal
        helm: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          500: "#0277b6",
          600: "#0891b2",
          700: "#0e7490",
          900: "#164e63",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            maxWidth: "none",
            code: {
              backgroundColor: theme("colors.gray.100"),
              padding: "0.2em 0.4em",
              borderRadius: "0.25rem",
              fontWeight: "400",
            },
            "code::before": { content: '""' },
            "code::after":  { content: '""' },
          },
        },
      }),
    },
  },
  plugins: [],
};
