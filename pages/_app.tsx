import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'react-calendar/dist/Calendar.css';
import "../styles/calendar.css";
import "../styles/calendarOverrides.css";
import Navbar from '../components/Navbar';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Navbar />
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
