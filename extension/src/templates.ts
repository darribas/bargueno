/**
 * Bundled Typst templates.
 *
 * A template is a Typst function applied with `#show: template.with(..)`.
 * It receives the document frontmatter as named arguments:
 *
 *   title:       str or none
 *   subtitle:    str or none
 *   authors:     array of (name: str, affiliations: array of str,
 *                          email: str or none)
 *   date:        str or none
 *   abstract:    str or none
 *   keywords:    array of str
 *   lang/region: text language, defaulting to British English
 *
 * and the document body as its last positional argument. User templates in
 * `_templates/` (milestone 6) follow the same contract.
 */

export const ARTICLE = String.raw`
#let article(
  title: none,
  subtitle: none,
  authors: (),
  date: none,
  abstract: none,
  keywords: (),
  lang: "en",
  region: "gb",
  body,
) = {
  set document(title: if title != none { title } else { "" }, author: authors.map(a => a.name))
  set page(paper: "a4", margin: (x: 2.8cm, top: 3cm, bottom: 3cm), numbering: "1")
  set text(font: "Libertinus Serif", size: 11pt, lang: lang, region: region)
  set par(justify: true, leading: 0.62em, first-line-indent: 1.2em, spacing: 0.62em)
  set heading(numbering: "1.1")
  show heading: set block(above: 1.6em, below: 0.9em)
  show heading.where(level: 1): set text(size: 13pt)
  show heading.where(level: 2): set text(size: 11.5pt)
  set math.equation(numbering: "(1)")
  show raw: set text(font: "DejaVu Sans Mono", size: 0.9em)
  show link: set text(fill: rgb("#5c3a21"))

  let affiliations = authors.map(a => a.affiliations).flatten().dedup()

  if title != none {
    align(center)[
      #block(below: 0.6em, text(size: 18pt, weight: "bold", title))
      #if subtitle != none { block(below: 0.8em, text(size: 13pt, subtitle)) }
      #if authors.len() > 0 {
        block(below: 0.4em, authors.map(a => {
          a.name
          let marks = a.affiliations.map(x => str(affiliations.position(y => y == x) + 1))
          if affiliations.len() > 1 and marks.len() > 0 { super(marks.join(",")) }
        }).join(", ", last: " and "))
      }
      #if affiliations.len() > 0 {
        set text(size: 9.5pt, style: "italic")
        block(below: 0.4em, if affiliations.len() == 1 { affiliations.first() } else {
          affiliations.enumerate().map(((i, x)) => super(str(i + 1)) + x).join(linebreak())
        })
      }
      #if date != none { block(text(size: 9.5pt, date)) }
    ]
    v(1.2em)
  }

  if abstract != none {
    pad(x: 2em, {
      set text(size: 9.5pt)
      set par(first-line-indent: 0em)
      [*Abstract.* #abstract]
      if keywords.len() > 0 {
        parbreak()
        [*Keywords:* #keywords.join(", ")]
      }
    })
    v(1em)
  }

  body
}
`;

export const TEMPLATES: Record<string, string> = { article: ARTICLE };
