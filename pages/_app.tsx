import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'react-calendar/dist/Calendar.css';
import "../styles/calendar.css";
import "../styles/calendarOverrides.css";
import "../styles/employeeColors.css";
import Navbar from '../components/Navbar';
import { useRouter } from 'next/router';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const hideNavbar = router.pathname === '/';

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
