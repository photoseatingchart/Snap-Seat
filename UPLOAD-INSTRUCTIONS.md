# Update the Snap & Seat guest page on GitHub Pages

The repository already has an older Snap & Seat controller at its root. Replace only these three files with the matching files from this folder:

- `index.html`
- `controller.js`
- `style.css`

Keep the repository's existing `config.js` and all other files. The QR link carries the public Supabase URL and publishable key in its URL fragment. Never add the Host PIN or a Supabase service-role/secret key to GitHub.

## Upload

1. Open `https://github.com/photoseatingchart/Snap-Seat` and confirm the Pages source branch/folder under **Settings → Pages**. The inspected repository has the controller files at its root and the expected Pages URL is `https://photoseatingchart.github.io/Snap-Seat/`.
2. In the folder used by Pages, upload/replace only the three files listed above. If Pages serves the repository root, upload them to the root. Leave `config.js` untouched.
3. Commit the three file changes to `main` and wait for GitHub Pages deployment.
4. Open `https://photoseatingchart.github.io/Snap-Seat/` and confirm the page shows the updated note prompt and photo form.
5. Restart the host event session in Snap & Seat so its QR points to the live guest page.

The updated controller reports a seat check-in after a guest selects their record. This is required for their name/photo to appear in the live seating view. Photos upload directly to the private Supabase Storage bucket; status and message metadata go through the event-scoped Edge Function.

The connected GitHub account currently has read-only repository permission, so the files must be committed by the repository owner or a collaborator with write access.
