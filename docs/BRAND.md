# Brand assets

## Palette

The app's colours are defined as OKLCH custom properties in `src/routes/layout.css`.
Icons use hex equivalents, because SVG rasterisers do not all support `oklch()`.

| Role | Hex | Token |
|------|-----|-------|
| Field / theme colour | `#e8604c` | `theme-color` in `src/app.html`, `theme_color` in the manifest |
| Berries | `#faf6f2` | cream |
| Leaf and stem | `#ffd0c8` | `--color-coral-100` |

## The mark

`static/favicon.svg` is the single source for every icon: a berry cluster with a
leaf, on a full-bleed coral field.

Full-bleed matters. `static/manifest.webmanifest` declares both icons as
`"purpose": "any maskable"`, so a platform may crop the icon to a circle or a
squircle. A background with rounded corners or transparency would show notches
after that crop, and an `apple-touch-icon` gets its corners rounded by iOS
regardless.

The mark is drawn in a 100x100 space and scaled to 80% of the canvas, which
keeps every pixel inside the maskable safe circle (radius 40% of the canvas).
Verify after any edit — nothing should be clipped:

```bash
rsvg-convert -w 512 -h 512 static/favicon.svg -o /tmp/icon.png
magick /tmp/icon.png \( -size 512x512 xc:none -fill white \
    -draw "circle 256,256 256,51.2" \) \
  -alpha set -compose DstIn -composite /tmp/clipped.png
# these two counts must match
for f in /tmp/icon.png /tmp/clipped.png; do
  magick "$f" -alpha extract -threshold 50% -format "%[fx:mean*w*h]\n" info:
done
```

## Regenerating the PNGs

The PNGs are generated once and committed, not built per-deploy, so no image
tooling ships in the container. Re-render them only when the SVG changes:

```bash
rsvg-convert -w 192 -h 192 static/favicon.svg -o static/icons/icon-192.png
rsvg-convert -w 512 -h 512 static/favicon.svg -o static/icons/icon-512.png
```

`rsvg-convert` comes from `librsvg` (`brew install librsvg`). Any rasteriser
works; `librsvg` is named here only so repeat renders are byte-stable.

Check the result at the sizes that actually get used — a tab favicon is 16px,
where fine detail turns to mush:

```bash
for s in 512 192 32 16; do rsvg-convert -w $s -h $s static/favicon.svg -o /tmp/f-$s.png; done
```

## Not yet done

`static/og.png` is the social-share card and is still thin. It is not referenced
by the manifest and does not gate a release.
