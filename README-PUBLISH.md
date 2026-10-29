# Configure and publish the Snap & Seat guest controller

The Snap-Seat repository already contains the guest page files. Only its root `config.js` needs the Supabase public settings. This project's `config.js` is prefilled with your Project URL and public publishable key; copy those two values into the existing GitHub `config.js` and commit to `main`.

Do not copy a Host PIN or Supabase service-role/secret key into GitHub. The publishable key is intended for browser use. The QR link also carries the public settings in its fragment, but setting `config.js` lets the controller work consistently with existing QR links.

The available GitHub connection is read-only, so make the one-file edit in the repository:

1. Open https://github.com/photoseatingchart/Snap-Seat/blob/main/config.js.
2. Choose Edit (pencil). Replace the blank URL and key with the contents shown in this project's `phone-controller/config.js`.
3. Commit the change to `main`.
4. Open **Settings → Pages**. Choose **Deploy from a branch**, `main`, and `/ (root)`, then save.
5. Wait for deployment and open https://photoseatingchart.github.io/Snap-Seat/ . During inspection the URL returned 404; this setting should publish the page.

The host app and guest page connect through the Supabase `snap-seat` Edge Function and private Storage. They do not connect to the PC's localhost.
