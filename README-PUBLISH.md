# Update the Snap & Seat GitHub Pages controller

Your repository already has the guest page files at its root. Replace only its existing `controller.js` with this folder's updated `controller.js`; leave `index.html`, `style.css`, and `config.js` in place. The updated script reads the event-scoped public Supabase URL/key from the QR link fragment, so the blank `config.js` template does not need secrets or project settings.

The ChatGPT GitHub connection is read-only, so make this one-file edit in your repository:

1. Open https://github.com/photoseatingchart/Snap-Seat/blob/main/controller.js.
2. Choose the pencil/Edit control, select all, and replace the file with `phone-controller/controller.js` from the Snap & Seat project folder.
3. Commit the change to `main`.
4. Open **Settings → Pages**. Choose **Deploy from a branch**, `main`, and `/ (root)`, then save. The expected page is https://photoseatingchart.github.io/Snap-Seat/ .
5. Wait for Pages to finish deploying and open the URL. If GitHub shows 404, the Pages source/deployment is not active yet.

The QR's URL fragment carries the guest token and public publishable/anon key. Browsers do not send fragments as part of the GitHub Pages HTTP request. Never add the Host PIN or Supabase service-role/secret key to this repository.
