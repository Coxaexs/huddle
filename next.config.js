/**
 * Huddle is served from https://deeppixel.online/hangout, so every route,
 * asset and API call lives under the /hangout prefix.
 *
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  basePath: "/hangout",
  experimental: {
    serverActions: {
      /**
       * Uploads POST multipart/form-data to /api/uploads. The framework treats
       * any multipart POST without an action header as a progressive server
       * action and enforces this limit *before* the route runs, so the 1 MB
       * default rejected almost every PDF with a bare 413.
       *
       * Keep this at or above the largest size app/api/uploads/route.ts allows
       * (currently 40 MB for voice clips), and at or below nginx's
       * client_max_body_size for /hangout/.
       */
      bodySizeLimit: "45mb",
    },
  },
};

export default nextConfig;
