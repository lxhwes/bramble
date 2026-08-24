# Dataset license

Bramble's application code is MIT — see [LICENSE](LICENSE). The bundled name
dataset is not, and the two travel together.

## static/names.json

Licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

It is a derived work combining:

- **[US Social Security Administration](https://www.ssa.gov/oact/babynames/)
  national baby name data** — a work of the US federal government, public
  domain. Supplies name, sex, peak year, and total count.
- **[Behind the Name](https://www.behindthename.com/) bulk export** — CC BY-SA
  4.0, as declared in the export's own file header. Supplies the related-name
  lists.

The Behind the Name portion is what makes the combined file CC BY-SA. Share-alike
is viral, so anything you redistribute that incorporates this dataset carries the
same license.

## What that means if you redistribute

If you fork Bramble, self-host it, or publish a container image built from it,
you are redistributing the dataset. You must:

1. Credit both sources. Bramble already does this on its About page and in
   `static/names.LICENSE.txt`, which is served alongside the data at
   `/names.LICENSE.txt`. Leaving those intact satisfies the requirement.
2. Keep the dataset (and any modified version of it) under CC BY-SA 4.0.
3. Indicate any changes you made to it.

None of this constrains the app code, which stays MIT. You may relicense your
own changes to the code freely; you may not relicense the name data.

See [docs/DATA.md](docs/DATA.md) for how the dataset is built.
