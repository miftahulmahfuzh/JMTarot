import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /* The floating dev badge sits over the bottom-left of the viewport, which is
     exactly where the fan lives. It obscures the thing we screenshot most. */
  devIndicators: false,

  async headers() {
    return [
      {
        /*
         * Card art and reader portraits are generated assets with stable,
         * slug-based filenames, so a long cache is safe and worth having: the
         * fan pulls 22 files on the first draw.
         *
         * `immutable` is doing real work here and carries a real cost. The
         * filenames are NOT content-hashed, so if the art is ever regenerated
         * -- and it should be; the three source generations are visually
         * inconsistent, which is the open art issue -- anyone who has loaded
         * the app will keep the old art for up to a year. Regenerating means
         * either changing the filenames or shortening this first.
         */
        source: '/cards/:path*',
        headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/dukuns/:path*',
        headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
