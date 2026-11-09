These assets are reused from SnapTrade's existing OAuth UI:

- `PPNeueMontreal-Regular.otf`: customer dashboard's locally hosted typeface.
- `snaptrade.png`: customer dashboard's `app/assets/icon-inverted.png`.
- `cli.svg`: CLI's `docs/branding/snaptrade-cli-icon.svg`.

The callback page embeds them as data URLs, because the temporary server closes
after its response. Keep this directory in the published `dist/assets` bundle.
