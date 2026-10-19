// A raw Typst file: it skips the MyST AST and goes straight to typst.ts.
#set page(paper: "a5", margin: 2cm)
#set text(lang: "en", region: "gb")

= A Typst sketch

Plain `.typ` files get the full Typst language, for example a quick table:

#table(
  columns: 3,
  [*Drawer*], [*Holds*], [*Count*],
  [Top], [Quills], [12],
  [Middle], [Ink], [3],
)

$ sum_(i=1)^n i = (n(n+1)) / 2 $
