import type { AppProps } from "next/app";
import 'react-calendar/dist/Calendar.css';
import "../styles/globals.css";
import "../styles/calendar.css";


export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
