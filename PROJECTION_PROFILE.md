# Viewport-focus projection — 2026-10-21

The city-based overview has been removed. Viewport focus is available under Settings → Map projection; it is the default for new preferences. Existing saved choices of the adaptive or original modes remain available. A saved city-based choice migrates to Viewport focus.

## Feasibility and geometry

A latitude-only vertical warp cannot produce natural polar views: geographic longitudes must converge there. The implemented mode instead rotates the spherical geometry beneath a custom cylindrical lens. Its raw mapping is x = longitude and y = tanh(2.12 × latitude) / 2.12, in radians. Horizontal and vertical scale match at the central great circle; vertical scale decreases symmetrically on either side. The geographic center moves during north/south panning, so the maximum scale follows the view rather than the selected cities or timezones. The horizontal center line is a rotated great circle, not a fixed geographic parallel; geographic meridians and parallels therefore curve away from the focus.

D3 handles spherical rotation, seam clipping and viewport clipping. The existing rounded map paths are decoded back to approximate geographic rings; degenerate rings are removed and outer/hole winding is corrected. No new geographic dataset is downloaded. See [D3 spherical geometry documentation](https://d3js.org/d3-geo) and [projection transforms](https://d3js.org/d3-geo/projection).

Reset opens a 100% equator-centered overview. North/south panning can center either pole at any zoom, with latitude limited to ±90°. Horizontal motion near a pole rotates its view. Zoom buttons preserve the current center; pointer zoom uses an inverse projection and an analytic camera-anchor solution. Geometry updates are coalesced with requestAnimationFrame. The original and previous zoom-adaptive maps remain alternatives.

## Browser measurements

ChatGPT in-app browser on one computer, at two viewport sizes. Each mode had 90 animation frames; the first six were omitted. Original/adaptive modes traverse 100% → 400% → 100%; focus mode simultaneously traverses that zoom cycle and moves its latitude through ±85°. The map is kept onscreen. Focus mode does more work because every pan reprojects geometry, unlike the earlier zoom-only approach. The browser ran at approximately 30 Hz; this does not establish 60 Hz performance elsewhere. The narrow viewport is a layout test on the same computer, not a physical-phone benchmark.

| Viewport | Mode | Update median ms | Update p95 ms | Frame median ms | Frame p95 ms | Frames >50 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1320×1000 | equal-area | 2.2 | 4.2 | 33.3 | 33.4 | 0 |
| 1320×1000 | adaptive | 8.1 | 11.2 | 33.3 | 33.4 | 0 |
| 1320×1000 | focus | 23.7 | 29.4 | 33.3 | 33.4 | 0 |
| 390×844 | equal-area | 1.3 | 3.1 | 33.3 | 33.4 | 0 |
| 390×844 | adaptive | 5.9 | 9.3 | 33.3 | 33.4 | 0 |
| 390×844 | focus | 23.1 | 29.0 | 33.3 | 33.4 | 1 |

Focus preparation measured 49.6 ms in the desktop run and 45.9 ms in the narrow run. It runs once, when the mode is first used. Measured updates include JavaScript, SVG writes and synchronous browser work. Frame intervals include scheduling and rendering effects; GPU work and browser memory were not measured separately. The normal app does no background animation when idle.

The runtime distribution adds 75,001 uncompressed bytes relative to the prior revision, including bundled d3-array 3.2.4 and d3-geo 3.1.1 and their ISC notices. There is no CDN dependency at runtime. Geographic source data and timezone-conversion rules are unchanged.

## Verification

- Existing timezone conversion, DST, concise-formatting and grid regression tests pass.
- Focus tests verify inversion, maximum center scale, matching local horizontal/vertical proportions, Oslo and Ushuaia centers, exact ±90° polar centers, zoom-anchor arithmetic, polygon winding, region containment, and valid paths through seam/pole views.
- Browser checks cover Oslo and Ushuaia, free drag panning in both axes, keyboard movement to both poles at minimum zoom and at 140%, Reset, mode switching, the removed city option, marker alignment, and a 390px layout.
- Only ME, THEM and current hover receive region highlighting. Pan/zoom clears hover.
- Physical two-finger gestures were not exercised. They share the inverse-camera anchor and frame-coalesced rendering path.

## Reproduce

Serve `dist`, open `/?profile=1`, and click **Run zoom comparison**. Raw results are in `profiles/desktop.json` and `profiles/narrow.json`.

Run `node tests.cjs`, `node projection-tests.cjs`, and `node focus-tests.cjs`. Projection is accurate locally at the center line; shapes and areas away from it are intentionally distorted. Rounded and simplified source geometry limits detail near the poles, and polar timezone assignments are only those included in the original boundary data.
