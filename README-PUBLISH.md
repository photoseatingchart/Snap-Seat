# Snap & Seat phone controller

Upload these files directly into the root of `photoseatingchart/Snap-Seat`:

- `index.html`
- `controller.js`
- `style.css`
- `config.js`
- `config.example.js`

Before uploading, edit `config.js` with the Supabase Project URL and public anon/publishable key. Do not add the Supabase service-role/secret key or the PC Host PIN.

In GitHub, commit the files to `main`, then open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, and save. The expected URL is `https://photoseatingchart.github.io/Snap-Seat/`.

This page requires the Supabase project and `snap-seat` Edge Function. Without those, it will show a setup/connection error. It is not a local PC server tunnel; it reaches the host through Supabase HTTPS APIs and private object storage.
