import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Google Search Console verification tag */}
        <meta name="google-site-verification" content="xewiP9Wju6-kVFZ6Yd_Em05wrLk9KlfrUNmLTwVmkS8" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
