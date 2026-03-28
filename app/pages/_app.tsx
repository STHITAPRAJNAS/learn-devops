import type { AppProps } from "next/app";
import "@/styles/globals.css";
import "highlight.js/styles/github-dark.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
