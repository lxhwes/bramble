# Bramble logo ideas

Twenty directions for a Bramble logo, each with a MidJourney prompt. All prompts are tuned to render the mark *isolated* (no baked-in cream square) so the result drops onto any Bramble background token after vector conversion.

## Brand palette (for reference)

Source of truth: `src/routes/layout.css` (defined in OKLCH). Hex values below are approximations to feed MidJourney, which doesn't understand OKLCH.

| Token | Role | Approx hex | MJ-friendly description |
|---|---|---|---|
| Berry / Primary | brand red | `#B44C3F` | warm terracotta coral |
| Berry Mid | accent | `#D86958` | soft salmon coral |
| Berry Light | tint | `#F2A092` | peachy blush pink |
| Berry Tint | wash | `#FBEDE9` | pale blush cream |
| Foliage | green | `#4A8D6F` | muted sage green |
| Foliage Mid | accent green | `#7AAE93` | light sage |
| Secondary | deep green | `#1F5E3F` | deep forest sage |
| BG | background | `#FAF6F2` | warm off-white cream |
| BG Subtle | background | `#F5EFEA` | pale linen cream |
| Ink | text | `#1F1612` | warm near-black |
| Ink Mid | muted text | `#5C4F46` | dark taupe brown |

**House style:** terracotta coral as the dominant berry color, sage greens for any leaves/vines, warm near-black for outlines if needed. Avoid plum, magenta, mustard, or cool blues — they fight the palette.

## Transparency-friendly workflow

The previous round of prompts baked a cream square into every generation, which clashes with the site's actual page background (closer to `#FBEDE9` than `#FAF6F2`). The fix is to render the mark in isolation, then strip or vectorize.

**Every prompt below ends with `--no background, frame, border, square, rectangle, container, text, letters, words, typography`.** This pushes MJ to drop the mark onto a clean field with no enclosing shape.

After generation, pick one of:

1. **SVG route (preferred for a logo):** Run the winning raster through [Vectorizer.ai](https://vectorizer.ai) or [Recraft](https://www.recraft.ai/). Hand-replace fills with the OKLCH tokens from `src/routes/layout.css` so the colors match the rest of the app exactly. Scales to any size, no halo.
2. **Transparent PNG route (faster, lower quality):** Either use MidJourney's built-in transparent download (right-click an upscale → "Download transparent PNG", availability varies by plan), or run the result through [remove.bg](https://www.remove.bg) for soft-edge cutout.

MidJourney's hex interpretation drifts even when prompted explicitly — assume you'll color-correct in the vector editor regardless.

---

## 1. Two berries on a stem (literal pair)

> minimalist logo of two ripe round berries hanging from a single curved stem with one small leaf, vector flat design, terracotta coral berries (#B44C3F), muted sage green leaf (#4A8D6F), isolated on pure white background, mark only, modern app icon, generous negative space --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 2. Bramble vine forming a heart

> logo of a thin bramble vine with tiny sage leaves and two small coral berries, gracefully curling into a heart shape, single continuous line illustration, terracotta coral (#B44C3F) and sage green (#4A8D6F), isolated on pure white background, mark only, hand-drawn elegance --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 3. Berry cluster as heart

> logo mark of a cluster of small round berries arranged in the silhouette of a heart, two sage stem leaves at top, flat vector illustration, salmon coral berries (#D86958) with one deeper terracotta accent (#B44C3F), muted sage leaves (#4A8D6F), isolated on pure white background, mark only, friendly modern feel --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 4. Single berry, bold app icon

> bold modern logo mark of one stylized berry composed of seven plump segments, single sage leaf on top, gentle drop shadow, terracotta coral with subtle peach blush gradient (#B44C3F to #F2A092), isolated on pure white background, mark only, clean and contemporary, not skeuomorphic --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 5. Mirrored leaves (abstract pairing)

> abstract logo of two leaves curving toward each other to form a soft almond shape with a small berry where they meet, geometric vector, deep forest sage leaves (#1F5E3F) and terracotta coral berry (#B44C3F), isolated on pure white background, mark only, symmetrical, calm and modern --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 6. Letter B woven from bramble vine

> monogram logo of the letter B formed by a thin twisting bramble vine with two small berries nestled in the curves, single tiny leaf, elegant modern serif structure, terracotta coral berries (#B44C3F) and muted sage vine (#4A8D6F), isolated on pure white background, mark only, editorial feel --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 7. Folk-art hand-drawn

> hand-drawn folk art style logo of a bramble sprig with three berries and two leaves, charming naive linework in warm near-black (#1F1612), filled with terracotta coral (#B44C3F), salmon (#D86958), and muted sage (#4A8D6F), isolated on pure white background, mark only, slight screenprint texture, indie children's book feel --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 8. Geometric low-poly berry

> low-poly geometric logo of a single berry made of triangular facets, one stylized angular sage leaf, modern aesthetic, gradient from peachy blush (#F2A092) to deep terracotta (#B44C3F), isolated on pure white background, mark only, crisp clean edges --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 9. Berry split, heart inside

> creative logo of a round berry sliced in half revealing a heart-shaped center instead of seeds, flat vector illustration, terracotta coral exterior (#B44C3F), peachy blush interior heart (#F2A092), isolated on pure white background, mark only, clever minimal app icon, soft rounded shapes --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 10. Sprout with paired leaves and berry

> minimal logo of a tiny sprout with two perfectly paired leaves and a single round berry budding between them, suggests new life and pairing, flat vector, muted sage leaves (#4A8D6F) and terracotta coral berry (#B44C3F), isolated on pure white background, mark only, friendly and gentle --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 11. Watercolor bramble cluster

> watercolor illustration logo of a small bramble cluster, three plump berries and two leaves, soft bleeding pigments in terracotta coral (#B44C3F), salmon (#D86958), and muted sage (#4A8D6F), painterly edges, isolated on pure white background, mark only, organic and warm, boutique feel --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography

## 12. Two hands cradling a berry

> minimal line-art logo of two simplified hands gently cradling a single round berry between them, single continuous line in dark taupe (#5C4F46), berry in terracotta coral (#B44C3F), isolated on pure white background, mark only, suggests sharing and care, modern editorial mark --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

---

## Less literal directions

Conceptual marks that lean on what the app *does* (pairing, naming, matching, new life) rather than the bramble plant itself. All still tuned to the existing palette.

### 13. Ampersand mark

The "&" is the universal pairing glyph and is widely associated with naming (Smith & Jones, mother & child). A custom ampersand reads as a logo immediately.

> custom ampersand glyph as a logo mark, single elegant continuous stroke with a small round berry tucked into one of its loops, modern friendly serif construction, terracotta coral stroke (#B44C3F) with a deep forest sage berry (#1F5E3F), isolated on pure white background, mark only, confident editorial mark, clean vector --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 14. Paired quotation marks framing a heart

Quotation marks naturally come in pairs and evoke the act of naming ("calling someone by their name"). A heart between them puts pairing at the center.

> minimalist logo of two oversized rounded quotation marks facing each other with a small soft heart shape floating between them, geometric vector, terracotta coral marks (#B44C3F) and salmon heart (#D86958), isolated on pure white background, mark only, clever and modern app icon --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 15. Overlapping circles (the match)

A two-circle Venn is the most literal possible mark for "we both said yes." Reads as an app icon at any size.

> minimalist geometric logo of two overlapping circles forming a soft vesica piscis lens shape in the center, the overlap subtly emphasized, muted sage green circle (#4A8D6F) and terracotta coral circle (#B44C3F) with the intersection rendering as a deeper warm tone, isolated on pure white background, mark only, clean modern app icon, generous negative space --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 16. Two cards fanned (swipe gesture)

Direct nod to the core interaction. Cards fanning from a center point feel both playful and recognizable.

> logo of two rounded rectangle cards slightly fanned and overlapping, suggesting a swipe deck, soft drop shadow, front card in terracotta coral (#B44C3F), back card in muted sage (#4A8D6F), isolated on pure white background, mark only, flat vector, friendly modern app icon --ar 1:1 --v 6 --style raw --no background, frame, border, container, text, letters, words, typography

### 17. Continuous knot / infinity loop

Two strands woven into a single closed line — partnership, never-ending, calm.

> minimalist logo of two ribbon strands woven together into a continuous closed knot resembling an infinity symbol, single line illustration, one strand terracotta coral (#B44C3F) and one strand muted sage green (#4A8D6F), isolated on pure white background, mark only, elegant balanced composition, app icon ready --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 18. Tender sprout (new life)

Less berry, more "naming a baby." A single seedling with paired cotyledon leaves nods at both new life and pairing without going hard on the bramble.

> minimal logo of a single tender sprout breaking through soft ground, two perfectly mirrored cotyledon leaves on a thin stem, deep forest sage leaves (#1F5E3F) with a single soft coral dot at the seed point (#D86958), isolated on pure white background, mark only, gentle flat vector, hopeful and quiet --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 19. Two speech bubbles overlapping into a heart

The conversation between partners *is* the product. Two speech bubbles whose overlap forms a heart silhouette captures it cleanly.

> clever minimal logo of two soft rounded speech bubbles overlapping such that their intersection forms a heart shape, flat vector, one bubble in terracotta coral (#B44C3F) and one in muted sage (#4A8D6F), heart-shaped intersection rendered as a clean cutout, isolated on pure white background, mark only, modern app icon, friendly and warm --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 20. Convergence — two arcs meeting at a dot

Two paths from opposite sides curving inward to meet at a single point. Reads as "we both arrived here" — i.e. a match.

> minimalist abstract logo of two thin curved arcs sweeping inward from opposite sides and meeting at a single small dot in the center, geometric vector, one arc terracotta coral (#B44C3F) and one arc muted sage (#4A8D6F), the meeting dot in deep forest sage (#1F5E3F), isolated on pure white background, mark only, elegant minimal app icon, generous negative space --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

---

## Round 2: Crafted aesthetics

Round 1 leaned heavily on flat-vector and conceptual marks. The favorites that shook out (#1, #2, #7, #11) and the structural pick that was flagged as aesthetically off (#8) all point in one direction: warm, hand-crafted, plant-forward. Round 2 doubles down — block print, watercolor, gouache, sumi-e, paper collage. The single-berry framing from #8 is preserved but rendered with the warmth of #11. Three linocut variants share the lineup because the medium fits Bramble's tone (intimate, human, indie); varying the subject density tells us which reads best at icon size vs brand-mark size.

Every prompt below uses the same transparency workflow as Round 1: render isolated on white, then vectorize or background-cut.

### 21. Linocut, single berry

A bold single-berry mark in the right medium. This is the answer to #8's "I like the concept" — same iconic single-fruit silhouette, but warm and hand-printed instead of geometric.

> linocut block print of a single ripe round berry with one small leaf and a short stem, bold confident carved lines, visible ink bleed and slight printing imperfections, two color print in terracotta coral berry (#B44C3F) and muted sage leaf (#4A8D6F), isolated on pure white background, mark only, mid-century woodcut illustration aesthetic, hand-pulled print quality --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, smooth gradient, digital vector, glossy

### 22. Linocut, two berries on a stem

Favorite #1's composition in a hand-printed medium. Likely the strongest single prompt in this round.

> linocut block print of two ripe round berries hanging from a single curved stem with one small leaf, bold carved lines, visible chisel marks and ink texture, two color print in terracotta coral berries (#B44C3F) and muted sage stem and leaf (#4A8D6F), isolated on pure white background, mark only, Eric Ravilious style mid-century block print, balanced composition, hand-pulled feel --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, smooth gradient, digital vector, glossy

### 23. Linocut, bramble sprig with cluster

Fuller composition for a brand-mark / hero-image use rather than a tiny favicon.

> linocut block print of a small bramble sprig with three plump berries clustered together and two textured leaves, confident chisel-cut linework, visible white-line carving details and ink imperfections, two color print in terracotta coral berries (#B44C3F) and deep forest sage leaves (#1F5E3F), isolated on pure white background, mark only, traditional letterpress block print quality --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, smooth gradient, digital vector, glossy

### 24. Antique botanical plate

Editorial, refined, slightly bookish — pairs well with the "free Nameberry alternative" positioning. Risk: too detailed to read at favicon size, so plan to use it as a wider brand image rather than the app icon.

> antique botanical illustration plate of a bramble sprig with two ripe berries and three leaves, fine engraved linework with delicate watercolor wash overlay, scientific naturalist accuracy, warm terracotta coral berries (#B44C3F) and muted sage leaves (#4A8D6F) with subtle deeper sage shading (#1F5E3F), isolated on pure white background, mark only, Curtis's Botanical Magazine reference, refined and editorial --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, modern, glossy, digital

### 25. Risograph two-color print

The Bramble palette is already a riso-native palette — coral and sage are exactly what indie risograph zines use. Slight registration offset and grain give the mark a contemporary indie feel without being trend-chasing.

> risograph print logo of two round berries on a curved stem with one small leaf, two color riso print with deliberate slight registration offset, grainy halftone texture, terracotta coral (#B44C3F) and muted sage (#4A8D6F) inks with overlap creating a darker spot where the colors meet, isolated on pure white background, mark only, contemporary indie zine print aesthetic --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, smooth, digital vector, clean, sharp

### 26. Mid-century picture-book gouache

Mary Blair / Beatrix Potter territory. Warm, painted, charmingly imperfect. Strong emotional fit for naming a baby.

> mid-century children's book illustration of two ripe berries hanging from a single stem with one small leaf, warm gouache paint texture with grainy paper showing through, simple charming shapes, terracotta coral berries (#B44C3F) with peachy blush highlights (#F2A092) and muted sage leaf (#4A8D6F), isolated on pure white background, mark only, Mary Blair and Beatrix Potter aesthetic, 1950s storybook warmth --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, modern, sharp, digital

### 27. Sumi-e ink wash

Three confident brush strokes, mostly black with one colored accent. Very different feel from the rest — quiet, meditative, anti-tech. Strong silhouette potential at small sizes.

> sumi-e Japanese ink wash illustration of a single bramble sprig with two berries and one leaf, three confident brush strokes, wet ink with natural bleeding and dry-brush texture, primarily warm near-black brushwork (#1F1612) with a single coral-stained berry accent (#B44C3F), isolated on pure white background, mark only, meditative minimal calligraphic mark, generous negative space --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography, vector, digital, smooth

### 28. Embroidery sampler

Speculative — could come out twee. But cross-stitch samplers are historically the medium for commemorating births and names, so it earns a render. Note: this is the one prompt that won't vectorize cleanly; treat the result as a raster PNG mark.

> embroidered logo of a small bramble sprig with two berries and two leaves, visible thread texture with French knots forming the berries and satin stitch leaves, fine outline stitching in warm near-black thread (#1F1612), terracotta coral berry knots (#B44C3F) and muted sage leaves (#4A8D6F), isolated on pure white background, mark only, traditional sampler embroidery, tactile and handmade --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, vector, digital, smooth, flat

### 29. Eric Carle hand-cut paper collage

The Very Hungry Caterpillar is the canonical baby-book visual language. Direct emotional shortcut to "this is for naming our child."

> hand-cut tissue paper collage logo of two ripe round berries on a single curved stem with one leaf, layered painted paper textures with visible brush marks underneath the cut shapes, terracotta coral berries (#B44C3F) with peachy blush highlights (#F2A092) and muted sage leaf (#4A8D6F) with deeper forest sage details (#1F5E3F), isolated on pure white background, mark only, Eric Carle children's book aesthetic, warm and tactile --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, smooth, vector, digital, glossy

### 30. Negative-space heart between two berries

Takes #1's composition and arranges the two berries close enough that the silhouette between them reads as a soft heart. The pairing metaphor pays off subliminally without spelling it out.

> minimalist illustration of two round berries hanging close together from a single curved stem with one small leaf above, the negative space between the berries subtly forming a heart silhouette, gentle paper grain, terracotta coral berries (#B44C3F) and muted sage stem and leaf (#4A8D6F), isolated on pure white background, mark only, clever quiet composition, generous negative space --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography

### 31. Pure silhouette, single color

Diagnostic prompt: if the two-berry-on-stem composition doesn't read as a stark silhouette, none of the more decorative versions will read at favicon size either. Useful to render even if it's not the final aesthetic.

> bold simple silhouette logo of two round berries on a curved stem with a single leaf, stark high-contrast solid shapes, single warm terracotta coral color (#B44C3F), isolated on pure white background, mark only, designed to read clearly at app icon size, confident graphic mark --ar 1:1 --v 6 --style raw --no background, frame, border, square, rectangle, container, text, letters, words, typography, gradient, shading, detail, texture

### 32. Watercolor single berry

The literal answer to "I like #8's concept, not its aesthetic." A single iconic berry rendered in #11's medium.

> watercolor illustration logo of a single ripe round berry with one small leaf and a short stem, soft bleeding pigments and natural water bloom textures, painterly imperfect edges, terracotta coral berry (#B44C3F) with peachy blush highlights (#F2A092) and muted sage leaf (#4A8D6F), isolated on pure white background, mark only, organic and warm boutique feel, single subject focal --ar 1:1 --v 6 --no background, frame, border, square, rectangle, container, text, letters, words, typography, vector, digital, smooth, glossy

---

## Round 3: Transparency-friendly crafted variants

Round 2 surfaced #29 (Eric Carle paper collage) as a favorite, but rendering it keeps producing the same problem: MJ bakes a paper-grain background into the field and a soft drop shadow under every cut shape. Both fight any attempt to extract a clean transparent mark. The textured cream field reads as part of the artwork to vectorizers and remove.bg alike.

Round 3 attacks this two ways. First, prompts that **keep** the cut-paper warmth but explicitly forbid the bits that make extraction hard (drop shadows, cast shadows beneath shapes, paper grain in the field). Second, **adjacent crafted styles** that share the same emotional register — warm, hand-made, indie children's book — but are naturally shadowless and easier to cut.

Every prompt below adds `no drop shadow, no cast shadow, no paper texture background, no grain in field` to the negative side. Where it matters, the paper grain is kept *inside* the cut shapes, never in the field around them.

### 33. Eric Carle cutouts, chroma-key field

The cleanest technical fix. Render the same paper-collage mark on a saturated magenta field instead of cream, so background removal becomes trivial — every pixel of "background" is one color you can mask in seconds. The mark itself keeps its full painted-paper texture; only the *field* changes.

> hand-cut tissue paper collage logo of two ripe round berries on a single curved stem with one leaf, layered painted paper textures with visible brush marks underneath the cut shapes, terracotta coral berries (#B44C3F) with peachy blush highlights (#F2A092) and muted sage leaf (#4A8D6F) with deeper forest sage details (#1F5E3F), flat overhead lighting with no shadow beneath the paper, isolated on a solid saturated magenta field (#FF00FF) for clean chroma keying, mark only, Eric Carle children's book aesthetic, warm tactile paper still visible inside the shapes --ar 1:1 --v 6 --no drop shadow, cast shadow, paper texture background, grain in field, frame, border, square, rectangle, container, text, letters, words, typography, vector, smooth, glossy

### 34. Matisse paper cutout

Henri Matisse's late cutouts (*Jazz*, the *Blue Nudes*) are the ur-paper-cutout aesthetic: flat saturated color, scissor-crisp edges, zero shading, zero shadows. Same hand-cut warmth as Carle, but built without the very texture cues that trap the mark in its field.

> Henri Matisse style paper cutout logo of two round berries on a curved stem with one leaf, scissor-cut crisp edges, flat saturated colors with no shading or gradient, terracotta coral berries (#B44C3F) and muted sage leaf (#4A8D6F) with warm near-black stem (#1F1612), bold simple shapes, isolated on pure white field, mark only, gouache cutout aesthetic, confident silhouette --ar 1:1 --v 6 --style raw --no drop shadow, cast shadow, paper texture background, grain in field, frame, border, container, text, letters, words, typography, photographic, realistic

### 35. Flat-lit paper collage, no shadow

Direct rewrite of #29 with the lighting and field problems explicitly negated. Tells MJ "yes, paper texture inside the shapes; no, none of the things that make extraction hard." If you love #29 specifically, try this before reaching for an adjacent style.

> hand-cut painted paper collage logo of two round berries on a single curved stem with one leaf, visible warm brush marks and pigment variation inside each cut shape, crisp paper edges with no shadow underneath any piece, terracotta coral berries (#B44C3F) with peachy blush highlights (#F2A092) and muted sage leaf (#4A8D6F) with deep forest sage shading (#1F5E3F), flat even studio lighting from directly above, isolated on a pure flat white field with no paper grain or texture in the background, mark only, Eric Carle warmth without the shadow problem --ar 1:1 --v 6 --no drop shadow, cast shadow, paper texture background, grain in field, frame, border, container, text, letters, words, typography, vector, smooth, glossy

### 36. Die-cut sticker

Frame the mark as a sticker. Stickers come with a pre-baked cuttable boundary — usually a thin white outline. That outline gives both MJ a reason to render a clean silhouette and you a clear edge to vectorize against.

> die-cut vinyl sticker logo of two round berries on a curved stem with one small leaf, the entire mark sits inside a clean thin white outline as if cut from sticker paper, painted paper texture and warm pigment variation inside the shapes, terracotta coral berries (#B44C3F) and muted sage leaf (#4A8D6F), flat lit with no shadow beneath the sticker, isolated on pure white background, mark only, indie sticker pack aesthetic, clear cut boundary --ar 1:1 --v 6 --no drop shadow, cast shadow, paper texture background, grain in field, frame, square, rectangle, container, text, letters, words, typography, glossy, photo

### 37. Linocut outline plus torn-paper fill

Combines round 2's strongest medium (linocut, #21–23) with the paper warmth of #29. Bold carved black linework defines the silhouette cleanly; each enclosed shape is filled with cut-paper texture. The linework gives a guaranteed clean outline for vectorization; the paper fill keeps the warmth.

> mixed media logo of two round berries on a curved stem with one leaf, bold confident black linocut outline defining every shape, each enclosed area filled with hand-painted torn-paper texture in flat warm color, terracotta coral berry interiors (#B44C3F) with peachy highlights (#F2A092) and muted sage leaf (#4A8D6F), warm near-black ink linework (#1F1612) clearly separating each shape, flat lit, isolated on pure white field, mark only, picture book illustration warmth inside a clean printable silhouette --ar 1:1 --v 6 --no drop shadow, cast shadow, paper texture background, grain in field, frame, border, container, text, letters, words, typography, smooth gradient, glossy

### 38. Single-color paper-cutout silhouette

Diagnostic + viable favicon candidate. Strips the cut-paper aesthetic to its silhouette: one color, flat field, paper texture only inside the shape. If this reads at icon size, the more decorative round-2 versions will too. Direct evolution of #31 in a hand-made medium.

> bold single-color paper cutout logo of two round berries on a curved stem with one leaf, the entire mark in one warm terracotta coral (#B44C3F) with subtle painted paper grain visible inside the silhouette, scissor-crisp edges, flat lit, isolated on pure white field, mark only, designed to read clearly at app icon size, hand-cut warmth in a single confident shape --ar 1:1 --v 6 --style raw --no drop shadow, cast shadow, paper texture background, grain in field, frame, border, container, text, letters, words, typography, gradient, glossy, multi-color

---

## Tips for iterating in MidJourney

- MidJourney interprets hex codes loosely — expect drift. Run 4 variations and color-correct the winner in a vector editor against the real palette.
- Generate, then `Vary (Subtle)` on a favorite to refine without losing the idea.
- Add `--s 50` for cleaner / more literal output, `--s 500` for stylized variants.
- If MJ keeps painting in a background despite the negative prompt, append `flat solid white only, vector clip art style` to the positive side.
- Once you pick a direction, run it through Recraft or Vectorizer.ai to convert raster to SVG, then re-fill with the exact OKLCH values from `src/routes/layout.css`. Drop the SVG into `static/` and the mark will sit cleanly on `--bg`, `--bg-subtle`, and `--berry-tint` without re-export.
