/**
 * The "Try the demo" document. Every link was run through the real checker
 * (Nov 2026) and gives the status noted beside it, so judges see all four
 * graves without bringing their own file.
 */

export const DEMO_FILENAME = 'early-web-communities-sources.md';

export const DEMO_DOCUMENT = `# Sources: Early Web Communities (thesis draft)

## Primary sources

1. Hobbyist home pages: [GeoCities SiliconValley neighborhood](http://www.geocities.com/SiliconValley/), retrieved June 15, 2005.
2. Search behavior is discussed using [AltaVista](http://www.altavista.com/) as the dominant engine (2001).
3. Policy context: [The White House technology agenda](https://www.whitehouse.gov/issues/technology). Retrieved 2014-12-30.
4. Feed reading habits were studied through [Google Reader](https://www.google.com/reader/). Accessed January 10, 2012.
5. Survey responses: Lab of the Early Web (2004). [Project dataset](https://datasets.lab-of-early-web.example/survey-2004.csv).

## Background reading

- [Link rot](https://en.wikipedia.org/wiki/Link_rot) on Wikipedia.
- [Example Domain](https://example.com/), the reserved domain used in documentation.
`;

/*
 * Expected results:
 *   GeoCities   🧟 zombie   now redirects to Yahoo; archived 1999 copy
 *   AltaVista   🧟 zombie   now redirects to Yahoo Search; archived 2001 copy
 *   White House 👻 ghost    404 now; archived 2014-12-30
 *   Google Reader 🪦 lost   404 now; only redirect captures were archived
 *   dataset     🪦 lost     .example never resolves; never archived
 *   Wikipedia, Example Domain 🕯️ living
 */
